import { handleCors, getCorsHeaders } from "../_shared/cors.ts";
import { authenticateRequest } from "../_shared/auth.ts";
import { createServiceClient } from "../_shared/supabase.ts";
import { enforceSessionRateLimitAsync } from "../_shared/rateLimit.ts";
import { logAuditEventFromRequest } from "../_shared/audit.ts";
import { revokeGoogleToken, isCalendarConfigured } from "../_shared/googleCalendar.ts";

async function rpcJson(
  db: ReturnType<typeof createServiceClient>,
  fn: string,
  body: Record<string, unknown>,
): Promise<{ ok: boolean; data: unknown }> {
  const { data, error } = await db.rpc(fn, body);
  if (error) return { ok: false, data: null };
  return { ok: true, data };
}

async function getStoredRefreshToken(
  db: ReturnType<typeof createServiceClient>,
  userId: string,
): Promise<string | null> {
  const { ok, data } = await rpcJson(db, "get_google_refresh_token", {
    p_user_id: userId,
  });
  if (!ok || !data || typeof data !== "object") return null;
  const tok = (data as { refresh_token?: string }).refresh_token;
  return typeof tok === "string" && tok.length > 0 ? tok : null;
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

    const jsonHeaders = {
      ...getCorsHeaders(req),
      "Content-Type": "application/json",
    };

    if (req.method === "GET") {
      const { ok, data } = await rpcJson(db, "get_calendar_connection_status", {
        p_user_id: user.id,
      });
      let row: Record<string, unknown> = {};
      if (ok && data && typeof data === "object") {
        row = data as Record<string, unknown>;
      } else {
        const grant = await rpcJson(db, "has_google_calendar_grant", { p_user_id: user.id });
        const connected = grant.ok && grant.data === true;
        row = {
          connected,
          status: connected ? "connected" : "disconnected",
          reauth_required: false,
        };
      }
      const connected = row.connected === true;
      const status = typeof row.status === "string" ? row.status : "disconnected";
      return new Response(
        JSON.stringify({
          connected,
          status,
          reauth_required: row.reauth_required === true,
          google_email: typeof row.google_email === "string" ? row.google_email : null,
          last_error_code: typeof row.last_error_code === "string" ? row.last_error_code : null,
          configured: isCalendarConfigured(),
        }),
        { headers: jsonHeaders },
      );
    }

    if (req.method !== "POST") {
      return new Response(
        JSON.stringify({ error: "Method not allowed", code: "INVALID_REQUEST" }),
        { status: 405, headers: jsonHeaders },
      );
    }

    const storedToken = await getStoredRefreshToken(db, user.id);

    let revokeAttempted = false;
    let revokeOk = false;
    if (storedToken) {
      revokeAttempted = true;
      revokeOk = await revokeGoogleToken(storedToken);
      if (!revokeOk) {
        console.warn("[disconnect-calendar] Token revoke failed for user", user.id);
      }
    }

    await rpcJson(db, "clear_google_refresh_token", { p_user_id: user.id });

    await db
      .from("calendar_integrations")
      .update({ refresh_token: null, access_token: null, expires_at: null })
      .eq("user_id", user.id)
      .eq("provider", "google");

    // Never unlink Google as a login identity. Calendar grant is independent of Sign-In.
    await logAuditEventFromRequest({
      req,
      userId: user.id,
      action: "CALENDAR_DISCONNECTED",
      resourceType: "calendar",
      status: "success",
      metadata: { revoke_attempted: revokeAttempted, revoke_ok: revokeOk },
    });

    return new Response(
      JSON.stringify({
        success: true,
        connected: false,
        status: "disconnected",
        revoke_attempted: revokeAttempted,
        revoke_ok: revokeOk,
        unlinked: false,
        preserved_google_login: true,
      }),
      { headers: jsonHeaders },
    );
  } catch (err) {
    console.error("[disconnect-calendar] Error:", err);
    return new Response(
      JSON.stringify({ error: "Internal server error" }),
      { status: 500, headers: getCorsHeaders(req) },
    );
  }
});
