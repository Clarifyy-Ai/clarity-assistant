import { handleCors, getCorsHeaders } from "../_shared/cors.ts";
import { authenticateRequest } from "../_shared/auth.ts";
import { createServiceClient, deductCreditsAtomic, refundCredits } from "../_shared/supabase.ts";
import { isUserBanned, bannedResponse } from "../_shared/banCheck.ts";
import { requireCapabilityForFunction } from "../_shared/requireCapability.ts";
import { creditCost } from "../_shared/creditEconomics.ts";
import {
  getOwnedDocument,
  safeError,
  validateDocumentRecord,
  validIdempotencyKey,
} from "../_shared/documentProcessing.ts";
import {
  checkRateLimitAsync,
  createRateLimitKey,
  rateLimitResponse,
  RATE_LIMIT_PRESETS,
} from "../_shared/rateLimit.ts";

const COST = creditCost("parse_document");

function json(req: Request, body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...getCorsHeaders(req), "Content-Type": "application/json" },
  });
}

Deno.serve(async (req) => {
  const cors = handleCors(req);
  if (cors) return cors;
  if (req.method !== "POST") return json(req, { error: "Method not allowed", code: "METHOD_NOT_ALLOWED" }, 405);
  const correlationId = req.headers.get("x-request-id")?.trim() || crypto.randomUUID();

  try {
    const auth = await authenticateRequest(req);
    if (auth.error) return auth.error;
    const user = auth.context.user;
    const db = createServiceClient();
    if (await isUserBanned(db, user.id)) return bannedResponse(getCorsHeaders(req));
    const limited = await checkRateLimitAsync(db, {
      key: createRateLimitKey("create-document-processing-job", user.id),
      ...RATE_LIMIT_PRESETS.SESSION_ACTION,
    });
    if (!limited.allowed) return rateLimitResponse(limited);

    const body = await req.json().catch(() => null) as Record<string, unknown> | null;
    const documentId = typeof body?.documentId === "string" ? body.documentId.trim() : "";
    const idempotencyKey = typeof body?.idempotencyKey === "string" ? body.idempotencyKey.trim() : "";
    if (!documentId || !validIdempotencyKey(idempotencyKey)) {
      return json(req, {
        success: false,
        error: safeError("VALIDATION_ERROR", "documentId and a valid idempotencyKey are required.", "validation", correlationId),
      }, 400);
    }

    const { data: profile } = await db.from("profiles").select("plan_id").eq("id", user.id).maybeSingle();
    const capability = requireCapabilityForFunction(profile?.plan_id, "parse-document", req);
    if (capability) return capability;

    const { data: existing } = await db
      .from("document_processing_jobs")
      .select("id, status, result_reference, warnings, error_code, error_message, attempt_count, credits_reserved")
      .eq("owner_id", user.id)
      .eq("idempotency_key", idempotencyKey)
      .maybeSingle();
    if (existing) return json(req, { success: true, idempotent: true, jobId: existing.id, ...existing }, 200);

    const document = await getOwnedDocument(db, documentId, user.id);
    if (!document) return json(req, { success: false, error: safeError("DOCUMENT_NOT_FOUND", "Document not found.", "ownership", correlationId) }, 404);
    const validation = validateDocumentRecord(document, user.id);
    if (!validation.ok) return json(req, { success: false, error: safeError(validation.code, validation.message, "validation", correlationId) }, 422);

    const credit = await deductCreditsAtomic({
      userId: user.id,
      action: "parse_document",
      cost: COST,
      idempotencyKey: `document_processing:${user.id}:${idempotencyKey}`,
      requestHash: `${documentId}:${document.content_hash ?? ""}`,
    });
    if (!credit.success) {
      return json(req, { success: false, error: safeError("INSUFFICIENT_CREDITS", "Insufficient credits.", "credit_reservation", correlationId) }, 402);
    }

    const { data: job, error } = await db.from("document_processing_jobs").insert({
      document_id: documentId,
      owner_id: user.id,
      operation: "parse",
      idempotency_key: idempotencyKey,
      request_hash: `${documentId}:${document.content_hash ?? ""}`,
      storage_reference: {
        bucket: "documents",
        path: document.storage_path,
        content_hash: document.content_hash,
      },
      parser_version: "2026.08.21.1",
      credits_reserved: COST,
      credit_transaction_id: credit.transactionId ?? null,
    }).select("id, status, attempt_count, created_at").single();

    if (error || !job) {
      // A unique conflict means another request won the race. The idempotent
      // credit key prevents a second charge; return the winner if available.
      const { data: winner } = await db.from("document_processing_jobs")
        .select("id, status, attempt_count, created_at")
        .eq("owner_id", user.id).eq("idempotency_key", idempotencyKey).maybeSingle();
      if (winner) return json(req, { success: true, idempotent: true, jobId: winner.id, ...winner }, 200);
      await refundCredits({ userId: user.id, cost: COST, reason: `refund_document_job_create:${documentId}` });
      return json(req, { success: false, error: safeError("JOB_CREATE_FAILED", "Processing job could not be created.", "queueing", correlationId, true) }, 503);
    }

    return json(req, { success: true, jobId: job.id, state: job.status, attemptCount: job.attempt_count, correlationId }, 202);
  } catch (error) {
    console.error("[create-document-processing-job]", error);
    return json(req, { success: false, error: safeError("INTERNAL_ERROR", "Processing job could not be created.", "queueing", correlationId, true) }, 500);
  }
});
