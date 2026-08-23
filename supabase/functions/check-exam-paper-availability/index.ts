/**
 * check-exam-paper-availability — server-authoritative inventory preflight.
 * Does NOT charge credits or create a generation job.
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
  planSummary,
} from "../_shared/govGenerationPlan.ts";

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

    const requestedCountRaw = Number((body as Record<string, unknown>).questionCount);
    const requested =
      mode === "custom_mock" && Number.isFinite(requestedCountRaw)
        ? Math.min(200, Math.max(5, Math.floor(requestedCountRaw)))
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

    const { data: profile } = await db
      .from("profiles")
      .select("plan_id")
      .eq("id", user.id)
      .maybeSingle();

    const aiFillAllowed = hasCapability(profile?.plan_id, "gov_exam_ai_fill");
    const plan = decideGenerationPlan({
      requested,
      available: inventory.available,
      mode,
      canUseAi: aiFillAllowed,
      preferPythonFactory: Deno.env.get("PAPER_FACTORY_WORKER") === "1",
    });

    const missing = Math.max(0, requested - inventory.available);
    const fullMockAllowed = plan.kind !== "blocked" &&
      (mode === "generated_mock" || mode === "official_previous"
        ? inventory.available >= requested || aiFillAllowed
        : true);
    const customPracticeMax = Math.min(inventory.available, 200);

    return json(req, {
      success: true,
      examId,
      stageId,
      language,
      mode,
      requested,
      available: inventory.available,
      missing,
      examTypeKeys: inventory.examTypeKeys,
      pattern: {
        totalQuestions: pattern.total_questions,
        totalMarks: Number(pattern.total_marks),
        durationMinutes: pattern.duration_minutes,
        negativeMark: Number(pattern.negative_mark),
        languages: langs,
      },
      fullMockAllowed,
      customPracticeMax,
      aiFillAllowed,
      generationPlan: planSummary(plan),
      blocked: plan.kind === "blocked",
      blockCode: plan.kind === "blocked" ? plan.reasonCode ?? "QUESTION_INSUFFICIENT" : null,
      message:
        plan.kind === "blocked"
          ? `Available: ${inventory.available}. Requested: ${requested}. Missing: ${missing}. Full mock is disabled.`
          : missing > 0 && aiFillAllowed
            ? `Available: ${inventory.available}. Requested: ${requested}. Missing: ${missing} will use approved AI generation.`
            : `Available: ${inventory.available}. Requested: ${requested}.`,
    });
  } catch (err) {
    console.error("[check-exam-paper-availability]", err);
    return json(req, {
      success: false,
      code: "SERVICE_UNAVAILABLE",
      error: "Availability check is temporarily unavailable.",
    }, 503);
  }
}));
