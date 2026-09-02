/**
 * Two-phase paper-job credits: reserve on accept, finalize on stored paper,
 * release exactly once on eligible failure.
 */
import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";

/**
 * Authoritative spendable-balance check before creating a paper job.
 * Rejects with INSUFFICIENT_CREDITS without inserting a job or reserving credits.
 */
export async function preflightSpendableCredits(
  db: SupabaseClient,
  userId: string,
  cost: number,
): Promise<
  | { ok: true; balance: number }
  | { ok: false; denial: Record<string, unknown> }
> {
  const required = Math.max(0, Math.floor(cost));
  const { data, error } = await db.rpc("get_spendable_credits", { p_user_id: userId });
  if (error) {
    return {
      ok: false,
      denial: { code: "CREDIT_SERVICE_UNAVAILABLE", error: error.message },
    };
  }
  const rec = (data && typeof data === "object" ? data : {}) as Record<string, unknown>;
  if (rec.success === false) {
    return { ok: false, denial: rec };
  }
  const balance = Math.max(0, Math.floor(Number(rec.balance) || 0));
  if (balance < required) {
    return {
      ok: false,
      denial: {
        code: "INSUFFICIENT_CREDITS",
        balance,
        cost: required,
        required,
        shortfall: required - balance,
        error: `You need ${required} credits, but only ${balance} are available.`,
      },
    };
  }
  return { ok: true, balance };
}

export type ReservedPaperJobInput = {
  userId: string;
  examId: string;
  stageId?: string | null;
  patternVersionId?: string | null;
  syllabusVersionId?: string | null;
  mode: string;
  language: string;
  requestJson: Record<string, unknown>;
  sourceMix?: Record<string, unknown>;
  missingCount?: number | null;
  idempotencyKey: string;
  cost: number;
  randomSeed: string;
  inventorySnapshot?: Record<string, unknown> | null;
  inventoryVersion?: string | null;
  status?: string;
  progressStage?: string;
};

/**
 * Atomically performs the authoritative balance check, credit reservation, and
 * durable insert. An insufficient balance rolls back without leaving a job.
 */
export async function createReservedPaperJob(
  db: SupabaseClient,
  input: ReservedPaperJobInput,
): Promise<
  | {
    success: true;
    jobId: string;
    status: string;
    progressStage: string;
    balanceAfter?: number;
    idempotentReplay: boolean;
    mockTestId?: string | null;
    paperId?: string | null;
  }
  | { success: false; denial: Record<string, unknown> }
> {
  const { data, error } = await db.rpc("enqueue_gov_paper_job", {
    p_user_id: input.userId,
    p_exam_id: input.examId,
    p_stage_id: input.stageId ?? null,
    p_pattern_version_id: input.patternVersionId ?? null,
    p_syllabus_version_id: input.syllabusVersionId ?? null,
    p_mode: input.mode,
    p_language: input.language,
    p_request_json: input.requestJson,
    p_source_mix: input.sourceMix ?? {},
    p_missing_count: input.missingCount ?? null,
    p_idempotency_key: input.idempotencyKey,
    p_cost: input.cost,
    p_random_seed: input.randomSeed,
    p_inventory_snapshot: input.inventorySnapshot ?? null,
    p_inventory_version: input.inventoryVersion ?? null,
    p_status: input.status ?? "queued",
    p_progress_stage: input.progressStage ?? "queued",
  });
  if (error) {
    return {
      success: false,
      denial: { code: "JOB_ENQUEUE_FAILED", error: error.message },
    };
  }
  const rec = (data && typeof data === "object" ? data : {}) as Record<string, unknown>;
  if (rec.success !== true || typeof rec.job_id !== "string") {
    return { success: false, denial: rec };
  }
  return {
    success: true,
    jobId: rec.job_id,
    status: String(rec.status ?? "queued"),
    progressStage: String(rec.progress_stage ?? rec.status ?? "queued"),
    balanceAfter:
      rec.balance_after == null ? undefined : Number(rec.balance_after),
    idempotentReplay: rec.idempotent_replay === true,
    mockTestId: typeof rec.mock_test_id === "string" ? rec.mock_test_id : null,
    paperId: typeof rec.paper_id === "string" ? rec.paper_id : null,
  };
}

