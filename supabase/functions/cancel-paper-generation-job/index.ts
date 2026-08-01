/**
 * cancel-paper-generation-job — JWT; owner-only cancel + credit refund if charged.
 */

import { handleCors, getCorsHeaders } from "../_shared/cors.ts";
import { authenticateRequest } from "../_shared/auth.ts";
import { createServiceClient, refundCredits } from "../_shared/supabase.ts";
import { isUserBanned, bannedResponse } from "../_shared/banCheck.ts";
import {
  checkRateLimitAsync,
  createRateLimitKey,
  rateLimitResponse,
  RATE_LIMIT_PRESETS,
} from "../_shared/rateLimit.ts";

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

const TERMINAL = new Set(["completed", "cancelled", "expired"]);

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
      key: createRateLimitKey("cancel-paper-generation-job", user.id),
      ...RATE_LIMIT_PRESETS.SESSION_ACTION,
    });
    if (!rateLimitResult.allowed) {
      return rateLimitResponse(rateLimitResult);
    }

    const body = await req.json().catch(() => null);
    const jobId = uuidOrNull(
      body && typeof body === "object"
        ? (body as Record<string, unknown>).jobId
        : null,
    );

    if (!jobId) {
      return json(req, { error: "jobId required", code: "VALIDATION_ERROR" }, 400);
    }

    const { data: job, error } = await db
      .from("gov_paper_generation_jobs")
      .select("id, user_id, status, credits_charged, completed_at")
      .eq("id", jobId)
      .eq("user_id", user.id)
      .maybeSingle();

    if (error || !job) {
      return json(req, { error: "Job not found", code: "PAPER_NOT_FOUND" }, 404);
    }

    if (job.status === "completed") {
      return json(req, {
        error: "Completed jobs cannot be cancelled",
        code: "JOB_ALREADY_COMPLETED",
        jobId: job.id,
        status: job.status,
      }, 409);
    }

    if (TERMINAL.has(String(job.status))) {
      return json(req, {
        jobId: job.id,
        status: job.status,
        cancelled: job.status === "cancelled",
        creditsRefunded: 0,
        message: `Job already ${job.status}`,
      });
    }

    const creditsCharged = Math.max(0, Number(job.credits_charged) || 0);

    const { error: updErr } = await db
      .from("gov_paper_generation_jobs")
      .update({
        status: "cancelled",
        progress_stage: "cancelled",
        completed_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        error_code: "CANCELLED_BY_USER",
        error_message: "Cancelled by user before completion",
        retryable: false,
        worker_id: null,
        lease_expires_at: null,
      })
      .eq("id", jobId)
      .eq("user_id", user.id)
      .neq("status", "completed");

    if (updErr) {
      console.error("[cancel-paper-generation-job]", updErr);
      return json(req, { error: "Cancel failed", code: "INTERNAL_ERROR" }, 500);
    }

    let creditsRefunded = 0;
    if (creditsCharged > 0) {
      const refund = await refundCredits({
        userId: user.id,
        cost: creditsCharged,
        reason: "refund_cancel_paper_generation_job",
      }).catch((e) => {
        console.warn("[cancel-paper-generation-job] refund:", e);
        return { success: false as const };
      });
      if (refund?.success) {
        creditsRefunded = creditsCharged;
        await db
          .from("gov_paper_generation_jobs")
          .update({
            credits_charged: 0,
            updated_at: new Date().toISOString(),
          })
          .eq("id", jobId);
      }
    }

    return json(req, {
      jobId,
      status: "cancelled",
      cancelled: true,
      creditsRefunded,
    });
  } catch (err) {
    console.error("[cancel-paper-generation-job]", err);
    return json(req, { error: "Internal server error", code: "INTERNAL_ERROR" }, 500);
  }
});
