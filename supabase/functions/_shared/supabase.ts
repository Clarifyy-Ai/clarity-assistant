// supabase/functions/_shared/supabase.ts — FIXED + HARDENED
// - Adds createUserClient(token) to support auth.uid() RPCs (refunds, etc.)
// - Fixes deductCreditsAtomic session_id attachment logic (order/limit doesn't work on update)
// - Keeps service-role client for admin/atomic operations

import { createClient, SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";

/* -------------------------------------------------------------------------- */
/*                              SERVICE CLIENT                                 */
/* -------------------------------------------------------------------------- */

export function createServiceClient(): SupabaseClient {
  const url = Deno.env.get("SUPABASE_URL") ?? "";
  const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";

  if (!url || !key) {
    console.error("[supabase] Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
  }

  return createClient(url, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

/* -------------------------------------------------------------------------- */
/*                              USER CLIENT                                    */
/* -------------------------------------------------------------------------- */
/**
 * User-scoped client (RLS applies).
 * Use when you need auth.uid() to resolve correctly in Postgres functions,
 * e.g., refund_credits() implementations that rely on auth.uid().
 */
export function createUserClient(accessToken: string): SupabaseClient {
  const url = Deno.env.get("SUPABASE_URL") ?? "";
  const anon = Deno.env.get("SUPABASE_ANON_KEY") ?? "";

  if (!url || !anon) {
    console.error("[supabase] Missing SUPABASE_URL or SUPABASE_ANON_KEY for user client");
  }

  return createClient(url, anon, {
    global: {
      headers: { Authorization: `Bearer ${accessToken}` },
    },
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

/* -------------------------------------------------------------------------- */
/*                              CREDIT SYSTEM                                  */
/* -------------------------------------------------------------------------- */

/**
 * Low-level hardened credit deduction (service-role).
 * Uses optimistic-lock UPDATE with WHERE guard to prevent negative balances
 * and logs every deduction in credit_transactions.
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
    // 1) Read current balance
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

    // 2) Atomic update with guard (only if credits still >= amount)
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

    // 3) Log transaction (usage)
    await db.from("credit_transactions").insert({
      user_id: userId,
      action: "usage", // enum-safe (usage / purchase / etc.)
      amount: -amount,
      balance_after: updated.credits,
      description: action, // e.g. "liveanswerlong"
      created_at: new Date().toISOString(),
    });

    return { success: true, newBalance: updated.credits };
  } catch (err) {
    console.error("[credits] Unexpected error:", err);
    return { success: false, error: String(err) };
  }
}

/**
 * High-level helper used by generate-answer and other edge functions.
 * Wraps deductCredits and optionally attaches sessionId to the most recent
 * credit transaction row created by this request.
 */
export async function deductCreditsAtomic(input: {
  userId: string;
  action: string;     // e.g. "liveanswerlong"
  cost: number;
  sessionId?: string | null;
}): Promise<{ success: boolean; balanceAfter?: number; error?: string }> {
  const { userId, action, cost, sessionId } = input;
  const db = createServiceClient();

  const result = await deductCredits(userId, action, cost);
  if (!result.success || typeof result.newBalance !== "number") {
    return { success: false, error: result.error ?? "Credit deduction failed" };
  }

  // Attach session_id reliably:
  // NOTE: update().order().limit() is not a safe/standard PostgREST pattern.
  // We fetch the last inserted usage transaction ID then update by ID.
  if (sessionId) {
    try {
      const { data: lastTx } = await db
        .from("credit_transactions")
        .select("id, created_at")
        .eq("user_id", userId)
        .eq("action", "usage")
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (lastTx?.id) {
        await db
          .from("credit_transactions")
          .update({ session_id: sessionId })
          .eq("id", lastTx.id);
      } else {
        // If schema doesn't have id or row missing, fall back (best-effort)
        await db
          .from("credit_transactions")
          .update({ session_id: sessionId })
          .eq("user_id", userId)
          .eq("action", "usage")
          .eq("balance_after", result.newBalance);
      }
    } catch (err) {
      console.error("[credits] Failed to attach session_id:", err);
    }
  }

  return { success: true, balanceAfter: result.newBalance };
}
