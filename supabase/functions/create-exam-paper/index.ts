// create-exam-paper — validate, reserve credits, enqueue job; process async when possible.
import { handleCors, getCorsHeaders, withBrowserCors, applyCors } from "../_shared/cors.ts";
import { withTimeout } from "../_shared/withTimeout.ts";
import { authenticateRequest } from "../_shared/auth.ts";
import { createServiceClient } from "../_shared/supabase.ts";
import { creditCost } from "../_shared/creditEconomics.ts";
import {
  checkRateLimitAsyncWithLocalFallback,
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
import {
  createReservedPaperJob,
  preflightSpendableCredits,
  refundClaimedPaperCredits,
} from "../_shared/claimJobCredits.ts";
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
import {
  isPythonGovExamConfigured,
  pythonGovAvailability,
  pythonGovHealth,
  pythonGovProcessJob,
  wantsPythonPaperFactoryGenerator,
} from "../_shared/pythonGovExamClient.ts";
import { decideRoute } from "../_shared/operationRouter.ts";
import { isPythonForceUnavailable } from "../_shared/pythonClient.ts";
import { AUTH_LOOKUP_TIMEOUT_MS, PROFILE_LOOKUP_TIMEOUT_MS, resolveIsIndiaProfile } from "../_shared/indiaRegion.ts";
import {
  clampGovQuestionCount,
  GOV_QUESTION_COUNT_ABS_MAX,
  validateGovQuestionCount,
} from "../_shared/govQuestionCount.ts";

const COST = creditCost("create_mock_test");

/**
 * Durable paper jobs are hybrid-by-plan (MATRIX `gov_exam_assemble`), not
 * request-scoped `executeHybridOperation`. We consult `decideRoute` for live
 * capability flags (AI/Python force-unavailable) before `decideGenerationPlan`.
 */

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
  let creditsChargedForJob = false;
  let reservedJobId: string | null = null;
  let reservedUserId: string | null = null;

  try {
    let auth: Awaited<ReturnType<typeof authenticateRequest>>;
    try {
      auth = await withTimeout(authenticateRequest(req), AUTH_LOOKUP_TIMEOUT_MS);
    } catch {
      return json(req, {
        error: "Authentication timed out.",
        code: "AUTH_TIMEOUT",
      }, 503);
    }
    if (auth.error) return applyCors(req, auth.error);
    const user = auth.context.user;
    reservedUserId = user.id;

    let banned = false;
    try {
      banned = await withTimeout(isUserBanned(db, user.id), PROFILE_LOOKUP_TIMEOUT_MS);
    } catch {
      return json(req, {
        error: "Account status lookup timed out.",
        code: "PROFILE_LOOKUP_TIMEOUT",
      }, 503);
    }
    if (banned) {
      return bannedResponse(getCorsHeaders(req));
    }

    const rateLimitResult = await checkRateLimitAsyncWithLocalFallback(db, {
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
        error: "This exam paper is not available in the selected language.",
        code: "LANGUAGE_UNAVAILABLE",
      }, 409);
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

    let profile: {
      plan_id?: string | null;
      subscription_status?: string | null;
      credits?: number | null;
      region?: string | null;
      timezone?: string | null;
      locale?: string | null;
    } | null = null;
    try {
      const result = await withTimeout(
        db
          .from("profiles")
          .select("plan_id, subscription_status, credits, region, timezone, locale")
          .eq("id", user.id)
          .maybeSingle(),
        PROFILE_LOOKUP_TIMEOUT_MS,
      );
      profile = result.data;
    } catch {
      return json(req, {
        error: "Profile lookup timed out.",
        code: "PROFILE_LOOKUP_TIMEOUT",
      }, 503);
    }

    if (!resolveIsIndiaProfile(profile)) {
      return json(req, {
        error: "Government exams are available for India accounts.",
        code: "REGION_RESTRICTED",
      }, 403);
    }

    const attemptLimit = await checkGovExamAttemptLimit(db, user.id, profile?.plan_id);
    if (!attemptLimit.allowed) {
      return json(req, attemptLimitPayload(attemptLimit), 429);
    }

    const requestedCountRaw = (body as Record<string, unknown>).questionCount;
    let requestedCount: number;
    if (mode === "custom_mock") {
      const qc = validateGovQuestionCount(requestedCountRaw, GOV_QUESTION_COUNT_ABS_MAX);
      if (!qc.ok) {
        return json(req, { error: qc.error, code: qc.code }, 400);
      }
      requestedCount = qc.value;
    } else {
      requestedCount = Number(pattern.total_questions) || 0;
    }

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
    let inventorySnapshot: Record<string, unknown> | null = null;
    let inventoryVersion: string | null = null;

    const inventory = await countEligibleGovQuestions(db, {
      examId,
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
    inventorySnapshot = inventory.inventorySnapshot ?? {
      available: inventory.available,
      exam_type_keys: inventory.examTypeKeys,
    };
    inventoryVersion = inventory.inventoryVersion ?? "gov_inventory_v1";

    if (isPythonGovExamConfigured()) {
      const py = await pythonGovAvailability({
        exam_id: examId,
        stage_id: stageId,
        language,
        question_count: requestedCount,
        topics,
        difficulty,
        correlation_id: correlationId,
        bank_type_keys: inventory.examTypeKeys,
      });
      if (py.ok) {
        available = py.data.available;
        inventorySnapshot = {
          ...(inventorySnapshot ?? {}),
          available: py.data.available,
          python_available: py.data.available,
          requested: py.data.requested,
          can_full_mock: py.data.can_full_mock,
          can_custom_practice: py.data.can_custom_practice,
          custom_practice_max: py.data.custom_practice_max,
          source: "python",
        };
        console.log(JSON.stringify({
          tag: "[GOV_EXAM] create_availability_python_authoritative",
          correlation_id: correlationId,
          canonical_available: inventory.available,
          python_available: py.data.available,
          requested: requestedCount,
        }));
      } else {
        console.warn(JSON.stringify({
          tag: "[GOV_EXAM] create_availability_python_skipped",
          correlation_id: correlationId,
          code: py.error.code,
        }));
      }
    }

    const pythonConfigured = isPythonGovExamConfigured();
    const paperFactoryWorkerEnabled = Deno.env.get("PAPER_FACTORY_WORKER") === "1";
    const generatorPreference = parseGeneratorPreference(body);
    // MATRIX gov_exam_assemble: preferredOrder database → python → ai (AI optional).
    // Durable path is hybrid-by-plan — consult decideRoute for force-unavailable flags.
    const assembleRoute = decideRoute({ operation: "gov_exam_assemble" });
    // Decide bank-only vs AI-assisted before charging anything.
    const plan = decideGenerationPlan({
      requested: requestedCount,
      available,
      mode,
      canUseAi:
        hasCapability(profile?.plan_id, "gov_exam_ai_fill") &&
        assembleRoute.canUseAI,
      generatorPreference,
      // Use gov-exam client config (may differ from PYTHON_SERVICE_URL).
      // Honor HYBRID_FORCE_PYTHON_UNAVAILABLE without requiring generic hybrid URL.
      pythonWorkerEnabled:
        !isPythonForceUnavailable() &&
        (pythonConfigured || paperFactoryWorkerEnabled),
    });

    // P0-02: Full Mock credit fail-closed — never charge for hybrid_deterministic
    // fill when the approved bank is short and AI fill is not allowed.
    const fullMockShortWithoutAi =
      (mode === "generated_mock" || mode === "official_previous") &&
      available < requestedCount &&
      plan.kind === "hybrid_deterministic";

    if (plan.kind === "blocked" || fullMockShortWithoutAi) {
      const payload = blockedPlanPayload(
        fullMockShortWithoutAi
          ? {
            ...plan,
            kind: "blocked",
            reasonCode: "CONTENT_INSUFFICIENT",
            skipAiFill: true,
            allowDeterministicFill: false,
            deterministicContribution: 0,
            aiContribution: 0,
            maxCustomSetSize: available,
          }
          : plan,
      );
      console.log(JSON.stringify({
        tag: "[GOV_EXAM] create_blocked",
        correlation_id: correlationId,
        code: payload.code,
        available,
        requested: requestedCount,
        hybrid_fail_closed: fullMockShortWithoutAi,
      }));
      return json(req, { ...payload, correlationId }, payload.code === "PLAN_NOT_ALLOWED" || payload.code === "CAPABILITY_REQUIRED" ? 403 : 409);
    }
    if (plan.kind === "ai_assisted") {
      const capabilityGate = await requireCapabilityForFunction(
        profile?.plan_id,
        "create-exam-paper",
        req,
      );
      if (capabilityGate) return applyCors(req, capabilityGate);
    }

    const creditPreflight = await preflightSpendableCredits(db, user.id, COST);
    if (!creditPreflight.ok) {
      return creditDenialResponse(req, creditPreflight.denial ?? { success: false }, COST);
    }

    // CRITICAL FIX (SE-006): Create job BEFORE deducting credits.
    // This ensures credits are only deducted when the job is guaranteed to exist.
    // If job creation fails, no credits are deducted → no orphaned charges.
    
    // Tag for Python poller whenever preferred/configured — even if HTTP dispatch
    // is unavailable (PAPER_FACTORY_WORKER DB claim path).
    const usePythonFactory = wantsPythonPaperFactoryGenerator({
      planGenerator: plan.generator,
      planKind: plan.kind,
      generatorPreference,
      pythonHttpConfigured: pythonConfigured,
      paperFactoryWorkerEnabled,
    });

    if (usePythonFactory && !pythonConfigured && !paperFactoryWorkerEnabled) {
      return json(req, {
        error:
          "Paper generation service is not configured. Please try again later.",
        code: "WORKER_UNAVAILABLE",
        correlationId,
      }, 503);
    }

    if (usePythonFactory && pythonConfigured && !paperFactoryWorkerEnabled) {
      const health = await pythonGovHealth(correlationId);
      if (!health.ok) {
        console.warn(JSON.stringify({
          tag: "[GOV_EXAM] python_health_failed_precreate",
          correlation_id: correlationId,
          code: health.error.code,
        }));
        return json(req, {
          error:
            "Paper generation service is temporarily unavailable. Please try again in a few minutes.",
          code: "WORKER_UNAVAILABLE",
          correlationId,
        }, 503);
      }
    }

    const taggedGenerator = usePythonFactory
      ? "python_paper_factory"
      : plan.generator;

    const reserved = await createReservedPaperJob(db, {
      userId: user.id,
      examId,
      stageId,
      patternVersionId: pattern.id,
      syllabusVersionId: syllabus?.id ?? null,
      mode,
      language,
      requestJson: {
        ...(body as Record<string, unknown>),
        skipAiFill: plan.skipAiFill,
        allowAiFill: !plan.skipAiFill,
        allowDeterministicFill: plan.allowDeterministicFill,
        generator: taggedGenerator,
        generationPlan: planSummary({ ...plan, generator: taggedGenerator }),
        correlationId,
      },
      sourceMix: {
        bank: plan.bankContribution,
        ai: plan.aiContribution,
        deterministic: plan.deterministicContribution,
        plan_kind: plan.kind,
      },
      missingCount: Math.max(0, plan.requested - plan.available),
      idempotencyKey,
      cost: COST,
      randomSeed,
      inventorySnapshot,
      inventoryVersion,
      status: "checking_availability",
      progressStage: "checking_availability",
    });

    if (!reserved.success) {
      console.error("[create-exam-paper] atomic enqueue failed:", reserved.denial);
      return creditDenialResponse(req, reserved.denial, COST);
    }
    if (reserved.idempotentReplay) {
      return json(req, {
        jobId: reserved.jobId,
        status: reserved.status,
        progressStage: reserved.progressStage,
        mockTestId: reserved.mockTestId,
        paperId: reserved.paperId,
        idempotentReplay: true,
        correlationId,
      }, reserved.status === "completed" ? 200 : 202);
    }

    creditsChargedForJob = true;
    reservedJobId = reserved.jobId;
    const balanceAfter = reserved.balanceAfter;

    const jobId = reserved.jobId;
    const workerId = newWorkerId("create");

    console.log(JSON.stringify({
      tag: "[GOV_EXAM] job_enqueued",
      correlation_id: correlationId,
      job_id: jobId,
      generator: taggedGenerator,
      plan_kind: plan.kind,
    }));

    // Invoke Render FastAPI so jobs are not left only for DB polling.
    if (usePythonFactory && pythonConfigured) {
      const dispatch = await pythonGovProcessJob({
        job_id: jobId,
        correlation_id: correlationId,
      }).catch((err) => {
        console.error(JSON.stringify({
          tag: "[GOV_EXAM] process_job_dispatch_error",
          correlation_id: correlationId,
          job_id: jobId,
          error: err instanceof Error ? err.message : String(err),
        }));
        return { ok: false as const, error: { code: "PYTHON_NETWORK_ERROR", message: String(err), retryable: true } };
      });

      console.log(JSON.stringify({
        tag: "[GOV_EXAM] process_job_dispatched",
        correlation_id: correlationId,
        job_id: jobId,
        ok: dispatch.ok,
        code: dispatch.ok ? "accepted" : dispatch.error.code,
      }));

      if (dispatch.ok) {
        if (dispatch.data.status === "completed" && dispatch.data.mock_test_id) {
          return json(req, {
            jobId,
            status: "completed",
            mockTestId: dispatch.data.mock_test_id,
            paperId: dispatch.data.paper_id,
            creditsCharged: COST,
            balanceAfter,
            generationPlan: planSummary({
              ...plan,
              generator: "python_paper_factory",
            }),
            async: false,
            correlationId,
            code: "COMPLETED",
          }, 202);
        }
        return json(req, {
          jobId,
          status: "queued",
          progressStage: "queued",
          creditsCharged: COST,
          balanceAfter,
          generationPlan: planSummary({
            ...plan,
            generator: "python_paper_factory",
          }),
          async: true,
          correlationId,
          code: "JOB_QUEUED",
        }, 202);
      }

      // Python timed out while still owning the job — do NOT retag to Edge.
      // Only fall through to Edge assembly when Python is unreachable.
      if (!dispatch.ok) {
        console.warn(JSON.stringify({
          tag: "[GOV_EXAM] python_unreachable_edge_fallback",
          correlation_id: correlationId,
          job_id: jobId,
          code: dispatch.error.code,
        }));
        await db
          .from("gov_paper_generation_jobs")
          .update({
            request_json: {
              ...(body as Record<string, unknown>),
              skipAiFill: plan.skipAiFill,
              allowAiFill: !plan.skipAiFill,
              allowDeterministicFill: plan.allowDeterministicFill,
              generator: "edge_assembler",
              generationPlan: planSummary({
                ...plan,
                generator: "edge_assembler",
              }),
              correlationId,
              pythonFallback: dispatch.error.code,
            },
            updated_at: new Date().toISOString(),
          })
          .eq("id", jobId)
          .in("status", ["queued", "checking_availability"]);
      }
    }

    // Python tagged but HTTP not configured — leave queued for the DB worker
    // only when that worker is actually enabled.
    if (usePythonFactory && !pythonConfigured && paperFactoryWorkerEnabled) {
      return json(req, {
        jobId,
        status: "queued",
        progressStage: "queued",
        creditsCharged: COST,
        balanceAfter,
        generationPlan: planSummary({
          ...plan,
          generator: taggedGenerator,
        }),
        async: true,
        correlationId,
        code: "JOB_QUEUED",
      }, 202);
    }

    const processing = processPaperGenerationJobById(jobId, {
      workerId,
      userId: user.id,
    });
    if (scheduleWithWaitUntil(processing)) {
      return json(req, {
        jobId,
        status: reserved.status,
        progressStage: reserved.progressStage,
        creditsCharged: COST,
        balanceAfter,
        generationPlan: planSummary(plan),
        async: true,
        correlationId,
        code: "JOB_QUEUED",
      }, 202);
    }

    // Deno tests and non-Edge runtimes have no waitUntil; preserve deterministic
    // local behavior while production returns the durable ID immediately.
    const result = await processing;
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
    if (creditsChargedForJob && reservedJobId && reservedUserId) {
      await refundClaimedPaperCredits(
        db,
        reservedJobId,
        reservedUserId,
        "refund_paper_job:enqueue_dispatch_failed",
      ).catch(() => undefined);
      await db
        .from("gov_paper_generation_jobs")
        .update({
          status: "cancelled",
          progress_stage: "cancelled",
          retryable: false,
          error_code: "ENQUEUE_DISPATCH_FAILED",
          error_message: "Generation could not start. Credits were not charged.",
          worker_id: null,
          lease_expires_at: null,
          updated_at: new Date().toISOString(),
        })
        .eq("id", reservedJobId)
        .filter("status", "not.in", "(completed,cancelled,failed_permanent,expired)");
    }
    return json(req, {
      error: "Internal server error",
      code: "INTERNAL_ERROR",
      correlationId,
    }, 500);
  }
}));
