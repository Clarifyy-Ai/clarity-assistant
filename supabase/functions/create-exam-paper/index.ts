// create-exam-paper — validate, reserve credits, enqueue job; process async when possible.
import { handleCors, getCorsHeaders, withBrowserCors, applyCors } from "../_shared/cors.ts";
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
import {
  hasCapability,
  requireCapabilityForFunction,
} from "../_shared/requireCapability.ts";
import { creditDenialResponse } from "../_shared/creditAuthority.ts";
import { countEligibleGovQuestions } from "../_shared/govQuestionInventory.ts";
import {
  blockedPlanPayload,
  decideGenerationPlan,
  parseGeneratorPreference,
  planSummary,
} from "../_shared/govGenerationPlan.ts";
import {
  attemptLimitPayload,
  checkGovExamAttemptLimit,
} from "../_shared/govAttemptLimits.ts";
import { isUniqueViolation } from "../_shared/postgresErrors.ts";
import {
  isPythonGovExamConfigured,
  pythonGovAvailability,
  pythonGovProcessJob,
} from "../_shared/pythonGovExamClient.ts";

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

Deno.serve(withBrowserCors("create-exam-paper", async (req) => {
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
      key: createRateLimitKey("create-exam-paper", user.id),
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

    const idempotencyKey =
      String(
        (body as Record<string, unknown>).idempotencyKey ??
          req.headers.get("Idempotency-Key") ??
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
        correlationId,
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

    const { data: profile } = await db
      .from("profiles")
      .select("plan_id, subscription_status, credits")
      .eq("id", user.id)
      .maybeSingle();

    const attemptLimit = await checkGovExamAttemptLimit(db, user.id, profile?.plan_id);
    if (!attemptLimit.allowed) {
      return json(req, attemptLimitPayload(attemptLimit), 429);
    }

    const requestedCountRaw = Number((body as Record<string, unknown>).questionCount);
    const requestedCount =
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

    let available = 0;
    let usedPythonInventory = false;
    if (isPythonGovExamConfigured()) {
      const py = await pythonGovAvailability({
        exam_id: examId,
        stage_id: stageId,
        language,
        question_count: requestedCount,
        topics,
        difficulty,
        correlation_id: correlationId,
      });
      if (py.ok) {
        available = py.data.available;
        usedPythonInventory = true;
        console.log(JSON.stringify({
          tag: "[GOV_EXAM] create_availability_python",
          correlation_id: correlationId,
          available,
          requested: requestedCount,
        }));
      } else {
        console.warn(JSON.stringify({
          tag: "[GOV_EXAM] create_availability_python_fallback",
          correlation_id: correlationId,
          code: py.error.code,
        }));
      }
    }
    if (!usedPythonInventory) {
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
    }

    const pythonConfigured = isPythonGovExamConfigured();
    // Decide bank-only vs AI-assisted before charging anything.
    const plan = decideGenerationPlan({
      requested: requestedCount,
      available,
      mode,
      canUseAi: hasCapability(profile?.plan_id, "gov_exam_ai_fill"),
      generatorPreference: parseGeneratorPreference(body),
      pythonWorkerEnabled:
        pythonConfigured || Deno.env.get("PAPER_FACTORY_WORKER") === "1",
    });

    if (plan.kind === "blocked") {
      const payload = blockedPlanPayload(plan);
      console.log(JSON.stringify({
        tag: "[GOV_EXAM] create_blocked",
        correlation_id: correlationId,
        code: payload.code,
        available,
        requested: requestedCount,
      }));
      return json(req, { ...payload, correlationId }, payload.code === "CAPABILITY_REQUIRED" ? 403 : 409);
    }
    if (plan.kind === "ai_assisted") {
      const capabilityGate = await requireCapabilityForFunction(
        profile?.plan_id,
        "create-exam-paper",
        req,
      );
      if (capabilityGate) return applyCors(req, capabilityGate);
    }

    const creditResult = await deductCreditsAtomic({
      userId: user.id,
      action: "create_mock_test",
      cost: COST,
      idempotencyKey: `gov_paper:${idempotencyKey}`,
    });

    if (!creditResult?.success) {
      return creditDenialResponse(req, creditResult, COST);
    }

    const dispatchPython =
      plan.generator === "python_paper_factory" ||
      plan.kind === "hybrid_deterministic" ||
      (plan.kind === "bank_only" && pythonConfigured);

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
        request_json: {
          ...(body as Record<string, unknown>),
          skipAiFill: plan.skipAiFill,
          allowAiFill: !plan.skipAiFill,
          allowDeterministicFill: plan.allowDeterministicFill,
          generator: dispatchPython && pythonConfigured
            ? "python_paper_factory"
            : plan.generator,
          generationPlan: planSummary(plan),
          correlationId,
        },
        source_mix: {
          bank: plan.bankContribution,
          ai: plan.aiContribution,
          deterministic: plan.deterministicContribution,
          plan_kind: plan.kind,
        },
        missing_count: Math.max(0, plan.requested - plan.available),
        status: "queued",
        progress_stage: "queued",
        idempotency_key: idempotencyKey,
        credits_charged: COST,
        credit_reservation: `gov_paper:${idempotencyKey}`,
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
      if (isUniqueViolation(jobErr)) {
        const { data: replay } = await db
          .from("gov_paper_generation_jobs")
          .select("id, status, mock_test_id, generated_paper_id, error_code, error_message, progress_stage")
          .eq("user_id", user.id)
          .eq("idempotency_key", idempotencyKey)
          .maybeSingle();
        if (replay) {
          return json(req, {
            jobId: replay.id,
            status: replay.status,
            mockTestId: replay.mock_test_id,
            paperId: replay.generated_paper_id,
            errorCode: replay.error_code,
            progressStage: replay.progress_stage,
            idempotentReplay: true,
            correlationId,
          }, replay.status === "completed" ? 200 : 202);
        }
      }
      console.error("[create-exam-paper] job insert:", jobErr);
      await refundCredits({
        userId: user.id,
        cost: COST,
        reason: "refund_create_exam_paper_job",
      }).catch(() => {});
      return json(req, {
        error: "Failed to create job",
        code: "PAPER_GENERATION_FAILED",
        correlationId,
      }, 500);
    }

    const jobId = job.id as string;
    const workerId = newWorkerId("create");

    console.log(JSON.stringify({
      tag: "[GOV_EXAM] job_enqueued",
      correlation_id: correlationId,
      job_id: jobId,
      generator: dispatchPython && pythonConfigured
        ? "python_paper_factory"
        : plan.generator,
      plan_kind: plan.kind,
    }));

    // Invoke Render FastAPI so jobs are not left only for DB polling.
    if (dispatchPython && pythonConfigured) {
      const dispatch = pythonGovProcessJob({
        job_id: jobId,
        correlation_id: correlationId,
      }).then((res) => {
        console.log(JSON.stringify({
          tag: "[GOV_EXAM] process_job_dispatched",
          correlation_id: correlationId,
          job_id: jobId,
          ok: res.ok,
          code: res.ok ? "accepted" : res.error.code,
        }));
      }).catch((err) => {
        console.error(JSON.stringify({
          tag: "[GOV_EXAM] process_job_dispatch_error",
          correlation_id: correlationId,
          job_id: jobId,
          error: err instanceof Error ? err.message : String(err),
        }));
      });

      // Prefer waitUntil so we can 202 immediately; if unavailable, await so the
      // isolate does not freeze before the HMAC fetch reaches Render.
      if (!scheduleWithWaitUntil(dispatch)) {
        await dispatch;
      }

      return json(req, {
        jobId,
        status: "queued",
        progressStage: "queued",
        creditsCharged: COST,
        balanceAfter: creditResult.balanceAfter,
        generationPlan: planSummary({
          ...plan,
          generator: "python_paper_factory",
        }),
        async: true,
        correlationId,
        code: "JOB_QUEUED",
      }, 202);
    }

    // Python preferred by plan but HTTP not configured — leave queued for DB worker.
    if (plan.generator === "python_paper_factory") {
      return json(req, {
        jobId,
        status: "queued",
        progressStage: "queued",
        creditsCharged: COST,
        balanceAfter: creditResult.balanceAfter,
        generationPlan: planSummary(plan),
        async: true,
        correlationId,
        code: "JOB_QUEUED",
      }, 202);
    }

    const runJob = () =>
      processPaperGenerationJobById(jobId, { workerId, userId: user.id });

    const scheduled = scheduleWithWaitUntil(runJob());
    if (scheduled) {
      return json(req, {
        jobId,
        status: "queued",
        progressStage: "queued",
        creditsCharged: COST,
        balanceAfter: creditResult.balanceAfter,
        generationPlan: planSummary(plan),
        async: true,
        correlationId,
        code: "JOB_QUEUED",
      }, 202);
    }

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
        generationPlan: planSummary(plan),
        async: false,
        correlationId,
        code: "COMPLETED",
      }, 202);
    }

    if (result.status === "cancelled") {
      return json(req, {
        jobId,
        status: "cancelled",
        errorCode: result.errorCode,
        error: result.error,
        async: false,
        correlationId,
        code: result.errorCode,
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
      correlationId,
      code: result.errorCode,
    }, result.httpStatus ?? 500);
  } catch (err) {
    console.error("[create-exam-paper] Error:", err);
    return json(req, {
      error: "Internal server error",
      code: "INTERNAL_ERROR",
      correlationId,
    }, 500);
  }
}));
