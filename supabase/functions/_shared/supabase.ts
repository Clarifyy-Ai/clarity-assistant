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
 * HARDENED CREDIT DEDUCTION
 *
 * • Fully atomic (uses Postgres function)
 * • No read-then-write race conditions
 * • Prevents negative balances
 * • Logs transaction safely and consistently
 *
 * @param userId      The user whose credits should be deducted
 * @param action      Short action string (e.g. 'generate_practice_questions')
 * @param amount      Credits to deduct
 *
 * @returns { success: boolean, error?: string }
 */
export async function deductCredits(
  userId: string,
  action: string,
  amount: number
): Promise<{ success: boolean; error?: string }> {
  if (!userId) {
    return { success: false, error: "Missing userId" };
  }
  if (!amount || amount <= 0) {
    return { success: false, error: "Invalid credit amount" };
  }

  const db = createServiceClient();

  /* Use the existing deduct_credits(uuid, int, uuid, text) RPC */
  try {
    const { data, error: rpcError } = await db.rpc("deduct_credits", {
      p_user_id: userId,
      p_amount: amount,
      p_session_id: null,
      p_description: action,
    });

    if (rpcError) {
      console.error("[credits] RPC error:", rpcError.message);
      // Check if it's an insufficient credits error from the function
      if (rpcError.message.includes("Insufficient credits")) {
        return { success: false, error: "Insufficient credits" };
      }
      return { success: false, error: rpcError.message };
    }

    // data is the new balance (integer)
    return { success: true };
  } catch (err) {
    console.error("[credits] Unexpected error:", err);
    return { success: false, error: String(err) };
  }
}

