// create-exam-paper — validate, reserve credits, enqueue job; process async when possible.
import { handleCors, getCorsHeaders } from "../_shared/cors.ts";
import { authenticateRequest } from "../_shared/auth.ts";
import { createServiceClient, deductCreditsAtomic, refundCredits } from "../_shared/supabase.ts";
import { creditCost } from "../_shared/creditEconomics.ts";
import {
  checkRateLimitAsync,
  createRateLimitKey,
  rateLimitResponse,
  RATE_LIMIT_PRESETS,
} from "../_shared/rateLimit.ts";
import { isUserBanned, bannedResponse } from "../_shared/banCheck.ts";
import { type PatternSection } from "../_shared/govBlueprint.ts";
import {
  processPaperGenerationJobById,
  scheduleWithWaitUntil,
} from "../_shared/govPaperAssembly.ts";
import { newWorkerId } from "../_shared/govPaperJobLease.ts";

const COST = creditCost("create_mock_test");

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

Deno.serve(async (req) => {
  const cors = handleCors(req);
  if (cors) return cors;

  const db = createServiceClient();

  try {
    const auth = await authenticateRequest(req);
    if (auth.error) return auth.error;
    const user = auth.context.user;

    if (await isUserBanned(db, user.id)) {
      return bannedResponse(getCorsHeaders(req));
    }

    const rateLimitResult = await checkRateLimitAsync(db, {
      key: createRateLimitKey("create-exam-paper", user.id),
      ...RATE_LIMIT_PRESETS.SESSION_ACTION,
    });
    if (!rateLimitResult.allowed) {
      return rateLimitResponse(rateLimitResult);
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

    const idempotencyKey =
      String(
        (body as Record<string, unknown>).idempotencyKey ??
          req.headers.get("x-idempotency-key") ??
          "",
      ).trim().slice(0, 120) || crypto.randomUUID();

    const randomSeed =
      String((body as Record<string, unknown>).randomSeed ?? "").trim().slice(0, 120) ||
      idempotencyKey;

    // Idempotent replay
    const { data: existing } = await db
      .from("gov_paper_generation_jobs")
      .select("id, status, mock_test_id, generated_paper_id, error_code, error_message, progress_stage")
      .eq("user_id", user.id)
      .eq("idempotency_key", idempotencyKey)
      .maybeSingle();

    if (existing) {
      return json(req, {
        jobId: existing.id,
        status: existing.status,
        mockTestId: existing.mock_test_id,
        paperId: existing.generated_paper_id,
        errorCode: existing.error_code,
        progressStage: existing.progress_stage,
        idempotentReplay: true,
      }, existing.status === "completed" ? 200 : 202);
    }

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
        error: "Exam version is not approved for public use",
        code: "EXAM_VERSION_NOT_APPROVED",
      }, 409);
    }

    const { data: pattern, error: patErr } = await db
      .from("gov_exam_pattern_versions")
      .select("*")
      .eq("exam_id", examId)
      .eq("stage_id", stageId)
      .eq("review_state", "approved")
      .order("effective_date", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (patErr || !pattern) {
      return json(req, {
        error: "Approved pattern not available",
        code: "PATTERN_NOT_AVAILABLE",
      }, 409);
    }

    const langs: string[] = Array.isArray(pattern.languages) ? pattern.languages : ["en"];
    if (!langs.includes(language) && language !== "en") {
      return json(req, {
        error: "Language not supported for this pattern",
        code: "LANGUAGE_NOT_SUPPORTED",
      }, 400);
    }

    const { data: sectionsRows } = await db
      .from("gov_exam_sections")
      .select("code, name, question_count, marks, sort_order")
      .eq("pattern_version_id", pattern.id)
      .order("sort_order", { ascending: true });

    const sections: PatternSection[] = (sectionsRows ?? []).map((s) => ({
      code: s.code,
      name: s.name,
      question_count: s.question_count,
      marks: Number(s.marks),
    }));

    if (sections.length === 0) {
      return json(req, {
        error: "Pattern sections missing",
        code: "PATTERN_NOT_AVAILABLE",
      }, 409);
    }

    const { data: syllabus } = await db
      .from("gov_exam_syllabus_versions")
      .select("id, version")
      .eq("exam_id", examId)
      .eq("stage_id", stageId)
      .eq("review_state", "approved")
      .order("effective_date", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (!syllabus && mode !== "custom_mock") {
      return json(req, {
        error: "Approved syllabus not available",
        code: "SYLLABUS_NOT_AVAILABLE",
      }, 409);
    }

    const creditResult = await deductCreditsAtomic({
      userId: user.id,
      action: "create_mock_test",
      cost: COST,
      idempotencyKey: `gov_paper:${idempotencyKey}`,
    });

    if (!creditResult?.success) {
      return json(req, {
        error: "Insufficient credits",
        code: "INSUFFICIENT_CREDITS",
      }, 402);
    }

    const { data: job, error: jobErr } = await db
      .from("gov_paper_generation_jobs")
      .insert({
        user_id: user.id,
        exam_id: examId,
        stage_id: stageId,
        pattern_version_id: pattern.id,
        syllabus_version_id: syllabus?.id ?? null,
        mode,
        language,
        request_json: body,
        status: "queued",
        progress_stage: "queued",
        idempotency_key: idempotencyKey,
        credits_charged: COST,
        random_seed: randomSeed,
        attempt_count: 0,
        retryable: true,
        worker_id: null,
        lease_expires_at: null,
        started_at: new Date().toISOString(),
      })
      .select("id")
      .single();

    if (jobErr || !job) {
      console.error("[create-exam-paper] job insert:", jobErr);
      await refundCredits({
        userId: user.id,
        cost: COST,
        reason: "refund_create_exam_paper_job",
      }).catch(() => {});
      return json(req, { error: "Failed to create job", code: "PAPER_GENERATION_FAILED" }, 500);
    }

    const jobId = job.id as string;
    const workerId = newWorkerId("create");

    const runJob = () =>
      processPaperGenerationJobById(jobId, { workerId, userId: user.id });

    // Prefer background processing via EdgeRuntime.waitUntil; fall back to inline.
    const scheduled = scheduleWithWaitUntil(runJob());
    if (scheduled) {
      return json(req, {
        jobId,
        status: "queued",
        progressStage: "queued",
        creditsCharged: COST,
        async: true,
      }, 202);
    }

    // Backward compatible: process inline when waitUntil is unavailable.
    const result = await runJob();
    if (result.ok) {
      return json(req, {
        jobId,
        status: "completed",
        mockTestId: result.mockTestId,
        paperId: result.paperId,
        questionCount: result.questionCount,
        paperClass: result.paperClass,
        disclaimer: result.disclaimer,
        patternVersion: result.patternVersion,
        syllabusVersion: result.syllabusVersion,
        creditsCharged: COST,
        async: false,
      }, 202);
    }

    if (result.status === "cancelled") {
      return json(req, {
        jobId,
        status: "cancelled",
        errorCode: result.errorCode,
        error: result.error,
        async: false,
      }, 202);
    }

    return json(req, {
      jobId,
      status: "failed",
      errorCode: result.errorCode,
      error: result.error,
      available: result.available,
      required: result.required,
      async: false,
    }, result.httpStatus ?? 500);
  } catch (err) {
    console.error("[create-exam-paper] Error:", err);
    return json(req, { error: "Internal server error", code: "INTERNAL_ERROR" }, 500);
  }
});
