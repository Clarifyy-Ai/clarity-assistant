// Canonical Google Calendar OAuth + Calendar API helpers for Edge Functions.
// Tokens never leave the server. Do not import this from the browser bundle.

export const GOOGLE_CALENDAR_EVENTS_SCOPE =
  "https://www.googleapis.com/auth/calendar.events";
export const GOOGLE_EMAIL_SCOPE = "email";
export const GOOGLE_CALENDAR_OAUTH_SCOPES = [
  GOOGLE_CALENDAR_EVENTS_SCOPE,
  GOOGLE_EMAIL_SCOPE,
].join(" ");

export const PRODUCTION_APP_URL = "https://clarify.ai.sltfinanceindia.com";
export const CALENDAR_OAUTH_CALLBACK_PATH = "/app/settings/calendar-callback";

const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "0.0.0.0", "::1"]);

export type GoogleCalendarDomainCode =
  | "INVALID_REQUEST"
  | "NOT_AUTHORIZED"
  | "REAUTH_REQUIRED"
  | "EVENT_NOT_FOUND"
  | "CONFLICT"
  | "RATE_LIMITED"
  | "SERVICE_UNAVAILABLE"
  | "SYNC_ERROR"
  | "CALENDAR_NOT_CONNECTED";

function readGoogleClientId(): string {
  return (
    Deno.env.get("GOOGLE_CLIENT_ID") ??
    Deno.env.get("GOOGLE_OAUTH_CLIENT_ID") ??
    Deno.env.get("GOOGLE_CALENDAR_CLIENT_ID") ??
    ""
  ).trim();
}

function readGoogleClientSecret(): string {
  return (
    Deno.env.get("GOOGLE_CLIENT_SECRET") ??
    Deno.env.get("GOOGLE_OAUTH_CLIENT_SECRET") ??
    Deno.env.get("GOOGLE_CALENDAR_CLIENT_SECRET") ??
    ""
  ).trim();
}

export function isCalendarConfigured(): boolean {
  const id = readGoogleClientId();
  const secret = readGoogleClientSecret();
  return id.length > 0 && secret.length > 0;
}

export function googleClientId(): string {
  return readGoogleClientId();
}

export function googleClientSecret(): string {
  return readGoogleClientSecret();
}

function stripSlash(value: string): string {
  return value.replace(/\/+$/, "");
}

function isLocalhostUrl(value: string): boolean {
  try {
    const parsed = new URL(value);
    return LOCAL_HOSTS.has(parsed.hostname.toLowerCase());
  } catch {
    return false;
  }
}

/** Public app origin. Production never uses localhost. */
export function resolvePublicAppUrl(req: Request): string {
  const env = (
    Deno.env.get("APP_ENV") ??
    Deno.env.get("ENVIRONMENT") ??
    Deno.env.get("VITE_APP_ENV") ??
    ""
  ).trim().toLowerCase();
  const configured = stripSlash(
    (
      Deno.env.get("APP_URL") ??
      Deno.env.get("PUBLIC_URL") ??
      Deno.env.get("SITE_URL") ??
      ""
    ).trim(),
  );
  const isProduction = env === "production" || env === "prod";

  if (isProduction) {
    if (
      configured &&
      configured.startsWith("https://") &&
      !isLocalhostUrl(configured)
    ) {
      return configured;
    }
    return PRODUCTION_APP_URL;
  }

  if (configured && !isProduction) {
    return configured;
  }

  const origin = (req.headers.get("origin") ?? "").trim();
  if (origin.startsWith("http://") || origin.startsWith("https://")) {
    if (isProduction && isLocalhostUrl(origin)) return PRODUCTION_APP_URL;
    return stripSlash(origin);
  }

  return isProduction ? PRODUCTION_APP_URL : "http://localhost:5173";
}

export function calendarOAuthRedirectUri(req: Request): string {
  return `${resolvePublicAppUrl(req)}${CALENDAR_OAUTH_CALLBACK_PATH}`;
}

