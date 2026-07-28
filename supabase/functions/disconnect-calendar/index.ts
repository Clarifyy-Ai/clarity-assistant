import { handleCors, getCorsHeaders } from "../_shared/cors.ts";
import { authenticateRequest } from "../_shared/auth.ts";
import { createServiceClient } from "../_shared/supabase.ts";
import { enforceSessionRateLimitAsync } from "../_shared/rateLimit.ts";

// -----------------------------------------------------------
// Helper: fetch Google identity + refresh token (uses SRK)
// -----------------------------------------------------------
async function getGoogleIdentity(
  supabaseUrl: string,
  serviceKey: string,
  userId: string
): Promise<{ id: string; refreshToken: string | null } | null> {
  const res = await fetch(`${supabaseUrl}/auth/v1/admin/users/${userId}`, {
    headers: {
      apikey: serviceKey,
      Authorization: `Bearer ${serviceKey}`,
    },
  });

  if (!res.ok) return null;

  const userData = await res.json();
  const identity = userData?.identities?.find((i: any) => i.provider === "google");
  if (!identity) return null;

  const refreshToken =
    identity?.identity_data?.refresh_token ??
    identity?.refresh_token ??
    null;

  return { id: identity.id, refreshToken };
}

// -----------------------------------------------------------
// Main handler
// -----------------------------------------------------------
Deno.serve(async (req) => {
  const cors = handleCors(req);
  if (cors) return cors;

  try {
    const auth = await authenticateRequest(req);
    if (auth.error) return auth.error;
    const user = auth.context.user;
    const db = createServiceClient();

    const rateLimited = await enforceSessionRateLimitAsync(
      db,
      "disconnect-calendar",
      user.id,
    );
    if (rateLimited) return rateLimited;

    // ------------------------------
    // ENV validation
    // ------------------------------
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const serviceKey  = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

    if (!supabaseUrl || !serviceKey) {
      return new Response(
        JSON.stringify({ error: "Server configuration missing" }),
        { status: 500, headers: getCorsHeaders(req) }
      );
    }

    // ------------------------------
    // GET → Check connection status
    // ------------------------------
    if (req.method === "GET") {
      const identity = await getGoogleIdentity(supabaseUrl, serviceKey, user.id);
      return new Response(
        JSON.stringify({ connected: identity !== null }),
        { headers: { ...getCorsHeaders(req), "Content-Type": "application/json" } }
      );
    }

    // ------------------------------
    // POST → Disconnect
    // ------------------------------
    const identity = await getGoogleIdentity(supabaseUrl, serviceKey, user.id);

    // Idempotent: if no identity, say success
    if (!identity) {
      return new Response(
        JSON.stringify({ success: true, revoke_attempted: false }),
        { headers: getCorsHeaders(req) }
      );
    }

    let revokeAttempted = false;

    // ------------------------------
    // Google token revoke
    // ------------------------------
    if (identity.refreshToken) {
      revokeAttempted = true;

      const revokeRes = await fetch(
        "https://oauth2.googleapis.com/revoke",
        {
          method: "POST",
          headers: { "Content-Type": "application/x-www-form-urlencoded" },
          body: `token=${encodeURIComponent(identity.refreshToken)}`,
        }
      );

      if (!revokeRes.ok) {
        const body = await revokeRes.text();
        console.warn("[disconnect-calendar] Token revoke failed:", revokeRes.status, body);
        // continue with unlink
      }
    }

    // ------------------------------
    // Unlink identity from Supabase
    // ------------------------------
    const unlinkRes = await fetch(
      `${supabaseUrl}/auth/v1/admin/users/${user.id}/identities/${identity.id}`,
      {
        method: "DELETE",
        headers: {
          apikey: serviceKey,
          Authorization: `Bearer ${serviceKey}`,
        },
      }
    );

    if (!unlinkRes.ok) {
      const body = await unlinkRes.text();
      console.error("[disconnect-calendar] Unlink failed:", unlinkRes.status, body);

      return new Response(
        JSON.stringify({
          success: false,
          error: "Unable to unlink Google account. Try again later.",
          revoke_attempted: revokeAttempted,
        }),
        { status: 502, headers: getCorsHeaders(req) }
      );
    }

    return new Response(
      JSON.stringify({ success: true, revoke_attempted: revokeAttempted }),
      { headers: getCorsHeaders(req) }
    );

  } catch (err) {
    console.error("[disconnect-calendar] Error:", err);
    return new Response(
      JSON.stringify({ error: "Internal server error" }),
      { status: 500, headers: getCorsHeaders(req) }
    );
  }
});
