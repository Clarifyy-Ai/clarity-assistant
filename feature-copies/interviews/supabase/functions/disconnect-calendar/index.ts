import { handleCors, getCorsHeaders } from "../_shared/cors.ts";
import { authenticateRequest } from "../_shared/auth.ts";
import { createServiceClient } from "../_shared/supabase.ts";
import { enforceSessionRateLimitAsync } from "../_shared/rateLimit.ts";

type GoogleIdentity = {
  id: string;
  refreshToken: string | null;
};

type AdminUserSnapshot = {
  identities: Array<{ id: string; provider: string; identity_data?: Record<string, unknown>; refresh_token?: string }>;
};

async function fetchAdminUser(
  supabaseUrl: string,
  serviceKey: string,
  userId: string,
): Promise<AdminUserSnapshot | null> {
  const res = await fetch(`${supabaseUrl}/auth/v1/admin/users/${userId}`, {
    headers: {
      apikey: serviceKey,
      Authorization: `Bearer ${serviceKey}`,
    },
  });
  if (!res.ok) return null;
  const userData = await res.json();
  return { identities: userData?.identities ?? [] };
}

function getGoogleIdentity(snapshot: AdminUserSnapshot | null): GoogleIdentity | null {
  if (!snapshot) return null;
  const identity = snapshot.identities.find((i) => i.provider === "google");
  if (!identity) return null;
  const refreshToken =
    (identity.identity_data?.refresh_token as string | undefined) ??
    identity.refresh_token ??
    null;
  return { id: identity.id, refreshToken };
}

/** True when Google is the only auth identity (unlinking would lock the user out). */
function usesGoogleAsSoleLogin(snapshot: AdminUserSnapshot | null): boolean {
  if (!snapshot?.identities?.length) return false;
  const providers = new Set(snapshot.identities.map((i) => i.provider));
  return providers.has("google") && providers.size === 1;
}

async function rpcJson(
  supabaseUrl: string,
  serviceKey: string,
  fn: string,
  body: Record<string, unknown>,
): Promise<{ ok: boolean; data: unknown }> {
  const res = await fetch(`${supabaseUrl}/rest/v1/rpc/${fn}`, {
    method: "POST",
    headers: {
      apikey: serviceKey,
      Authorization: `Bearer ${serviceKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  }).catch(() => null);

  if (!res) return { ok: false, data: null };
  const data = await res.json().catch(() => null);
  return { ok: res.ok, data };
}

async function getStoredRefreshToken(
  supabaseUrl: string,
  serviceKey: string,
  userId: string,
): Promise<string | null> {
  const { ok, data } = await rpcJson(supabaseUrl, serviceKey, "get_google_refresh_token", {
    p_user_id: userId,
  });
  if (!ok || !data || typeof data !== "object") return null;
  const tok = (data as { refresh_token?: string }).refresh_token;
  return typeof tok === "string" && tok.length > 0 ? tok : null;
}

async function hasCalendarGrant(
  supabaseUrl: string,
  serviceKey: string,
  userId: string,
): Promise<boolean> {
  const { ok, data } = await rpcJson(supabaseUrl, serviceKey, "has_google_calendar_grant", {
    p_user_id: userId,
  });
  if (ok && typeof data === "boolean") return data;
  // Fallback: stored token present
  const tok = await getStoredRefreshToken(supabaseUrl, serviceKey, userId);
  return !!tok;
}

async function clearStoredRefreshToken(
  supabaseUrl: string,
  serviceKey: string,
  userId: string,
): Promise<void> {
  await rpcJson(supabaseUrl, serviceKey, "clear_google_refresh_token", {
    p_user_id: userId,
  });
}

async function revokeGoogleToken(token: string): Promise<boolean> {
  const revokeRes = await fetch("https://oauth2.googleapis.com/revoke", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: `token=${encodeURIComponent(token)}`,
  }).catch(() => null);
  return !!revokeRes?.ok;
}

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

    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const serviceKey  = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

    if (!supabaseUrl || !serviceKey) {
      return new Response(
        JSON.stringify({ error: "Server configuration missing" }),
        { status: 500, headers: getCorsHeaders(req) },
      );
    }

    // ------------------------------
    // GET → Check calendar connection (stored grant, not merely Google login)
    // ------------------------------
    if (req.method === "GET") {
      let connected = await hasCalendarGrant(supabaseUrl, serviceKey, user.id);

      if (!connected) {
        const { data: row } = await db
          .from("google_calendar_refresh_tokens")
          .select("status")
          .eq("user_id", user.id)
          .maybeSingle();

        // Pre-persistence legacy: Google identity linked, never soft-revoked.
        if (!row) {
          const snapshot = await fetchAdminUser(supabaseUrl, serviceKey, user.id);
          connected = getGoogleIdentity(snapshot) !== null;
        }
      }

      return new Response(
        JSON.stringify({ connected }),
        { headers: { ...getCorsHeaders(req), "Content-Type": "application/json" } },
      );
    }

    // ------------------------------
    // POST → Soft disconnect preferred
    // ------------------------------
    const snapshot = await fetchAdminUser(supabaseUrl, serviceKey, user.id);
    const identity = getGoogleIdentity(snapshot);
    const storedToken = await getStoredRefreshToken(supabaseUrl, serviceKey, user.id);
    const tokenToRevoke = storedToken ?? identity?.refreshToken ?? null;

    let revokeAttempted = false;
    let revokeOk = false;
    if (tokenToRevoke) {
      revokeAttempted = true;
      revokeOk = await revokeGoogleToken(tokenToRevoke);
      if (!revokeOk) {
        console.warn("[disconnect-calendar] Token revoke failed for user", user.id);
      }
    }

    // Always clear persisted calendar refresh token (soft disconnect marker).
    await clearStoredRefreshToken(supabaseUrl, serviceKey, user.id);

    // Also clear legacy calendar_integrations tokens if present.
    await db
      .from("calendar_integrations")
      .update({ refresh_token: null, access_token: null, expires_at: null })
      .eq("user_id", user.id)
      .eq("provider", "google");

    const soleGoogleLogin = usesGoogleAsSoleLogin(snapshot);
    let unlinked = false;

    // Only unlink Google identity when the user has another login method.
    // Never unlink when Google is their sole auth identity.
    if (identity && !soleGoogleLogin) {
      const unlinkRes = await fetch(
        `${supabaseUrl}/auth/v1/admin/users/${user.id}/identities/${identity.id}`,
        {
          method: "DELETE",
          headers: {
            apikey: serviceKey,
            Authorization: `Bearer ${serviceKey}`,
          },
        },
      );

      if (unlinkRes.ok) {
        unlinked = true;
      } else {
        const body = await unlinkRes.text();
        console.warn(
          "[disconnect-calendar] Optional unlink skipped/failed:",
          unlinkRes.status,
          body,
        );
        // Soft disconnect already succeeded — do not fail the request.
      }
    }

    return new Response(
      JSON.stringify({
        success: true,
        revoke_attempted: revokeAttempted,
        revoke_ok: revokeOk,
        unlinked,
        preserved_google_login: soleGoogleLogin || (!!identity && !unlinked),
      }),
      { headers: { ...getCorsHeaders(req), "Content-Type": "application/json" } },
    );

  } catch (err) {
    console.error("[disconnect-calendar] Error:", err);
    return new Response(
      JSON.stringify({ error: "Internal server error" }),
      { status: 500, headers: getCorsHeaders(req) },
    );
  }
});
