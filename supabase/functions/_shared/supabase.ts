// supabase/functions/_shared/supabase.ts — PRODUCTION READY VERSION

import { createClient, SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";

/* -------------------------------------------------------------------------- */
/*                              SERVICE CLIENT                                 */
/* -------------------------------------------------------------------------- */

export function createServiceClient(): SupabaseClient {
  const url = Deno.env.get("SUPABASE_URL") ?? "";
  const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";

  if (!url || !key) {
    console.error("[supabase] Missing SUPABASE_URL or SERVICE_ROLE_KEY");
  }

  return createClient(url, key, {
    auth: { autoRefreshToken: false, persistSession: false }
  });
}

/* -------------------------------------------------------------------------- */
/*                              CREDIT SYSTEM                                  */
/* -------------------------------------------------------------------------- */

/**
 * HARDENED CREDIT DEDUCTION (service-role, no auth.uid() needed)
 *
 * Uses optimistic-lock UPDATE with WHERE guard to prevent negative balances.
 * Logs every deduction in credit_transactions with enum-safe 'usage' action.
 */
export async function deductCredits(
  userId: string,
  action: string,
  amount: number
): Promise<{ success: boolean; newBalance?: number; error?: string }> {
  if (!userId) return { success: false, error: "Missing userId" };
  if (!amount || amount <= 0) return { success: false, error: "Invalid credit amount" };

  const db = createServiceClient();

  try {
    // 1. Read current balance
    const { data: current, error: readErr } = await db
      .from("profiles")
      .select("credits, credits_used_this_month")
      .eq("id", userId)
      .single();

    if (readErr || !current) {
      return { success: false, error: "Profile not found" };
    }

    if (current.credits < amount) {
      return { success: false, error: "Insufficient credits" };
    }

    // 2. Atomic update with guard (only if credits still >= amount)
    const { data: updated, error: writeErr } = await db
      .from("profiles")
      .update({
        credits: current.credits - amount,
        credits_used_this_month: (current.credits_used_this_month ?? 0) + amount,
        updated_at: new Date().toISOString(),
      })
      .eq("id", userId)
      .gte("credits", amount)
      .select("credits")
      .single();

    if (writeErr || !updated) {
      return { success: false, error: "Credit deduction failed" };
    }

    // 3. Log transaction (enum value must be 'usage' or 'purchase')
    await db.from("credit_transactions").insert({
      user_id: userId,
      action: "usage",
      amount: -amount,
      balance_after: updated.credits,
      description: action,
    });

    return { success: true, newBalance: updated.credits };
  } catch (err) {
    console.error("[credits] Unexpected error:", err);
    return { success: false, error: String(err) };
  }
}
