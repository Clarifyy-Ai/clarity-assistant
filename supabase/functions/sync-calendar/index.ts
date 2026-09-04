// Canonical Google Calendar Edge Function.
// Login OAuth is Supabase Auth. Calendar OAuth is this function only.

import {
  handleCors,
  parseBody,
  requireAuth,
  successResponse,
  errorResponse,
  log,
} from "../_shared/utils.ts";
import { getCorsHeaders } from "../_shared/cors.ts";
import { createServiceClient } from "../_shared/supabase.ts";
import { requirePlan } from "../_shared/requirePlan.ts";
import { requireCapabilityForFunction } from "../_shared/requireCapability.ts";
import { enforceSessionRateLimitAsync } from "../_shared/rateLimit.ts";
import { logAuditEventFromRequest } from "../_shared/audit.ts";
import {
  isCalendarConfigured,
  googleClientId,
  calendarOAuthRedirectUri,
  generatePkce,
  buildGoogleAuthorizationUrl,
  exchangeGoogleAuthorizationCode,
  refreshGoogleAccessTokenFromSecret,
  fetchGoogleAccountProfile,
  googleCalendarWriteEvent,
  googleCalendarDeleteEvent,
  googleCalendarFetch,
  mapGoogleCalendarHttpStatus,
  canStartCalendarOAuth,
  calendarOauthAudienceStatus,
  GOOGLE_CALENDAR_OAUTH_SCOPES,
  type GoogleCalendarDomainCode,
} from "../_shared/googleCalendar.ts";

const CALENDAR_CONFIGURED = isCalendarConfigured();
const FN = "sync-calendar";

interface GoogleCalendarEvent {
  id:           string;
  summary?:     string;
  description?: string;
  location?:    string;
  start?:       { dateTime?: string; date?: string };
  end?:         { dateTime?: string; date?: string };
  hangoutLink?: string;
  conferenceData?: {
    entryPoints?: Array<{ entryPointType: string; uri: string }>;
  };
}

type InterviewStage =
  | "phone_screen"
  | "technical_round"
  | "final_round"
  | "general";

const KEYWORDS = [
  "interview", "screening", "screen", "hiring", "recruiter",
  "technical", "onsite", "on-site", "assessment", "coding",
  "panel interview", "phone screen", "video call", "loop",
];