export function mapGoogleCalendarHttpStatus(status: number): {
  code: GoogleCalendarDomainCode;
  http: number;
  message: string;
} {
  if (status === 400) {
    return { code: "INVALID_REQUEST", http: 400, message: "The calendar request was invalid." };
  }
  if (status === 401) {
    return { code: "REAUTH_REQUIRED", http: 401, message: "Google Calendar access expired. Reconnect your calendar." };
  }
  if (status === 403) {
    return { code: "NOT_AUTHORIZED", http: 403, message: "Google Calendar permission was denied." };
  }
  if (status === 404) {
    return { code: "EVENT_NOT_FOUND", http: 404, message: "That calendar event was not found." };
  }
  if (status === 409) {
    return { code: "CONFLICT", http: 409, message: "A matching calendar event already exists." };
  }
  if (status === 429) {
    return { code: "RATE_LIMITED", http: 429, message: "Google Calendar is rate-limiting requests. Try again shortly." };
  }
  if (status === 500 || status === 502 || status === 503 || status === 504) {
    return { code: "SERVICE_UNAVAILABLE", http: 503, message: "Google Calendar is temporarily unavailable." };
  }
  return { code: "SYNC_ERROR", http: 502, message: "Calendar synchronization failed." };
}

export function deterministicCalendarEventId(interviewId: string): string {
  const hex = interviewId.replace(/-/g, "").toLowerCase();
  return `c${hex}`;
}

function randomUrlSafe(byteCount: number): string {
  const bytes = new Uint8Array(byteCount);
  crypto.getRandomValues(bytes);
  return btoa(String.fromCharCode(...bytes))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
}

export async function generatePkce(): Promise<{
  verifier: string;
  challenge: string;
  state: string;
  nonce: string;
}> {
  const verifier = randomUrlSafe(32);
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(verifier),
  );
  const challenge = btoa(String.fromCharCode(...new Uint8Array(digest)))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
  return {
    verifier,
    challenge,
    state: randomUrlSafe(24),
    nonce: randomUrlSafe(16),
  };
}

export function buildGoogleAuthorizationUrl(input: {
  clientId: string;
  redirectUri: string;
  state: string;
  codeChallenge: string;
  nonce: string;
}): string {
  const url = new URL("https://accounts.google.com/o/oauth2/v2/auth");
  url.searchParams.set("client_id", input.clientId);
  url.searchParams.set("redirect_uri", input.redirectUri);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("scope", GOOGLE_CALENDAR_OAUTH_SCOPES);
  url.searchParams.set("access_type", "offline");
  url.searchParams.set("prompt", "consent");
  url.searchParams.set("include_granted_scopes", "false");
  url.searchParams.set("state", input.state);
  url.searchParams.set("nonce", input.nonce);
  url.searchParams.set("code_challenge", input.codeChallenge);
  url.searchParams.set("code_challenge_method", "S256");
  return url.toString();
}

export type GoogleTokenSet = {
  accessToken: string;
  refreshToken: string | null;
  expiresIn: number | null;
  scope: string | null;
};

function parseTokenResponse(json: Record<string, unknown>): GoogleTokenSet | null {
  const access = typeof json.access_token === "string" ? json.access_token : "";
  if (!access) return null;
  return {
    accessToken: access,
    refreshToken: typeof json.refresh_token === "string" ? json.refresh_token : null,
    expiresIn: typeof json.expires_in === "number" ? json.expires_in : null,
    scope: typeof json.scope === "string" ? json.scope : null,
  };
}

export async function exchangeGoogleAuthorizationCode(input: {
  code: string;
  redirectUri: string;
  codeVerifier: string;
}): Promise<
  | { ok: true; tokens: GoogleTokenSet }
  | { ok: false; code: GoogleCalendarDomainCode; status: number }
