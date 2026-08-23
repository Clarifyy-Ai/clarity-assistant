import { supabase } from "@/lib/supabase/client";

/**
 * Server-authoritative spendable balance for the signed-in user.
 * Never treat a cached profile field as the billing authority.
 */
export async function fetchSpendableCredits(userId: string): Promise<number | null> {
  if (!userId) return null;
  const { data, error } = await supabase.rpc("get_spendable_credits", {
    p_user_id: userId,
  });
  if (error || data == null) return null;
  const payload = typeof data === "object" ? (data as Record<string, unknown>) : null;
  if (!payload || payload.success === false) return null;
  const balance = Number(payload.balance);
  return Number.isFinite(balance) ? Math.max(0, Math.floor(balance)) : null;
}