export async function finalizePaperJobCredits(
  db: SupabaseClient,
  jobId: string,
): Promise<void> {
  const { error } = await db.rpc("finalize_gov_paper_credits", { p_job_id: jobId });
  if (error) {
    console.warn("[claimJobCredits] finalize:", error.message);
  }
}

export async function reservePaperJobCredits(
  db: SupabaseClient,
  jobId: string,
  userId: string,
  cost: number,
  idempotencyKey: string,
): Promise<{
  success: boolean;
  alreadyReserved?: boolean;
  alreadyFinalized?: boolean;
  reserved?: number;
  balanceAfter?: number;
  denial?: Record<string, unknown>;
}> {
  const { data, error } = await db.rpc("reserve_gov_paper_credits", {
    p_job_id: jobId,
    p_user_id: userId,
    p_cost: cost,
    p_idempotency_key: idempotencyKey,
  });
  if (error) {
    console.warn("[claimJobCredits] reserve:", error.message);
    return { success: false, denial: { code: "CREDIT_RESERVE_FAILED", error: error.message } };
  }
  const rec = (data && typeof data === "object" ? data : {}) as Record<string, unknown>;
  if (rec.success === false) {
    return { success: false, denial: rec };
  }
  return {
    success: true,
    alreadyReserved: rec.already_reserved === true,
    alreadyFinalized: rec.already_finalized === true,
    reserved: Number(rec.reserved) || cost,
    balanceAfter: rec.balance_after != null ? Number(rec.balance_after) : undefined,
  };
}

/**
 * Release reserved credits via Postgres RPC (refund + mark released atomically).
 * Returns the refunded amount, or 0 when nothing was pending / RPC failed.
 * Failed calls stay unsettled for a later poll or sweeper retry.
 */
export async function releasePaperJobCredits(
  db: SupabaseClient,
  jobId: string,
  reason = "refund_paper_job",
): Promise<number> {
  const { data, error } = await db.rpc("release_gov_paper_credits", {
    p_job_id: jobId,
    p_reason: reason,
  });
  if (error) {
    console.warn("[claimJobCredits] release RPC:", error.message);
    return 0;
  }
  if (data && typeof data === "object") {
    const rec = data as { success?: boolean; released?: number; already_released?: boolean };
    if (rec.success === false) {
      console.warn("[claimJobCredits] release declined:", JSON.stringify(rec));
      return 0;
    }
    return Math.max(0, Number(rec.released) || 0);
  }
  return 0;
}

/** Legacy marker retained for compatibility; it never issues a refund itself. */
export async function markJobCreditsReleased(
  db: SupabaseClient,
  jobId: string,
): Promise<boolean> {
  const now = new Date().toISOString();
  const { data, error } = await db
    .from("gov_paper_generation_jobs")
    .update({
      credits_released_at: now,
      credits_reserved: 0,
      credits_charged: 0,
      updated_at: now,
    })
    .eq("id", jobId)
    .is("credits_released_at", null)
    .is("credits_finalized_at", null)
    .select("id")
    .maybeSingle();

  if (error) {
    console.warn("[claimJobCredits] mark released:", error.message);
    return false;
  }
  return Boolean(data?.id);
}

/**
 * Deprecated compatibility shim. Application-side credit claims cannot make
 * refund + settlement atomic, so callers must use release_gov_paper_credits.
 */
export async function claimJobCreditsForRefund(
  _db: SupabaseClient,
  _jobId: string,
): Promise<number> {
  return 0;
}

/**
 * Release reserved paper-job credits exactly once in Postgres. Fail closed:
 * RPC failures return zero and remain unsettled for a later poll/sweeper retry.
 */
export async function refundClaimedPaperCredits(
  db: SupabaseClient,
  jobId: string,
  _userId: string,
  reason: string,
): Promise<number> {
  return releasePaperJobCredits(db, jobId, reason);
}
