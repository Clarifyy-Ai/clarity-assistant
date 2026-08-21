import { handleCors, getCorsHeaders } from "../_shared/cors.ts";
import { authenticateRequest } from "../_shared/auth.ts";
import { createServiceClient } from "../_shared/supabase.ts";
import { isUserBanned, bannedResponse } from "../_shared/banCheck.ts";
import { safeError, isUuid } from "../_shared/documentProcessing.ts";

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
    const url = new URL(req.url);
    const jobId = url.searchParams.get("jobId")?.trim() || (
      req.method === "POST"
        ? String(((await req.json().catch(() => null)) as Record<string, unknown> | null)?.jobId ?? "")
        : ""
    );
    if (!isUuid(jobId)) {
      return json(req, { success: false, error: safeError("VALIDATION_ERROR", "A valid jobId is required.", "validation", correlationId) }, 400);
    }
    const { data: job, error } = await db.from("document_processing_jobs")
      .select("id, document_id, operation, status, result_reference, warnings, error_code, error_message, error_stage, retryable, attempt_count, max_attempts, available_at, lease_expires_at, heartbeat_at, created_at, updated_at, completed_at")
      .eq("id", jobId).eq("owner_id", user.id).maybeSingle();
    if (error || !job) {
      return json(req, { success: false, error: safeError("JOB_NOT_FOUND", "Processing job not found.", "job_lookup", correlationId) }, 404);
    }
    return json(req, { success: true, job, correlationId });
  } catch (error) {
    console.error("[get-document-processing-job]", error);
    return json(req, { success: false, error: safeError("INTERNAL_ERROR", "Job status is unavailable.", "job_lookup", correlationId, true) }, 500);
  }
});
