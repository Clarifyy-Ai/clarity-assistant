import { handleCors, corsHeaders } from "../_shared/cors.ts";
import { createServiceClient } from "../_shared/supabase.ts";

// ─────────────────────────────────────────────────────────────────────────────
// disconnect-calendar — Manage Google Calendar integration server-side
//
// GET  → Check whether the user has a linked Google identity (connection status)
//        Returns: { connected: boolean }
//
// POST → Revoke and unlink the Google Calendar integration
//        Uses the service role to:
//          1. Fetch the user's Google identity to get their refresh_token
//          2. Call Google's token revocation endpoint to invalidate the token
//          3. Unlink the Google identity from the user's Supabase account
//        The user's Supabase session is preserved — they remain logged in.
//        Returns: { success: boolean, revoke_attempted: boolean }
// ─────────────────────────────────────────────────────────────────────────────

async function getGoogleIdentity(
  supabaseUrl: string,
  serviceKey: string,
  userId: string
): Promise<{ id: string; refreshToken: string | null } | null> {
  const userRes = await fetch(
    `${supabaseUrl}/auth/v1/admin/users/${userId}`,
    {
      headers: {
        "apikey": serviceKey,
        "Authorization": `Bearer ${serviceKey}`,
      },
    }
  );

  if (!userRes.ok) return null;

  const userData = await userRes.json();
  const googleIdentity = userData?.identities?.find(
    (i: any) => i.provider === "google"
  );

  if (!googleIdentity) return null;

  const refreshToken =
    googleIdentity?.identity_data?.refresh_token ??
    googleIdentity?.refresh_token ??
    null;

  return { id: googleIdentity.id, refreshToken };
}

Deno.serve(async (req) => {
  const cors = handleCors(req);
  if (cors) return cors;

  const db = createServiceClient();

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: "Missing Authorization header" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const token = authHeader.replace("Bearer ", "");
    const { data: { user }, error: authError } = await db.auth.getUser(token);
    if (authError || !user) {
      return new Response(
        JSON.stringify({ error: "Unauthorized" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
    const serviceKey  = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";

    // ── GET: check connection status ──────────────────────────────────────────
    if (req.method === "GET") {
      const identity = await getGoogleIdentity(supabaseUrl, serviceKey, user.id);
      return new Response(
        JSON.stringify({ connected: identity !== null }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // ── POST: disconnect ──────────────────────────────────────────────────────
    const identity = await getGoogleIdentity(supabaseUrl, serviceKey, user.id);

    if (!identity) {
      // Not connected — treat as success (idempotent)
      return new Response(
        JSON.stringify({ success: true, revoke_attempted: false }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    let revokeAttempted = false;

    // Attempt to revoke the refresh token at Google
    if (identity.refreshToken) {
      revokeAttempted = true;
      const revokeRes = await fetch(
        `https://oauth2.googleapis.com/revoke?token=${encodeURIComponent(identity.refreshToken)}`,
        { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" } }
      );
      if (!revokeRes.ok) {
        // Token may already be expired/invalid — log but continue with unlink
        console.warn(
          "[disconnect-calendar] Google revoke returned:",
          revokeRes.status,
          await revokeRes.text()
        );
      }
    }

    // Unlink the Google identity from the user using admin API
    const unlinkRes = await fetch(
      `${supabaseUrl}/auth/v1/admin/users/${user.id}/identities/${identity.id}`,
      {
        method: "DELETE",
        headers: {
          "apikey": serviceKey,
          "Authorization": `Bearer ${serviceKey}`,
        },
      }
    );

    if (!unlinkRes.ok) {
      const body = await unlinkRes.text();
      console.error("[disconnect-calendar] Identity unlink failed:", unlinkRes.status, body);
      return new Response(
        JSON.stringify({
          success: false,
          error: "Failed to unlink Google identity. Please try again.",
          revoke_attempted: revokeAttempted,
        }),
        { status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    return new Response(
      JSON.stringify({ success: true, revoke_attempted: revokeAttempted }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    console.error("[disconnect-calendar] Error:", message);
    return new Response(
      JSON.stringify({ error: message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
