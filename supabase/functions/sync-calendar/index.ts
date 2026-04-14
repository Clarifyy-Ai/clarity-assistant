// sync-calendar/index.ts


import {
  handleCors,
  parseBody,
  requireAuth,
  successResponse,
  errorResponse,
  log,
} from "../_shared/utils.ts";
import { createServiceClient } from "../_shared/supabase.ts";

// ─────────────────────────────────────────────────────────────────
// Configuration guard — fail fast with 501 if OAuth creds are absent.
// This prevents misleading 500 errors and gives the client a clear
// signal to show a "not available" UI rather than a generic error.
// ─────────────────────────────────────────────────────────────────

const GOOGLE_CLIENT_ID     = Deno.env.get("GOOGLE_CLIENT_ID")     ?? "";
const GOOGLE_CLIENT_SECRET = Deno.env.get("GOOGLE_CLIENT_SECRET") ?? "";

const CALENDAR_CONFIGURED = !!(GOOGLE_CLIENT_ID && GOOGLE_CLIENT_SECRET);

// ─────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────

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

// ─────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────

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

// ─────────────────────────────────────────────────────────────────
// Google OAuth token refresh
// ─────────────────────────────────────────────────────────────────

async function refreshGoogleAccessToken(userId: string): Promise<string | null> {
  const url = Deno.env.get("SUPABASE_URL")              ?? "";
  const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";

  // Prefer RPC for refresh token retrieval
  const rpcRes = await fetch(`${url}/rest/v1/rpc/get_google_refresh_token`, {
    method:  "POST",
    headers: {
      apikey:         key,
      Authorization:  `Bearer ${key}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ p_user_id: userId }),
  }).catch(() => null);

  let refreshToken: string | undefined;

  if (rpcRes?.ok) {
    const data = await rpcRes.json();
    refreshToken = data?.refresh_token;
  }

  // Fallback: admin user endpoint
  if (!refreshToken) {
    const ures = await fetch(`${url}/auth/v1/admin/users/${userId}`, {
      headers: { apikey: key, Authorization: `Bearer ${key}` },
    });
    if (!ures.ok) return null;
    const u      = await ures.json();
    const ident  = u?.identities?.find((i: { provider: string }) => i.provider === "google");
    refreshToken = ident?.identity_data?.refresh_token ?? ident?.refresh_token ?? null;
  }

  if (!refreshToken) return null;

  const params = new URLSearchParams({
    client_id:     GOOGLE_CLIENT_ID,
    client_secret: GOOGLE_CLIENT_SECRET,
    refresh_token: refreshToken,
    grant_type:    "refresh_token",
  });

  const tRes = await fetch("https://oauth2.googleapis.com/token", {
    method:  "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body:    params.toString(),
  });

  if (!tRes.ok) return null;

  const t = await tRes.json();
  return t.access_token ?? null;
}

// ─────────────────────────────────────────────────────────────────
// Google Calendar events fetch
// ─────────────────────────────────────────────────────────────────

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

  const res = await fetch(url.toString(), {
    headers: { Authorization: `Bearer ${token}` },
  });

  if (!res.ok) return { events: null, status: res.status };

  const json = await res.json().catch(() => null);
  return { events: json?.items ?? [], status: 200 };
}

// ─────────────────────────────────────────────────────────────────
// Handler
// ─────────────────────────────────────────────────────────────────

Deno.serve(async (req) => {
  const cors = handleCors(req);
  if (cors) return cors;

  // ── 501 guard — return before any auth/DB work ──────────────────
  // HTTP 501 Not Implemented is the correct status for a feature that
  // exists in the codebase but isn't operational yet, as opposed to
  // 503 (service temporarily unavailable) or 500 (unexpected crash).
  if (!CALENDAR_CONFIGURED) {
    console.warn(
      "[sync-calendar] Google OAuth credentials not configured. " +
      "Set GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET to enable this feature.",
    );
    return new Response(
      JSON.stringify({
        error:   "Calendar sync is not available yet.",
        code:    "NOT_CONFIGURED",
        message: "Google Calendar integration is coming soon. " +
                 "Join the waitlist to be notified when it launches.",
      }),
      {
        status:  501,
        headers: { ..."Content-Type": "application/json" },
      },
    );
  }

  const db = createServiceClient();
  const FN = "sync-calendar";

  try {
    // ── Auth ─────────────────────────────────────────────────────
    const auth = await requireAuth(req);
    const user = auth.user;

    // ── Body ─────────────────────────────────────────────────────
    const body = await parseBody<{
      provider_token?: string;
      days_ahead?:     number;
    }>(req);

    let providerToken  = body?.provider_token;
    const daysAhead    = Math.min(Number(body?.days_ahead ?? 30), 90); // cap at 90 days

    // ── Fetch events (with token refresh fallback) ───────────────
    let cal = providerToken
      ? await fetchEvents(providerToken, daysAhead)
      : { events: null, status: 0 };

    if (!cal.events && (cal.status === 401 || !providerToken)) {
      const refreshed = await refreshGoogleAccessToken(user.id);
      if (refreshed) {
        providerToken = refreshed;
        cal           = await fetchEvents(refreshed, daysAhead);
      }
    }

    if (!cal.events) {
      if (cal.status === 401 || cal.status === 403) {
        return errorResponse(
          "Google Calendar access revoked. Reconnect your calendar.",
          "TOKEN_REVOKED",
          401,
        );
      }
      return errorResponse(
        "Failed to fetch Google Calendar events.",
        "GOOGLE_API_ERROR",
        502,
      );
    }

    // ── Filter to interview events ───────────────────────────────
    const interviewEvents = cal.events.filter(isInterviewEvent);

    let imported = 0;
    let updated  = 0;
    let skipped  = 0;
    const summaries: Array<{
      title:       string;
      scheduledAt: string | null;
      action:      string;
    }> = [];

    // ── Process each event ───────────────────────────────────────
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
        .eq("user_id", user.id)
        .eq("calendar_event_id", evt.id)
        .maybeSingle();

      if (existing) {
        // ── Update existing record ──────────────────────────────
        const { error: uErr } = await db
          .from("scheduled_interviews")
          .update({
            company_name: company,
            role_title:   role,
            stage,
            notes:        evt.description ?? null,
            location:     evt.location    ?? null,
            updated_at:   new Date().toISOString(),
          })
          .eq("id", existing.id);

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

      // ── Insert new record ───────────────────────────────────────
      const { data: newInterview, error: iErr } = await db
        .from("scheduled_interviews")
        .insert({
          user_id:           user.id,
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
    });

  } catch (err) {
    log(FN, "error", "Unhandled error", err);
    return errorResponse("Internal server error", "INTERNAL", 500);
  }
});