> {
  const params = new URLSearchParams({
    client_id: googleClientId(),
    client_secret: googleClientSecret(),
    code: input.code,
    grant_type: "authorization_code",
    redirect_uri: input.redirectUri,
    code_verifier: input.codeVerifier,
  });
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: params.toString(),
  });
  const json = await res.json().catch(() => ({})) as Record<string, unknown>;
  if (!res.ok) {
    const err = String(json.error ?? "");
    if (err === "invalid_grant" || res.status === 400) {
      return { ok: false, code: "INVALID_REQUEST", status: 400 };
    }
    if (res.status === 401) {
      return { ok: false, code: "REAUTH_REQUIRED", status: 401 };
    }
    const mapped = mapGoogleCalendarHttpStatus(res.status);
    return { ok: false, code: mapped.code, status: mapped.http };
  }
  const tokens = parseTokenResponse(json);
  if (!tokens) return { ok: false, code: "SYNC_ERROR", status: 502 };
  return { ok: true, tokens };
}

export async function refreshGoogleAccessTokenFromSecret(
  refreshToken: string,
): Promise<
  | { ok: true; accessToken: string; refreshToken: string | null }
  | { ok: false; code: "REAUTH_REQUIRED" | "SYNC_ERROR" | "RATE_LIMITED" | "SERVICE_UNAVAILABLE" }
> {
  const params = new URLSearchParams({
    client_id: googleClientId(),
    client_secret: googleClientSecret(),
    refresh_token: refreshToken,
    grant_type: "refresh_token",
  });
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: params.toString(),
  });
  const json = await res.json().catch(() => ({})) as Record<string, unknown>;
  if (!res.ok) {
    const err = String(json.error ?? "");
    if (err === "invalid_grant" || res.status === 400 || res.status === 401) {
      return { ok: false, code: "REAUTH_REQUIRED" };
    }
    if (res.status === 429) return { ok: false, code: "RATE_LIMITED" };
    if (res.status >= 500) return { ok: false, code: "SERVICE_UNAVAILABLE" };
    return { ok: false, code: "SYNC_ERROR" };
  }
  const tokens = parseTokenResponse(json);
  if (!tokens) return { ok: false, code: "SYNC_ERROR" };
  return {
    ok: true,
    accessToken: tokens.accessToken,
    refreshToken: tokens.refreshToken,
  };
}

export async function fetchGoogleAccountProfile(accessToken: string): Promise<{
  id: string | null;
  email: string | null;
}> {
  const res = await fetch("https://www.googleapis.com/oauth2/v2/userinfo", {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) {
    const cal = await fetch(
      "https://www.googleapis.com/calendar/v3/calendars/primary",
      { headers: { Authorization: `Bearer ${accessToken}` } },
    );
    if (!cal.ok) return { id: null, email: null };
    const body = await cal.json().catch(() => ({})) as { id?: string };
    const id = typeof body.id === "string" ? body.id : null;
    return { id, email: id && id.includes("@") ? id : null };
  }
  const body = await res.json().catch(() => ({})) as { id?: string; email?: string };
  return {
    id: typeof body.id === "string" ? body.id : null,
    email: typeof body.email === "string" ? body.email : null,
  };
}

export async function revokeGoogleToken(token: string): Promise<boolean> {
  const res = await fetch("https://oauth2.googleapis.com/revoke", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: `token=${encodeURIComponent(token)}`,
  }).catch(() => null);
  return !!res?.ok || res?.status === 200 || res?.status === 400;
}

async function sleep(ms: number): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

/** Bounded retry for transient Google Calendar errors. Caller must keep operations idempotent. */
export async function googleCalendarFetch(
  url: string,
  init: RequestInit,
  maxAttempts = 3,
): Promise<Response> {
  let last: Response | null = null;
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    last = await fetch(url, init);
    const transient = last.status === 429 || last.status === 502 || last.status === 503 || last.status === 504;
    if (!transient || attempt === maxAttempts - 1) return last;
    const retryAfter = last.headers.get("Retry-After");
    const parsed = retryAfter ? Number(retryAfter) * 1000 : NaN;
    const wait = Number.isFinite(parsed) ? Math.min(parsed, 4000) : 400 * 2 ** attempt;
    await sleep(wait);
  }
  return last!;
}

