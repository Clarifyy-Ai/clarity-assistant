import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";

/**
 * Returns true when the given user is currently banned.
 * Fails closed (returns true) on DB errors for write/credit paths so a
 * transient outage cannot bypass suspension checks.
 */
export async function isUserBanned(
  db: SupabaseClient,
  userId: string,
): Promise<boolean> {
  const { data, error } = await db
    .from("profiles")
    .select("is_banned")
    .eq("id", userId)
    .maybeSingle();

  if (error) {
    console.error("[banCheck] lookup failed — treating as banned:", error.message);
    return true;
  }
  return !!(data as { is_banned?: boolean } | null)?.is_banned;
}

export function bannedResponse(corsHeaders: Record<string, string>) {
  return new Response(
    JSON.stringify({
      error: "Account suspended. Contact support.",
      code: "ACCOUNT_BANNED",
    }),
    {
      status: 403,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    },
  );
}
