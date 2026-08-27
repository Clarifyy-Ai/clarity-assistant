/**
 * check-exam-paper-availability — server-authoritative inventory preflight.
 * Does NOT charge credits or create a generation job.
 * Prefers Python availability when configured; falls back to Edge bank count.
 */
import { handleCors, getCorsHeaders, withBrowserCors, applyCors } from "../_shared/cors.ts";
import { authenticateRequest } from "../_shared/auth.ts";
import { createServiceClient } from "../_shared/supabase.ts";
import {
  checkRateLimitAsync,
  createRateLimitKey,
  rateLimitResponse,
  RATE_LIMIT_PRESETS,
} from "../_shared/rateLimit.ts";
import { isUserBanned, bannedResponse } from "../_shared/banCheck.ts";
import { countEligibleGovQuestions } from "../_shared/govQuestionInventory.ts";
import { hasCapability } from "../_shared/requireCapability.ts";
import {
  decideGenerationPlan,
  parseGeneratorPreference,
  planSummary,
} from "../_shared/govGenerationPlan.ts";
import {
  isPythonGovExamConfigured,
  pythonGovAvailability,
} from "../_shared/pythonGovExamClient.ts";
import {
  clampGovQuestionCount,
  GOV_QUESTION_COUNT_ABS_MAX,
} from "../_shared/govQuestionCount.ts";

function json(req: Request, payload: unknown, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { ...getCorsHeaders(req), "Content-Type": "application/json" },
  });
}

function uuidOrNull(v: unknown): string | null {
  if (typeof v !== "string") return null;
  const s = v.trim();
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(s)
    ? s
    : null;
}