export type CalendarEventPayload = {
  summary: string;
  description?: string;
  location?: string;
  start: { dateTime: string; timeZone: string };
  end: { dateTime: string; timeZone: string };
  extendedProperties?: { private?: Record<string, string> };
  id?: string;
};

export async function googleCalendarWriteEvent(input: {
  accessToken: string;
  existingEventId: string | null;
  interviewId: string;
  payload: CalendarEventPayload;
}): Promise<
  | { ok: true; eventId: string; created: boolean }
  | { ok: false; status: number }
> {
  const headers = {
    Authorization: `Bearer ${input.accessToken}`,
    "Content-Type": "application/json",
  };
  const body = {
    ...input.payload,
    extendedProperties: {
      private: {
        clarify_interview_id: input.interviewId,
        ...(input.payload.extendedProperties?.private ?? {}),
      },
    },
  };

  if (input.existingEventId) {
    const patchUrl =
      `https://www.googleapis.com/calendar/v3/calendars/primary/events/${encodeURIComponent(input.existingEventId)}`;
    const patched = await googleCalendarFetch(patchUrl, {
      method: "PATCH",
      headers,
      body: JSON.stringify(body),
    });
    if (patched.ok) {
      const json = await patched.json().catch(() => null) as { id?: string } | null;
      return { ok: true, eventId: json?.id ?? input.existingEventId, created: false };
    }
    if (patched.status !== 404) {
      return { ok: false, status: patched.status };
    }
  }

  const deterministicId = deterministicCalendarEventId(input.interviewId);
  const createUrl = "https://www.googleapis.com/calendar/v3/calendars/primary/events";
  const created = await googleCalendarFetch(createUrl, {
    method: "POST",
    headers,
    body: JSON.stringify({ ...body, id: deterministicId }),
  });

  if (created.ok) {
    const json = await created.json().catch(() => null) as { id?: string } | null;
    return { ok: true, eventId: json?.id ?? deterministicId, created: true };
  }

  if (created.status === 409) {
    const getUrl =
      `https://www.googleapis.com/calendar/v3/calendars/primary/events/${encodeURIComponent(deterministicId)}`;
    const existing = await googleCalendarFetch(getUrl, { method: "GET", headers });
    if (existing.ok) {
      const json = await existing.json().catch(() => null) as { id?: string } | null;
      const patchExisting = await googleCalendarFetch(getUrl, {
        method: "PATCH",
        headers,
        body: JSON.stringify(body),
      });
      if (patchExisting.ok || existing.ok) {
        const patchedJson = patchExisting.ok
          ? await patchExisting.json().catch(() => null) as { id?: string } | null
          : json;
        return { ok: true, eventId: patchedJson?.id ?? json?.id ?? deterministicId, created: false };
      }
    }
    return { ok: false, status: created.status };
  }

  return { ok: false, status: created.status };
}

export async function googleCalendarDeleteEvent(input: {
  accessToken: string;
  eventId: string;
}): Promise<{ ok: true; alreadyGone: boolean } | { ok: false; status: number }> {
  const url =
    `https://www.googleapis.com/calendar/v3/calendars/primary/events/${encodeURIComponent(input.eventId)}`;
  const res = await googleCalendarFetch(url, {
    method: "DELETE",
    headers: { Authorization: `Bearer ${input.accessToken}` },
  });
  if (res.ok || res.status === 204 || res.status === 404 || res.status === 410) {
    return { ok: true, alreadyGone: res.status === 404 || res.status === 410 };
  }
  return { ok: false, status: res.status };
}
