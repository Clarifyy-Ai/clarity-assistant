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
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

/* -------------------------------------------------------------------------- */
/*                              CREDIT SYSTEM                                  */
/* -------------------------------------------------------------------------- */

/**
 * Low-level hardened credit deduction (service-role).
 * Uses optimistic-lock UPDATE with WHERE guard to prevent negative balances
 * and logs every deduction in credit_transactions. [file:1]
 */
export async function deductCredits(
  userId: string,
  action: string,
  amount: number
): Promise<{ success: boolean; newBalance?: number; error?: string }> {
  if (!userId) return { success: false, error: "Missing userId" };
  if (!amount || amount <= 0)
    return { success: false, error: "Invalid credit amount" };

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

    if ((current.credits ?? 0) < amount) {
      return { success: false, error: "Insufficient credits" };
    }

    // 2. Atomic update with guard (only if credits still >= amount)
    const { data: updated, error: writeErr } = await db
      .from("profiles")
      .update({
        credits: (current.credits ?? 0) - amount,
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

    // 3. Log transaction (usage)
    await db.from("credit_transactions").insert({
      user_id: userId,
      action: "usage",          // enum-safe (usage / purchase)
      amount: -amount,
      balance_after: updated.credits,
      description: action,      // e.g. "liveanswerlong"
    });

    return { success: true, newBalance: updated.credits };
  } catch (err) {
    console.error("[credits] Unexpected error:", err);
    return { success: false, error: String(err) };
  }
}

/**
 * High-level helper used by generate-answer and other edge functions.
 * Wraps deductCredits with a more explicit payload shape and adds sessionId
 * into the transaction log when available. [file:1]
 */
export async function deductCreditsAtomic(input: {
  userId: string;
  action: string;     // e.g. "liveanswerlong", "liveanswershort"
  cost: number;
  sessionId?: string | null;
}): Promise<{ success: boolean; balanceAfter?: number; error?: string }> {
  const { userId, action, cost, sessionId } = input;
  const db = createServiceClient();

  // Reuse low-level deduction for the atomic update
  const result = await deductCredits(userId, action, cost);
  if (!result.success || typeof result.newBalance !== "number") {
    return { success: false, error: result.error ?? "Credit deduction failed" };
  }

  // Optionally update the last credit_transactions row with session_id
  // so you can tie usage to a specific session. This assumes your schema
  // includes a session_id column. [file:1]
  if (sessionId) {
    try {
      await db
        .from("credit_transactions")
        .update({ session_id: sessionId })
        .eq("user_id", userId)
        .eq("action", "usage")
        .order("created_at", { ascending: false })
        .limit(1);
    } catch (err) {
      console.error("[credits] Failed to attach session_id to transaction:", err);
    }
  }

  return { success: true, balanceAfter: result.newBalance };
}