Deno.serve(withBrowserCors("check-exam-paper-availability", async (req) => {
  const cors = handleCors(req);
  if (cors) return cors;

  const db = createServiceClient();
  const correlationId = req.headers.get("x-request-id")?.trim() || crypto.randomUUID();

  try {
    const auth = await authenticateRequest(req);
    if (auth.error) return applyCors(req, auth.error);
    const user = auth.context.user;

    if (await isUserBanned(db, user.id)) {
      return bannedResponse(getCorsHeaders(req));
    }

    const rateLimitResult = await checkRateLimitAsync(db, {
      key: createRateLimitKey("check-exam-paper-availability", user.id),
      ...RATE_LIMIT_PRESETS.SESSION_ACTION,
    });
    if (!rateLimitResult.allowed) {
      return rateLimitResponse(rateLimitResult, req);
    }

    const body = await req.json().catch(() => null);
    if (!body || typeof body !== "object") {
      return json(req, { error: "Invalid JSON body", code: "BAD_REQUEST" }, 400);
    }

    const examId = uuidOrNull((body as Record<string, unknown>).examId);
    const stageId = uuidOrNull((body as Record<string, unknown>).stageId);
    if (!examId || !stageId) {
      return json(req, {
        error: "examId and stageId are required UUIDs",
        code: "VALIDATION_ERROR",
      }, 400);
    }

    const modeRaw = String((body as Record<string, unknown>).mode ?? "custom_mock");
    const mode = (
      ["official_previous", "generated_mock", "custom_mock", "adaptive"].includes(modeRaw)
        ? modeRaw
        : "custom_mock"
    ) as "official_previous" | "generated_mock" | "custom_mock" | "adaptive";

    const language = String((body as Record<string, unknown>).language ?? "en")
      .trim()
      .slice(0, 8) || "en";

    const { data: exam, error: examErr } = await db
      .from("gov_exams")
      .select("id, code, name, legacy_exam_type, review_state, is_public")
      .eq("id", examId)
      .maybeSingle();

    if (examErr || !exam) {
      return json(req, { error: "Exam not found", code: "EXAM_NOT_FOUND" }, 404);
    }
    if (exam.review_state !== "approved" || !exam.is_public) {
      return json(req, {
        error: "Exam is not available",
        code: "EXAM_NOT_AVAILABLE",
      }, 409);
    }

    const { data: pattern } = await db
      .from("gov_exam_pattern_versions")
      .select("id, total_questions, languages, duration_minutes, negative_mark, total_marks")
      .eq("exam_id", examId)
      .eq("stage_id", stageId)
      .eq("review_state", "approved")
      .order("effective_date", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (!pattern) {
      return json(req, {
        error: "Approved pattern not available",
        code: "INVALID_CONFIGURATION",
      }, 409);
    }

    const langs: string[] = Array.isArray(pattern.languages) ? pattern.languages : ["en"];
    if (!langs.includes(language) && language !== "en") {
      return json(req, {
        error: "Language not supported for this pattern",
        code: "INVALID_CONFIGURATION",
      }, 400);
    }

    const requestedCountRaw = (body as Record<string, unknown>).questionCount;
    const requested =
      mode === "custom_mock"
        ? clampGovQuestionCount(requestedCountRaw, GOV_QUESTION_COUNT_ABS_MAX)
        : Number(pattern.total_questions) || 0;

    const topics = Array.isArray((body as Record<string, unknown>).topics)
      ? ((body as Record<string, unknown>).topics as unknown[])
        .map((t) => String(t).trim())
        .filter(Boolean)
        .slice(0, 20)
      : [];

    const difficultyRaw = String((body as Record<string, unknown>).difficulty ?? "").toUpperCase();
    const difficulty =
      difficultyRaw === "EASY" || difficultyRaw === "MEDIUM" || difficultyRaw === "HARD"
        ? difficultyRaw
        : null;

    console.log(JSON.stringify({
      tag: "[GOV_EXAM] availability_started",
      correlation_id: correlationId,
      exam_id: examId,
      stage_id: stageId,
      requested,
    }));

    let available = 0;
    let examTypeKeys: string[] = [];
    let inventorySource: "python" | "edge_bank" = "edge_bank";

    if (isPythonGovExamConfigured()) {
      const py = await pythonGovAvailability({
        exam_id: examId,
        stage_id: stageId,
        language,
        question_count: requested,
        topics,
        difficulty,
        correlation_id: correlationId,
      });
      if (py.ok) {
        available = py.data.available;
        examTypeKeys = py.data.exam_type_keys ?? [];
        inventorySource = "python";
        console.log(JSON.stringify({
          tag: "[GOV_EXAM] availability_python",
          correlation_id: correlationId,
          available,
          requested: py.data.requested,
          can_full_mock: py.data.can_full_mock,
        }));
      } else {
        console.warn(JSON.stringify({
          tag: "[GOV_EXAM] availability_python_fallback",
          correlation_id: correlationId,
          code: py.error.code,
          message: py.error.message.slice(0, 160),
        }));
      }
    }

    if (inventorySource === "edge_bank") {
      const inventory = await countEligibleGovQuestions(db, {
        exam: {
          code: exam.code as string | null,
          name: exam.name as string | null,
          legacy_exam_type: exam.legacy_exam_type as string | null,
        },
        language,
        topics: topics.length ? topics : null,
        difficulty,
      });
      available = inventory.available;
      examTypeKeys = inventory.examTypeKeys;
    }

    const { data: profile } = await db
      .from("profiles")
      .select("plan_id")
      .eq("id", user.id)
      .maybeSingle();

    const aiFillAllowed = hasCapability(profile?.plan_id, "gov_exam_ai_fill");
    const pythonConfigured = isPythonGovExamConfigured();
    const plan = decideGenerationPlan({
      requested,
      available,
      mode,
      canUseAi: aiFillAllowed,
      generatorPreference: parseGeneratorPreference(body),
      pythonWorkerEnabled:
        pythonConfigured || Deno.env.get("PAPER_FACTORY_WORKER") === "1",
    });

    const missing = Math.max(0, requested - available);
    // P0-02: Full Mock fail-closed — bank coverage or explicit AI fill only.
    // Never unlock via pythonConfigured / hybrid_deterministic heuristics.
    const fullMockInventoryOk =
      available >= requested || aiFillAllowed;
    const fullMockAllowed = plan.kind !== "blocked" &&
      (mode === "generated_mock" || mode === "official_previous"
        ? fullMockInventoryOk && plan.kind !== "hybrid_deterministic"
        : true);
    const canCustomPractice = available >= 5;
    const customPracticeMax = Math.min(available, 200);
    // Treat hybrid-only Full Mock as blocked for honest Custom Practice UX.
    const hybridFullMockBlocked =
      (mode === "generated_mock" || mode === "official_previous") &&
      plan.kind === "hybrid_deterministic" &&
      !fullMockInventoryOk;
    const blocked = plan.kind === "blocked" || hybridFullMockBlocked;
    const blockCode = blocked
      ? (plan.kind === "blocked" && plan.reasonCode === "CAPABILITY_REQUIRED" && !hybridFullMockBlocked
        ? "CAPABILITY_REQUIRED"
        : "CONTENT_INSUFFICIENT")
      : null;

    const message = blocked
      ? blockCode === "CAPABILITY_REQUIRED"
        ? `Available: ${available}. Requested: ${requested}. Missing: ${missing}. ` +
          `Full mock needs a plan that includes generation, or choose custom practice (max ${customPracticeMax}).`
        : `Available: ${available}. Requested: ${requested}. Missing: ${missing}. ` +
          `Not enough approved questions for a full mock. Custom practice is limited to ${customPracticeMax}.`
      : missing > 0 && aiFillAllowed
      ? `Available: ${available}. Requested: ${requested}. Missing: ${missing} will be filled during generation.`
      : `Available: ${available}. Requested: ${requested}.`;

    console.log(JSON.stringify({
      tag: "[GOV_EXAM] availability_completed",
      correlation_id: correlationId,
      source: inventorySource,
      available,
      requested,
      missing,
      blocked,
      block_code: blockCode,
    }));

    return json(req, {
      success: true,
      examId,
      stageId,
      language,
      mode,
      requested,
      available,
      missing,
      examTypeKeys,
      pattern: {
        totalQuestions: pattern.total_questions,
        totalMarks: Number(pattern.total_marks),
        durationMinutes: pattern.duration_minutes,
        negativeMark: Number(pattern.negative_mark),
        languages: langs,
      },
      fullMockAllowed,
      can_full_mock: fullMockAllowed,
      can_custom_practice: canCustomPractice,
      canCustomPractice,
      customPracticeMax,
      custom_practice_max: customPracticeMax,
      aiFillAllowed,
      generationPlan: planSummary(
        hybridFullMockBlocked
          ? {
            ...plan,
            kind: "blocked",
            reasonCode: "CONTENT_INSUFFICIENT",
            skipAiFill: true,
            allowDeterministicFill: false,
            deterministicContribution: 0,
            aiContribution: 0,
          }
          : plan,
      ),
      blocked,
      blockCode,
      code: blockCode,
      message,
      correlationId,
    });
  } catch (err) {
    console.error("[GOV_EXAM] availability_failed", {
      correlation_id: correlationId,
      error: err instanceof Error ? err.message : String(err),
    });
    return json(req, {
      success: false,
      code: "SERVICE_UNAVAILABLE",
      error: "Availability check is temporarily unavailable.",
      correlationId,
    }, 503);
  }
}));