function safe(text: unknown, max = 120): string {
  return String(text ?? "")
    .replace(/[<>]/g, "")
    .replace(/[`"]/g, "")
    .slice(0, max)
    .trim();
}

function isInterviewEvent(evt: GoogleCalendarEvent): boolean {
  const s = (evt.summary     ?? "").toLowerCase();
  const d = (evt.description ?? "").toLowerCase();
  return KEYWORDS.some((k) => s.includes(k) || d.includes(k));
}

function extractMeetingUrl(evt: GoogleCalendarEvent): string | null {
  if (evt.hangoutLink) return evt.hangoutLink;
  const v = evt.conferenceData?.entryPoints?.find(
    (e) => e.entryPointType === "video",
  );
  return v?.uri ?? null;
}

function classifyType(summary: string): string {
  const s = summary.toLowerCase();
  if (s.includes("technical") || s.includes("coding")) return "technical";
  if (s.includes("phone")     || s.includes("screen")) return "phone_screen";
  if (s.includes("panel")     || s.includes("onsite")) return "panel";
  if (s.includes("hr")        || s.includes("recruiter")) return "hr";
  if (s.includes("assessment")|| s.includes("take-home")) return "take_home";
  return "general";
}

function classifyStage(type: string): InterviewStage {
  if (type === "phone_screen" || type === "hr")   return "phone_screen";
  if (type === "technical")                        return "technical_round";
  if (type === "panel")                            return "final_round";
  return "general";
}

function extractCompany(summary: string): string {
  const patterns = [
    /interview\s+(?:at|with|@)\s+(.+?)(?:\s*[-–—|]|$)/i,
    /(.+?)\s+interview/i,
    /(.+?)\s+(?:phone\s+screen|screening|technical|onsite)/i,
  ];
  for (const p of patterns) {
    const m = summary.match(p);
    if (m?.[1]) return safe(m[1], 80);
  }
  return safe(summary, 60);
}

function extractRole(summary: string): string {
  const m = summary.match(
    /(?:for\s+(?:the\s+)?|role:\s*)(.+?)(?:\s+(?:at|with|@|interview)|$)/i,
  );
  return safe(m?.[1] ?? "Role TBD", 80);
}

function notConfiguredResponse(req: Request): Response {
  console.warn(
    "[sync-calendar] Google OAuth credentials not configured. " +
    "Set GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET to enable this feature.",
  );
  return new Response(
    JSON.stringify({
      error:   "Calendar sync is not available yet.",
      code:    "NOT_CONFIGURED",
      message: "Google Calendar is not configured on this deployment. Set GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET.",
    }),
    {
      status:  501,
      headers: { ...getCorsHeaders(req), "Content-Type": "application/json" },
    },
  );
}

function domainError(
  req: Request,
  code: GoogleCalendarDomainCode,
  http: number,
  message: string,
): Response {
  return errorResponse(message, code, http, req);
}

type ServiceDb = ReturnType<typeof createServiceClient>;

async function rpcJson(
  db: ServiceDb,
  fn: string,
  args: Record<string, unknown>,
): Promise<{ ok: boolean; data: unknown; error: string | null }> {
  const { data, error } = await db.rpc(fn, args);
  if (error) return { ok: false, data: null, error: error.message };
  return { ok: true, data, error: null };
}

async function getStoredRefreshToken(db: ServiceDb, userId: string): Promise<string | null> {
  const { ok, data } = await rpcJson(db, "get_google_refresh_token", { p_user_id: userId });
  if (!ok || !data || typeof data !== "object") return null;
  const tok = (data as { refresh_token?: string }).refresh_token;
  return typeof tok === "string" && tok.length > 0 ? tok : null;
}

async function markReauth(
  db: ServiceDb,
  userId: string,
  code: string,
  message: string,
): Promise<void> {
  await rpcJson(db, "mark_google_calendar_reauth", {
    p_user_id: userId,
    p_error_code: code,
    p_error: message,
  });
}

async function resolveCalendarAccessToken(
  db: ServiceDb,
  userId: string,
): Promise<
  | { ok: true; accessToken: string }
  | { ok: false; code: GoogleCalendarDomainCode; http: number; message: string }
> {
  const refreshToken = await getStoredRefreshToken(db, userId);
  if (!refreshToken) {
    return {
      ok: false,
      code: "CALENDAR_NOT_CONNECTED",
      http: 409,
      message: "Google Calendar is not connected.",
    };
  }

  const refreshed = await refreshGoogleAccessTokenFromSecret(refreshToken);
  if (!refreshed.ok) {
    if (refreshed.code === "REAUTH_REQUIRED") {
      await markReauth(db, userId, "REAUTH_REQUIRED", "Google Calendar authorization was revoked or expired.");
      return {
        ok: false,
        code: "REAUTH_REQUIRED",
        http: 401,
        message: "Google Calendar access expired. Reconnect your calendar.",
      };
    }
    const mapped = refreshed.code === "RATE_LIMITED"
      ? mapGoogleCalendarHttpStatus(429)
      : refreshed.code === "SERVICE_UNAVAILABLE"
        ? mapGoogleCalendarHttpStatus(503)
        : { code: "SYNC_ERROR" as const, http: 502, message: "Calendar synchronization failed." };
    return { ok: false, code: mapped.code, http: mapped.http, message: mapped.message };
  }

  if (refreshed.refreshToken) {
    await rpcJson(db, "upsert_google_refresh_token", {
      p_user_id: userId,
      p_refresh_token: refreshed.refreshToken,
    });
  }

  return { ok: true, accessToken: refreshed.accessToken };
}

async function fetchEvents(
  token: string,
  days: number,
): Promise<{ events: GoogleCalendarEvent[] | null; status: number }> {
  const now  = new Date();
  const tMin = now.toISOString();
  const tMax = new Date(now.getTime() + days * 86_400_000).toISOString();

  const url = new URL(
    "https://www.googleapis.com/calendar/v3/calendars/primary/events",
  );
  url.searchParams.set("timeMin",       tMin);
  url.searchParams.set("timeMax",       tMax);
  url.searchParams.set("singleEvents",  "true");
  url.searchParams.set("orderBy",       "startTime");
  url.searchParams.set("maxResults",    "50");

  const res = await googleCalendarFetch(url.toString(), {
    headers: { Authorization: `Bearer ${token}` },
  });

  if (!res.ok) return { events: null, status: res.status };

  const json = await res.json().catch(() => null);
  return { events: json?.items ?? [], status: 200 };
}

async function setInterviewSync(
  db: ServiceDb,
  userId: string,
  interviewId: string,
  patch: Record<string, unknown>,
): Promise<void> {
  await db
    .from("scheduled_interviews")
    .update({ ...patch, updated_at: new Date().toISOString() })
    .eq("id", interviewId)
    .eq("user_id", userId);
}

Deno.serve(async (req) => {
  const cors = handleCors(req);
  if (cors) return cors;

  if (!CALENDAR_CONFIGURED) {
    return notConfiguredResponse(req);
  }

  const db = createServiceClient();

  try {
    const auth = await requireAuth(req);
    const userId = auth.userId;

    const rateLimited = await enforceSessionRateLimitAsync(db, FN, userId);
    if (rateLimited) return rateLimited;

    const planGate = requirePlan(auth.planId, "pro", req);
    if (planGate) return planGate;
    const capabilityGate = await requireCapabilityForFunction(auth.planId, FN, req);
    if (capabilityGate) return capabilityGate;

    const body = await parseBody<{
      probe?:                   boolean;
      action?:                  string;
      code?:                    string;
      state?:                   string;
      error?:                   string;
      error_description?:       string;
      days_ahead?:              number;
      interview_id?:            string;
      summary?:                 string;
      description?:             string;
      start?:                   string;
      end?:                     string;
      time_zone?:               string;
      location?:                string;
      event_id?:                string;
      provider_token?:          string;
      provider_refresh_token?:  string;
      store_token_only?:        boolean;
    }>(req);

    if (body?.probe === true) {
      const audience = calendarOauthAudienceStatus(auth.email);
      return successResponse({
        available: true,
        configured: true,
        publicOauth: audience.publicOauth,
        connectAllowed: audience.connectAllowed,
        reason: audience.reason,
      }, undefined, 200, req);
    }

    const action = typeof body?.action === "string" ? body.action.trim() : "";

    // Client must never send Google tokens. Ignore if present.
    if (body?.provider_token || body?.provider_refresh_token || body?.store_token_only) {
      log(FN, "warn", "Rejected client-supplied Google token fields");
    }

    // ── oauth_start ──────────────────────────────────────────────
    if (action === "oauth_start") {
      const existing = await rpcJson(db, "get_calendar_connection_status", { p_user_id: userId });
      const status = (existing.data ?? {}) as { connected?: boolean; status?: string };
      if (status.connected === true) {
        return successResponse({
          already_connected: true,
          connected: true,
          status: "connected",
        }, undefined, 200, req);
      }

      if (!canStartCalendarOAuth(auth.email)) {
        return errorResponse(
          "Calendar sync not available yet (Google verification pending). You can still schedule interviews.",
          "OAUTH_NOT_PUBLIC",
          403,
          req,
        );
      }

      await db.from("calendar_oauth_states")
        .delete()
        .lt("expires_at", new Date().toISOString());
      await db.from("calendar_oauth_states")
        .delete()
        .not("consumed_at", "is", null);

      const pkce = await generatePkce();
      const redirectUri = calendarOAuthRedirectUri(req);
      const expiresAt = new Date(Date.now() + 10 * 60 * 1000).toISOString();

      const { error: stateErr } = await db.from("calendar_oauth_states").insert({
        state: pkce.state,
        user_id: userId,
        code_verifier: pkce.verifier,
        redirect_uri: redirectUri,
        nonce: pkce.nonce,
        expires_at: expiresAt,
      });
      if (stateErr) {
        log(FN, "error", "Failed to persist OAuth state", stateErr);
        return errorResponse("Could not start Google Calendar authorization.", "SYNC_ERROR", 500, req);
      }

      const authorizationUrl = buildGoogleAuthorizationUrl({
        clientId: googleClientId(),
        redirectUri,
        state: pkce.state,
        codeChallenge: pkce.challenge,
        nonce: pkce.nonce,
      });

      return successResponse({
        authorization_url: authorizationUrl,
        already_connected: false,
        redirect_uri: redirectUri,
      }, undefined, 200, req);
    }

    // ── oauth_callback ───────────────────────────────────────────
    if (action === "oauth_callback") {
      const oauthError = typeof body?.error === "string" ? body.error.trim() : "";
      if (oauthError) {
        const denied = oauthError === "access_denied";
        await logAuditEventFromRequest({
          req,
          userId,
          action: "CALENDAR_OAUTH_FAILED",
          resourceType: "calendar",
          status: "failure",
          metadata: { reason: denied ? "access_denied" : "oauth_error" },
        });
        return errorResponse(
          denied ? "Google Calendar permission was denied." : "Google Calendar authorization failed.",
          denied ? "NOT_AUTHORIZED" : "INVALID_REQUEST",
          denied ? 403 : 400,
          req,
        );
      }

      const code = typeof body?.code === "string" ? body.code.trim() : "";
      const state = typeof body?.state === "string" ? body.state.trim() : "";
      if (!code || !state) {
        return errorResponse("Missing authorization code or state.", "INVALID_REQUEST", 400, req);
      }

      const { data: stateRow } = await db
        .from("calendar_oauth_states")
        .select("state, user_id, code_verifier, redirect_uri, nonce, expires_at, consumed_at")
        .eq("state", state)
        .maybeSingle();

      if (!stateRow) {
        return errorResponse("Invalid or expired authorization state.", "INVALID_REQUEST", 400, req);
      }
      if (stateRow.user_id !== userId) {
        await logAuditEventFromRequest({
          req,
          userId,
          action: "CALENDAR_OAUTH_FAILED",
          resourceType: "calendar",
          status: "blocked",
          metadata: { reason: "state_user_mismatch" },
        });
        return errorResponse("Authorization state does not match this account.", "NOT_AUTHORIZED", 403, req);
      }
      if (stateRow.consumed_at) {
        return errorResponse("This authorization code was already used.", "INVALID_REQUEST", 400, req);
      }
      if (new Date(stateRow.expires_at).getTime() < Date.now()) {
        return errorResponse("Authorization state expired. Please connect again.", "INVALID_REQUEST", 400, req);
      }

      const { data: consumed } = await db
        .from("calendar_oauth_states")
        .update({ consumed_at: new Date().toISOString() })
        .eq("state", state)
        .is("consumed_at", null)
        .select("state")
        .maybeSingle();
      if (!consumed) {
        return errorResponse("This authorization code was already used.", "INVALID_REQUEST", 400, req);
      }

      const expectedRedirect = calendarOAuthRedirectUri(req);
      if (stateRow.redirect_uri !== expectedRedirect) {
        await logAuditEventFromRequest({
          req,
          userId,
          action: "CALENDAR_OAUTH_FAILED",
          resourceType: "calendar",
          status: "failure",
          metadata: { reason: "redirect_mismatch" },
        });
        return errorResponse("Authorization callback mismatch. Please connect again.", "INVALID_REQUEST", 400, req);
      }

      const exchanged = await exchangeGoogleAuthorizationCode({
        code,
        redirectUri: stateRow.redirect_uri,
        codeVerifier: stateRow.code_verifier,
      });
      if (!exchanged.ok) {
        await logAuditEventFromRequest({
          req,
          userId,
          action: "CALENDAR_OAUTH_FAILED",
          resourceType: "calendar",
          status: "failure",
          metadata: { reason: exchanged.code },
        });
        return domainError(
          req,
          exchanged.code,
          exchanged.status,
          exchanged.code === "INVALID_REQUEST"
            ? "Google rejected the authorization code. Please connect again."
            : "Could not complete Google Calendar authorization.",
        );
      }

      if (!exchanged.tokens.refreshToken) {
        await logAuditEventFromRequest({
          req,
          userId,
          action: "CALENDAR_OAUTH_FAILED",
          resourceType: "calendar",
          status: "failure",
          metadata: { reason: "missing_refresh_token" },
        });
        return errorResponse(
          "Google did not return a refresh token. Disconnect any prior grant in Google Account permissions and connect again.",
          "REAUTH_REQUIRED",
          401,
          req,
        );
      }

      const profile = await fetchGoogleAccountProfile(exchanged.tokens.accessToken);
      const scopes = (exchanged.tokens.scope ?? GOOGLE_CALENDAR_OAUTH_SCOPES).split(/\s+/).filter(Boolean);

      const upsert = await rpcJson(db, "upsert_google_refresh_token", {
        p_user_id: userId,
        p_refresh_token: exchanged.tokens.refreshToken,
        p_google_account_id: profile.id,
        p_google_email: profile.email,
        p_scopes: scopes,
      });

      if (!upsert.ok) {
        const msg = upsert.error ?? "";
        if (msg.includes("GOOGLE_ACCOUNT_IN_USE") || msg.includes("23505")) {
          await logAuditEventFromRequest({
            req,
            userId,
            action: "CALENDAR_OAUTH_FAILED",
            resourceType: "calendar",
            status: "blocked",
            metadata: { reason: "account_in_use" },
          });
          return errorResponse(
            "That Google Calendar account is already connected to another Career Pilot user.",
            "CONFLICT",
            409,
            req,
          );
        }
        log(FN, "error", "Failed to persist calendar grant", upsert.error);
        return errorResponse("Could not store Calendar authorization.", "SYNC_ERROR", 500, req);
      }

      const already = Boolean((upsert.data as { already_connected?: boolean } | null)?.already_connected);

      await logAuditEventFromRequest({
        req,
        userId,
        action: "CALENDAR_CONNECTED",
        resourceType: "calendar",
        status: "success",
        metadata: { already_connected: already, has_account: Boolean(profile.id) },
      });

      return successResponse({
        connected: true,
        already_connected: already,
        status: "connected",
        google_email: profile.email,
      }, undefined, 200, req);
    }

    if (action === "connection_status") {
      const { ok, data } = await rpcJson(db, "get_calendar_connection_status", { p_user_id: userId });
      const row = (ok && data && typeof data === "object") ? data as Record<string, unknown> : {};
      return successResponse({
        configured: true,
        connected: row.connected === true,
        status: row.status ?? "disconnected",
        reauth_required: row.reauth_required === true,
        google_email: typeof row.google_email === "string" ? row.google_email : null,
        last_error_code: typeof row.last_error_code === "string" ? row.last_error_code : null,
      }, undefined, 200, req);
    }

    if (action === "write_event" || action === "delete_event") {
      const interviewId = typeof body?.interview_id === "string" ? body.interview_id.trim() : "";
      if (!/^[0-9a-f-]{36}$/i.test(interviewId)) {
        return errorResponse("interview_id is required.", "INVALID_REQUEST", 400, req);
      }

      const { data: owned } = await db
        .from("scheduled_interviews")
        .select("id, calendar_event_id, calendar_provider, calendar_sync_status, timezone")
        .eq("id", interviewId)
        .eq("user_id", userId)
        .maybeSingle();
      if (!owned) {
        return errorResponse("Interview not found.", "NOT_FOUND", 404, req);
      }

      const access = await resolveCalendarAccessToken(db, userId);
      if (!access.ok) {
        if (access.code === "CALENDAR_NOT_CONNECTED") {
          await setInterviewSync(db, userId, interviewId, {
            calendar_sync_status: "not_connected",
            calendar_sync_error: access.message,
          });
        } else if (access.code === "REAUTH_REQUIRED") {
          await setInterviewSync(db, userId, interviewId, {
            calendar_sync_status: "reauth_required",
            calendar_sync_error: access.message,
          });
          await logAuditEventFromRequest({
            req,
            userId,
            action: "CALENDAR_REAUTH_REQUIRED",
            resourceType: "calendar",
            resourceId: interviewId,
            status: "failure",
          });
        }
        return domainError(req, access.code, access.http, access.message);
      }

      if (action === "delete_event") {
        const eventId =
          (typeof body?.event_id === "string" && body.event_id.trim()) ||
          owned.calendar_event_id ||
          "";
        if (!eventId) {
          await setInterviewSync(db, userId, interviewId, {
            calendar_event_id: null,
            calendar_provider: null,
            calendar_sync_status: "cancelled",
            calendar_sync_error: null,
            calendar_synced_at: new Date().toISOString(),
          });
          return successResponse({ deleted: true, already_gone: true }, undefined, 200, req);
        }

        const deleted = await googleCalendarDeleteEvent({
          accessToken: access.accessToken,
          eventId,
        });
        if (!deleted.ok) {
          const mapped = mapGoogleCalendarHttpStatus(deleted.status);
          if (mapped.code === "REAUTH_REQUIRED") {
            await markReauth(db, userId, mapped.code, mapped.message);
          }
          await setInterviewSync(db, userId, interviewId, {
            calendar_sync_status: mapped.code === "REAUTH_REQUIRED" ? "reauth_required" : "sync_error",
            calendar_sync_error: mapped.message,
          });
          await logAuditEventFromRequest({
            req,
            userId,
            action: "CALENDAR_SYNC_FAILED",
            resourceType: "calendar",
            resourceId: interviewId,
            status: "failure",
            metadata: { op: "delete", code: mapped.code },
          });
          return domainError(req, mapped.code, mapped.http, mapped.message);
        }

        await setInterviewSync(db, userId, interviewId, {
          calendar_event_id: null,
          calendar_provider: null,
          calendar_sync_status: "cancelled",
          calendar_sync_error: null,
          calendar_synced_at: new Date().toISOString(),
        });
        await logAuditEventFromRequest({
          req,
          userId,
          action: "CALENDAR_EVENT_CANCELLED",
          resourceType: "calendar",
          resourceId: interviewId,
          status: "success",
          metadata: { already_gone: deleted.alreadyGone },
        });
        return successResponse({ deleted: true, already_gone: deleted.alreadyGone }, undefined, 200, req);
      }

      const summary = safe(body?.summary ?? "Interview", 200);
      const description = safe(body?.description ?? "", 2000);
      const startIso = typeof body?.start === "string" ? body.start : "";
      const endIso = typeof body?.end === "string" ? body.end : "";
      const timeZone =
        typeof body?.time_zone === "string" && body.time_zone.trim() && body.time_zone !== "local"
          ? body.time_zone.trim()
          : (typeof owned.timezone === "string" && owned.timezone.trim() && owned.timezone !== "local"
            ? owned.timezone.trim()
            : "UTC");
      const location = typeof body?.location === "string" ? safe(body.location, 500) : "";
      if (!startIso || !endIso) {
        return errorResponse("start and end are required.", "INVALID_REQUEST", 400, req);
      }

      const existingId =
        (typeof body?.event_id === "string" && body.event_id.trim()) ||
        owned.calendar_event_id ||
        "";

      const written = await googleCalendarWriteEvent({
        accessToken: access.accessToken,
        existingEventId: existingId || null,
        interviewId,
        payload: {
          summary,
          description,
          location: location || undefined,
          start: { dateTime: startIso, timeZone },
          end: { dateTime: endIso, timeZone },
        },
      });

      if (!written.ok) {
        const mapped = mapGoogleCalendarHttpStatus(written.status);
        if (mapped.code === "REAUTH_REQUIRED") {
          await markReauth(db, userId, mapped.code, mapped.message);
        }
        await setInterviewSync(db, userId, interviewId, {
          calendar_sync_status: mapped.code === "REAUTH_REQUIRED" ? "reauth_required" : "sync_error",
          calendar_sync_error: mapped.message,
        });
        await logAuditEventFromRequest({
          req,
          userId,
          action: "CALENDAR_SYNC_FAILED",
          resourceType: "calendar",
          resourceId: interviewId,
          status: "failure",
          metadata: { op: existingId ? "update" : "create", code: mapped.code },
        });
        return domainError(req, mapped.code, mapped.http, mapped.message);
      }

      await setInterviewSync(db, userId, interviewId, {
        calendar_event_id: written.eventId,
        calendar_provider: "google",
        calendar_sync_status: "synced",
        calendar_sync_error: null,
        calendar_synced_at: new Date().toISOString(),
      });
      await logAuditEventFromRequest({
        req,
        userId,
        action: written.created ? "CALENDAR_EVENT_CREATED" : "CALENDAR_EVENT_UPDATED",
        resourceType: "calendar",
        resourceId: interviewId,
        status: "success",
        metadata: { created: written.created },
      });
      return successResponse({
        event_id: written.eventId,
        written: true,
        created: written.created,
        time_zone: timeZone,
      }, undefined, 200, req);
    }

    // ── Import interview-like events (server token only) ─────────
    const daysAhead = Math.min(Number(body?.days_ahead ?? 30), 90);
    const access = await resolveCalendarAccessToken(db, userId);
    if (!access.ok) {
      if (access.code === "REAUTH_REQUIRED") {
        await logAuditEventFromRequest({
          req,
          userId,
          action: "CALENDAR_REAUTH_REQUIRED",
          resourceType: "calendar",
          status: "failure",
        });
      }
      return domainError(req, access.code, access.http, access.message);
    }

    const cal = await fetchEvents(access.accessToken, daysAhead);
    if (!cal.events) {
      const mapped = mapGoogleCalendarHttpStatus(cal.status || 502);
      if (mapped.code === "REAUTH_REQUIRED") {
        await markReauth(db, userId, mapped.code, mapped.message);
      }
      return domainError(req, mapped.code, mapped.http, mapped.message);
    }

    const interviewEvents = cal.events.filter(isInterviewEvent);

    let imported = 0;
    let updated  = 0;
    let skipped  = 0;
    const summaries: Array<{
      title:       string;
      scheduledAt: string | null;
      action:      string;
    }> = [];

    for (const evt of interviewEvents) {
      const summary     = safe(evt.summary ?? "Interview");
      const scheduledAt = evt.start?.dateTime ?? evt.start?.date ?? null;
      const meetingLink = extractMeetingUrl(evt);
      const type        = classifyType(summary);
      const stage       = classifyStage(type);
      const company     = extractCompany(summary);
      const role        = extractRole(summary);

      const { data: existing } = await db
        .from("scheduled_interviews")
        .select("id")
        .eq("user_id", userId)
        .eq("calendar_event_id", evt.id)
        .maybeSingle();

      if (existing) {
        const { error: uErr } = await db
          .from("scheduled_interviews")
          .update({
            company_name: company,
            role_title:   role,
            stage,
            notes:        evt.description ?? null,
            location:     evt.location    ?? null,
            calendar_sync_status: "synced",
            calendar_synced_at: new Date().toISOString(),
            updated_at:   new Date().toISOString(),
          })
          .eq("id", existing.id)
          .eq("user_id", userId);

        if (uErr) {
          log(FN, "error", "Update failed", uErr);
          skipped++;
          continue;
        }

        const { data: rounds } = await db
          .from("interview_rounds")
          .select("id")
          .eq("scheduled_interview_id", existing.id)
          .order("round_number", { ascending: true })
          .limit(1);

        if (rounds?.[0]) {
          await db
            .from("interview_rounds")
            .update({
              round_label:     summary,
              interview_type:  type,
              scheduled_at:    scheduledAt,
              meeting_link:    meetingLink,
              notes:           evt.description ?? null,
              updated_at:      new Date().toISOString(),
            })
            .eq("id", rounds[0].id);
        }

        updated++;
        summaries.push({ title: summary, scheduledAt, action: "updated" });
        continue;
      }

      const { data: newInterview, error: iErr } = await db
        .from("scheduled_interviews")
        .insert({
          user_id:           userId,
          company_name:      company,
          role_title:        role,
          stage,
          priority:          "medium",
          is_remote:         true,
          location:          evt.location ?? null,
          notes:             evt.description ?? null,
          status:            "upcoming",
          calendar_event_id: evt.id,
          calendar_provider: "google",
          calendar_sync_status: "synced",
          calendar_synced_at: new Date().toISOString(),
        })
        .select("id")
        .single();

      if (iErr || !newInterview) {
        log(FN, "error", "Insert failed", iErr);
        skipped++;
        continue;
      }

      const { error: rErr } = await db.from("interview_rounds").insert({
        scheduled_interview_id: newInterview.id,
        round_number:           1,
        round_type:             type,
        round_label:            summary,
        interview_type:         type,
        scheduled_at:           scheduledAt,
        meeting_link:           meetingLink,
        notes:                  evt.description ?? null,
        status:                 "scheduled",
      });

      if (rErr) log(FN, "warn", "Round insert failed", rErr);

      imported++;
      summaries.push({ title: summary, scheduledAt, action: "imported" });
    }

    return successResponse({
      imported,
      updated,
      skipped,
      total_found: interviewEvents.length,
      events:      summaries,
    }, undefined, 200, req);

  } catch (err) {
    if (err instanceof Response) return err;
    log(FN, "error", "Unhandled error", err);
    return errorResponse("Internal server error", "INTERNAL", 500, req);
  }
});
