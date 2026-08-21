import { handleCors, getCorsHeaders } from "../_shared/cors.ts";
import { authenticateRequest } from "../_shared/auth.ts";
import { createServiceClient } from "../_shared/supabase.ts";
import { isUserBanned, bannedResponse } from "../_shared/banCheck.ts";
import { isUuid, safeError } from "../_shared/documentProcessing.ts";

function json(req: Request, body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...getCorsHeaders(req), "Content-Type": "application/json" },
  });
}

Deno.serve(async (req) => {
  const cors = handleCors(req);
  if (cors) return cors;
  const correlationId = req.headers.get("x-request-id")?.trim() || crypto.randomUUID();
  try {
    const auth = await authenticateRequest(req);
    if (auth.error) return auth.error;
    const db = createServiceClient();
    const user = auth.context.user;
    if (await isUserBanned(db, user.id)) return bannedResponse(getCorsHeaders(req));
    const body = await req.json().catch(() => null) as Record<string, unknown> | null;
    const jobId = typeof body?.jobId === "string" ? body.jobId.trim() : "";
    if (!isUuid(jobId)) return json(req, { success: false, error: safeError("VALIDATION_ERROR", "A valid jobId is required.", "validation", correlationId) }, 400);
    const { data: existing } = await db.from("document_processing_jobs")
      .select("id, status, attempt_count, max_attempts")
      .eq("id", jobId).eq("owner_id", user.id).maybeSingle();
    if (!existing) return json(req, { success: false, error: safeError("JOB_NOT_FOUND", "Processing job not found.", "ownership", correlationId) }, 404);
    if (existing.status === "completed") return json(req, { success: true, idempotent: true, jobId, state: existing.status });
    if (existing.status !== "failed_retryable") {
      return json(req, { success: false, error: safeError("JOB_NOT_RETRYABLE", "Only retryable failed jobs can be retried.", "retry", correlationId) }, 409);
    }
    const { data: job, error } = await db.from("document_processing_jobs")
      .update({
        status: "queued",
        available_at: new Date().toISOString(),
        lease_expires_at: null,
        heartbeat_at: null,
        worker_id: null,
        cancel_requested_at: null,
        error_code: null,
        error_message: null,
        error_stage: null,
        retryable: true,
        updated_at: new Date().toISOString(),
      })
      .eq("id", jobId).eq("owner_id", user.id).eq("status", "failed_retryable")
      .select("id, status, attempt_count, max_attempts").maybeSingle();
    if (error) return json(req, { success: false, error: safeError("RETRY_FAILED", "Job could not be retried.", "retry", correlationId, true) }, 503);
    if (!job) return json(req, { success: true, idempotent: true, jobId, state: "queued" });
    return json(req, { success: true, jobId: job.id, state: job.status, attemptCount: job.attempt_count, correlationId }, 202);
  } catch (error) {
    console.error("[retry-document-processing-job]", error);
    return json(req, { success: false, error: safeError("INTERNAL_ERROR", "Job could not be retried.", "retry", correlationId, true) }, 500);
  }
});
