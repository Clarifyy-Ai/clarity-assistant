import { handleCors, getCorsHeaders, withBrowserCors, applyCors } from "../_shared/cors.ts";
import { authenticateRequest } from "../_shared/auth.ts";
import { createServiceClient } from "../_shared/supabase.ts";
import { reclaimExpiredPaperJobs } from "../_shared/govPaperJobLease.ts";
import {
  checkRateLimitAsync,
  createRateLimitKey,
  rateLimitResponse,
  RATE_LIMIT_PRESETS,
} from "../_shared/rateLimit.ts";

/** Map DB status + retryable flag to the public job contract. */
function mapPublicStatus(
  status: string | null | undefined,
  retryable?: boolean | null,
): string {
  const s = String(status ?? "").trim();
  if (s === "failed_retryable" || s === "failed_permanent") return s;
  if (s === "failed") {
    return retryable === false ? "failed_permanent" : "failed_retryable";
  }
  if (s === "expired") return "failed_permanent";
  return s || "queued";
}

function json(req: Request, payload: unknown, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { ...getCorsHeaders(req), "Content-Type": "application/json" },
  });
}

Deno.serve(withBrowserCors("get-paper-generation-job", async (req) => {
  const cors = handleCors(req);
  if (cors) return cors;

  const db = createServiceClient();

  try {
    const auth = await authenticateRequest(req);
    if (auth.error) return applyCors(req, auth.error);
    const user = auth.context.user;

    // Polling is also a recovery opportunity when no background worker is
    // running. Reclaim only expired leases; active workers remain untouched.
    await reclaimExpiredPaperJobs(db, { limit: 10 }).catch((err) => {
      console.warn("[get-paper-generation-job] reclaim:", err);
    });

    const rateLimitResult = await checkRateLimitAsync(db, {
      key: createRateLimitKey("get-paper-generation-job", user.id),
      ...RATE_LIMIT_PRESETS.SESSION_ACTION,
    });
    if (!rateLimitResult.allowed) {
      return rateLimitResponse(rateLimitResult, req);
    }

    const url = new URL(req.url);
    let jobId = url.searchParams.get("jobId")?.trim() ?? "";

    if (!jobId && req.method === "POST") {
      const body = await req.json().catch(() => null);
      jobId = String((body as Record<string, unknown>)?.jobId ?? "").trim();
    }

    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(jobId)) {
      return json(req, { error: "jobId required", code: "VALIDATION_ERROR" }, 400);
    }

    const { data: job, error } = await db
      .from("gov_paper_generation_jobs")
      .select(
        "id, status, progress_stage, mock_test_id, generated_paper_id, error_code, error_message, blueprint_json, credits_charged, created_at, completed_at, mode, language, attempt_count, retryable, lease_expires_at, heartbeat_at, worker_id, started_at, exam_id",
      )
      .eq("id", jobId)
      .eq("user_id", user.id)
      .maybeSingle();

    if (error || !job) {
      return json(req, { error: "Job not found", code: "PAPER_NOT_FOUND" }, 404);
    }

    const publicStatus = mapPublicStatus(job.status, job.retryable as boolean | null);

    return json(req, {
      jobId: job.id,
      status: publicStatus,
      progressStage: job.progress_stage ?? publicStatus,
      mockTestId: job.mock_test_id,
      paperId: job.generated_paper_id,
      errorCode: job.error_code,
      errorMessage: job.error_message,
      blueprint: job.blueprint_json,
      creditsCharged: job.credits_charged,
      mode: job.mode,
      language: job.language,
      examId: job.exam_id,
      createdAt: job.created_at,
      startedAt: job.started_at,
      completedAt: job.completed_at,
      attemptCount: job.attempt_count ?? 0,
      retryable: job.retryable ?? true,
      leaseExpiresAt: job.lease_expires_at,
      heartbeatAt: job.heartbeat_at,
      workerId: job.worker_id,
    });
  } catch (err) {
    console.error("[get-paper-generation-job]", err);
    return json(req, { error: "Internal server error", code: "INTERNAL_ERROR" }, 500);
  }
}));
