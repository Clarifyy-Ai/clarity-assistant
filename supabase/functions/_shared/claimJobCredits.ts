/**
 * Two-phase paper-job credits: reserve on accept, finalize on stored paper,
 * release exactly once on eligible failure.
 */
import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";
import { refundCreditsBestEffort } from "./supabase.ts";

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

export async function releasePaperJobCredits(
  db: SupabaseClient,
  jobId: string,
  reason = "refund_paper_job",
): Promise<number> {
  const { data, error } = await db.rpc("release_gov_paper_credits", {
    p_job_id: jobId,
    p_reason: reason,
  });
  if (!error && data && typeof data === "object") {
    const rec = data as { success?: boolean; released?: number; already_released?: boolean };
    if (rec.success !== false) {
      return Math.max(0, Number(rec.released) || 0);
    }
  }

  // Fallback when RPC is not yet deployed: claim credits_charged then refund.
  return claimJobCreditsForRefund(db, jobId);
}

/**
 * Atomically claim credits_charged / credits_reserved so only one compensation
 * path can refund for that job (cancel / fail / lease-timeout race).
 */
export async function claimJobCreditsForRefund(
  db: SupabaseClient,
  jobId: string,
): Promise<number> {
  const { data: row, error } = await db
    .from("gov_paper_generation_jobs")
    .select("credits_charged, credits_reserved, credits_released_at, credits_finalized_at, user_id")
    .eq("id", jobId)
    .maybeSingle();

  if (error || !row) return 0;
  if (row.credits_finalized_at || row.credits_released_at) return 0;
  const amount = Math.max(
    0,
    Number(row.credits_reserved) || 0,
    Number(row.credits_charged) || 0,
  );
  if (amount <= 0) return 0;

  const { data: claimed, error: claimErr } = await db
    .from("gov_paper_generation_jobs")
    .update({
      credits_charged: 0,
      credits_reserved: 0,
      credits_released_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq("id", jobId)
    .is("credits_released_at", null)
    .is("credits_finalized_at", null)
    .select("id, user_id")
    .maybeSingle();

  if (claimErr || !claimed?.id) return 0;
  return amount;
}

export async function refundClaimedPaperCredits(
  db: SupabaseClient,
  jobId: string,
  userId: string,
  reason: string,
): Promise<number> {
  const released = await releasePaperJobCredits(db, jobId, reason);
  if (released > 0) return released;
  const claimed = await claimJobCreditsForRefund(db, jobId);
  if (claimed <= 0) return 0;
  await refundCreditsBestEffort(
    {
      userId,
      cost: claimed,
      reason,
      idempotencyKey: `refund_paper_job:${jobId}`,
    },
    { job_id: jobId, reason },
  );
  return claimed;
}
