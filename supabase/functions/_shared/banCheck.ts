import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";

/**
 * Returns true when the given user is currently banned.
 * Fails open (returns false) on transient DB errors so a transient outage
 * doesn't lock out the entire user base; the front-end ban flag is the
 * authoritative gate for admin actions, this is just a server-side belt.
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
    console.error("[banCheck] lookup failed:", error.message);
    return false;
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
