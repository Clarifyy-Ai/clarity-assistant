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

async function projectLibraryCancelled(
  db: ReturnType<typeof createServiceClient>,
  documentId: string | null | undefined,
  ownerId: string,
) {
  if (!documentId) return;
  await db.from("personal_library_documents").update({
    processing_status: "cancelled",
    processing_error: null,
  }).eq("id", documentId).eq("owner_id", ownerId);
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
      .select("id, status, credits_reserved, document_id").eq("id", jobId).eq("owner_id", user.id).maybeSingle();
    if (!existing) return json(req, { success: false, error: safeError("JOB_NOT_FOUND", "Processing job not found.", "ownership", correlationId) }, 404);
    if (existing.status === "completed") return json(req, { success: false, error: safeError("JOB_COMPLETED", "Completed jobs cannot be cancelled.", "cancel", correlationId) }, 409);
    if (existing.status === "failed_permanent") return json(req, { success: false, error: safeError("JOB_TERMINAL", "Permanently failed jobs cannot be cancelled.", "cancel", correlationId) }, 409);
    if (existing.status === "cancelled") {
      await projectLibraryCancelled(db, existing.document_id, user.id);
      return json(req, { success: true, idempotent: true, jobId, state: "cancelled", creditsRefunded: false });
    }

    const { data: job, error } = await db.from("document_processing_jobs")
      .update({
        status: "cancelled",
        retryable: false,
        cancel_requested_at: new Date().toISOString(),
        lease_expires_at: null,
        worker_id: null,
        completed_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        error_code: "CANCELLED_BY_USER",
        error_message: "Processing cancelled by the document owner.",
        error_stage: "cancel",
      })
      .eq("id", jobId).eq("owner_id", user.id)
      .not("status", "in", "(completed,cancelled,failed_permanent)")
      .select("id, status, document_id").maybeSingle();
    if (error) return json(req, { success: false, error: safeError("CANCEL_FAILED", "Job could not be cancelled.", "cancel", correlationId, true) }, 503);
    if (!job) return json(req, { success: true, idempotent: true, jobId, state: "cancelled", creditsRefunded: false });

    await projectLibraryCancelled(db, job.document_id ?? existing.document_id, user.id);

    const refund = await db.rpc("refund_document_processing_job", {
      p_job_id: jobId,
      p_reason: "document_processing_cancelled",
    });
    if (refund.error || !(refund.data as { success?: boolean } | null)?.success) {
      console.error("[cancel-document-processing-job] refund failed", refund.error?.message);
      return json(req, { success: false, jobId, state: "cancelled", error: safeError("REFUND_PENDING", "Cancellation succeeded; credit refund is pending.", "credit_refund", correlationId, true) }, 202);
    }
    return json(req, { success: true, jobId, state: "cancelled", creditsRefunded: Boolean((refund.data as { refunded?: boolean }).refunded), correlationId });
  } catch (error) {
    console.error("[cancel-document-processing-job]", error);
    return json(req, { success: false, error: safeError("INTERNAL_ERROR", "Job could not be cancelled.", "cancel", correlationId, true) }, 500);
  }
});
