/**
 * Atomically claim credits_charged on a paper job so only one compensation
 * path can refund for that job (cancel / fail / lease-timeout race).
 */
import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";

export async function claimJobCreditsForRefund(
  db: SupabaseClient,
  jobId: string,
): Promise<number> {
  const { data: row, error } = await db
    .from("gov_paper_generation_jobs")
    .select("credits_charged")
    .eq("id", jobId)
    .maybeSingle();

  if (error || !row) return 0;
  const amount = Math.max(0, Number(row.credits_charged) || 0);
  if (amount <= 0) return 0;

  const { data: claimed, error: claimErr } = await db
    .from("gov_paper_generation_jobs")
    .update({
      credits_charged: 0,
      updated_at: new Date().toISOString(),
    })
    .eq("id", jobId)
    .eq("credits_charged", amount)
    .select("id")
    .maybeSingle();

  if (claimErr || !claimed?.id) return 0;
  return amount;
}
