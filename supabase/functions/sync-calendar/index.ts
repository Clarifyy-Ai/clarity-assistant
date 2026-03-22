import { handleCors, corsHeaders } from "../_shared/cors.ts";
import { createServiceClient } from "../_shared/supabase.ts";

// ─────────────────────────────────────────────────────────────────────────────
// sync-calendar — Import upcoming interview events from Google Calendar
//
// The frontend passes the user's Google OAuth provider_token from the active
// Supabase session. If that token is expired, the function automatically
// refreshes it server-side using the stored refresh_token from auth.identities
// before retrying the Calendar API call.
//
// Body: {
//   provider_token: string   — Google OAuth access token from the Supabase session
//   days_ahead?:    number   — How many days ahead to fetch (default 30)
// }
//
// Returns: { imported: number, skipped: number, events: EventSummary[] }
// ─────────────────────────────────────────────────────────────────────────────

interface GoogleCalendarEvent {
  id: string;
  summary?: string;
  description?: string;
  location?: string;
  start?: { dateTime?: string; date?: string };
  end?: { dateTime?: string; date?: string };
  hangoutLink?: string;
  conferenceData?: {
    entryPoints?: Array<{ entryPointType: string; uri: string }>;
  };
}

const INTERVIEW_KEYWORDS = [
  "interview", "screening", "screen", "hiring", "recruiter",
  "technical", "onsite", "on-site", "assessment", "coding",
  "panel interview", "phone screen", "video call with", "loop",
];

function isInterviewEvent(event: GoogleCalendarEvent): boolean {
  const summaryLower = (event.summary ?? "").toLowerCase();
  const descLower = (event.description ?? "").toLowerCase();
  return INTERVIEW_KEYWORDS.some(
    (kw) => summaryLower.includes(kw) || descLower.includes(kw)
  );
}

function extractMeetingUrl(event: GoogleCalendarEvent): string | null {
  if (event.hangoutLink) return event.hangoutLink;
  const videoEntry = event.conferenceData?.entryPoints?.find(
    (e) => e.entryPointType === "video"
  );
  return videoEntry?.uri ?? null;
}

function guessInterviewType(summary: string): string {
  const lower = summary.toLowerCase();
  if (lower.includes("technical") || lower.includes("coding")) return "technical";
  if (lower.includes("phone") || lower.includes("screen")) return "phone_screen";
  if (lower.includes("panel") || lower.includes("onsite") || lower.includes("on-site")) return "panel";
  if (lower.includes("hr") || lower.includes("recruiter") || lower.includes("hiring")) return "hr";
  if (lower.includes("take-home") || lower.includes("takehome") || lower.includes("assessment")) return "take_home";
  return "general";
}

function guessStage(interviewType: string): string {
  if (interviewType === "phone_screen" || interviewType === "hr") return "phone_screen";
  if (interviewType === "technical") return "technical_round";
  if (interviewType === "panel") return "final_round";
  return "phone_screen";
}

function extractCompanyFromTitle(summary: string): string {
  const patterns = [
    /interview\s+(?:at|with|@)\s+(.+?)(?:\s*[-–—|]|$)/i,
    /(.+?)\s+interview/i,
    /(.+?)\s+(?:phone\s+screen|screening|technical|onsite)/i,
  ];
  for (const pattern of patterns) {
    const match = summary.match(pattern);
    if (match?.[1]) return match[1].trim().slice(0, 80);
  }
  return summary.slice(0, 60);
}

function extractRoleFromTitle(summary: string): string {
  const match = summary.match(
    /(?:for\s+(?:the\s+)?|role:\s*)(.+?)(?:\s+(?:at|with|@|interview)|$)/i
  );
  if (match?.[1]) return match[1].trim().slice(0, 80);
  return "Role TBD";
}

// ── Token refresh ────────────────────────────────────────────────────────────

async function refreshGoogleToken(userId: string): Promise<string | null> {
  const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
  const serviceKey  = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";

  // Query auth.identities for the stored Google refresh_token via service role
  const res = await fetch(
    `${supabaseUrl}/rest/v1/rpc/get_google_refresh_token`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "apikey": serviceKey,
        "Authorization": `Bearer ${serviceKey}`,
      },
      body: JSON.stringify({ p_user_id: userId }),
    }
  );

  // Fallback: query auth.identities directly
  if (!res.ok) {
    const identRes = await fetch(
      `${supabaseUrl}/auth/v1/admin/users/${userId}`,
      {
        headers: {
          "apikey": serviceKey,
          "Authorization": `Bearer ${serviceKey}`,
        },
      }
    );
    if (!identRes.ok) return null;

    const userData = await identRes.json();
    const googleIdentity = userData?.identities?.find(
      (i: any) => i.provider === "google"
    );
    const refreshToken = googleIdentity?.identity_data?.refresh_token
      ?? googleIdentity?.refresh_token;

    if (!refreshToken) return null;
    return await exchangeRefreshToken(refreshToken);
  }

  const data = await res.json();
  const refreshToken = data?.refresh_token;
  if (!refreshToken) return null;
  return await exchangeRefreshToken(refreshToken);
}

async function exchangeRefreshToken(refreshToken: string): Promise<string | null> {
  const clientId     = Deno.env.get("GOOGLE_CLIENT_ID") ?? "";
  const clientSecret = Deno.env.get("GOOGLE_CLIENT_SECRET") ?? "";

  if (!clientId || !clientSecret) {
    console.warn("[sync-calendar] GOOGLE_CLIENT_ID or GOOGLE_CLIENT_SECRET not set — cannot refresh token");
    return null;
  }

  const params = new URLSearchParams({
    client_id:     clientId,
    client_secret: clientSecret,
    refresh_token: refreshToken,
    grant_type:    "refresh_token",
  });

  const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: params.toString(),
  });

  if (!tokenRes.ok) {
    console.error("[sync-calendar] Token refresh failed:", await tokenRes.text());
    return null;
  }

  const tokenData = await tokenRes.json();
  return tokenData.access_token ?? null;
}

// ── Fetch calendar events ─────────────────────────────────────────────────────

async function fetchCalendarEvents(
  accessToken: string,
  daysAhead: number
): Promise<{ events: GoogleCalendarEvent[] | null; status: number }> {
  const now = new Date();
  const timeMin = now.toISOString();
  const timeMax = new Date(now.getTime() + daysAhead * 24 * 60 * 60 * 1000).toISOString();

  const calendarUrl = new URL(
    "https://www.googleapis.com/calendar/v3/calendars/primary/events"
  );
  calendarUrl.searchParams.set("timeMin", timeMin);
  calendarUrl.searchParams.set("timeMax", timeMax);
  calendarUrl.searchParams.set("singleEvents", "true");
  calendarUrl.searchParams.set("orderBy", "startTime");
  calendarUrl.searchParams.set("maxResults", "50");

  const calRes = await fetch(calendarUrl.toString(), {
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  if (!calRes.ok) {
    return { events: null, status: calRes.status };
  }

  const calData = await calRes.json();
  return { events: calData.items ?? [], status: 200 };
}

// ── Main handler ──────────────────────────────────────────────────────────────

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

    const body = await req.json().catch(() => ({}));
    let providerToken: string | undefined = body.provider_token;
    const daysAhead: number = body.days_ahead ?? 30;

    let events: GoogleCalendarEvent[] | null = null;
    let calStatus = 0;

    if (providerToken) {
      // Try with the provided session token first
      const result = await fetchCalendarEvents(providerToken, daysAhead);
      events = result.events;
      calStatus = result.status;
    }

    // If provider_token was missing, or the access token returned 401 (expired),
    // attempt a server-side token refresh using the stored Google refresh_token
    if (events === null && (calStatus === 401 || !providerToken)) {
      console.log("[sync-calendar] Attempting server-side token refresh for user:", user.id);
      const refreshedToken = await refreshGoogleToken(user.id);

      if (refreshedToken) {
        const retry = await fetchCalendarEvents(refreshedToken, daysAhead);
        events = retry.events;
        calStatus = retry.status;
        providerToken = refreshedToken;
      }
    }

    // If we still have no events, the token cannot be refreshed
    if (!providerToken && events === null) {
      return new Response(
        JSON.stringify({
          error: "Google Calendar not connected. Please connect it first.",
          code: "NO_TOKEN",
        }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (events === null) {
      console.error("[sync-calendar] Google Calendar API error:", calStatus);

      if (calStatus === 401 || calStatus === 403) {
        return new Response(
          JSON.stringify({
            error: "Google Calendar permission revoked. Please reconnect your calendar.",
            code: "TOKEN_REVOKED",
          }),
          { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      return new Response(
        JSON.stringify({
          error: "Google Calendar API error. Your token may have expired — reconnect Google Calendar.",
          code: "GOOGLE_API_ERROR",
          status: calStatus,
        }),
        { status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const interviewEvents = events.filter(isInterviewEvent);

    let imported = 0;
    let updated = 0;
    let skipped = 0;
    const summaries: Array<{ title: string; scheduledAt: string | null; action: "imported" | "updated" }> = [];

    for (const event of interviewEvents) {
      const title = event.summary ?? "Interview";
      const scheduledAt = event.start?.dateTime ?? event.start?.date ?? null;
      const meetingUrl = extractMeetingUrl(event);
      const interviewType = guessInterviewType(title);
      const companyName = extractCompanyFromTitle(title);
      const roleTitle = extractRoleFromTitle(title);
      const stage = guessStage(interviewType);

      // Check if this Google Calendar event was already imported (upsert logic)
      const { data: existing } = await db
        .from("scheduled_interviews")
        .select("id")
        .eq("user_id", user.id)
        .eq("calendar_event_id", event.id)
        .maybeSingle();

      if (existing) {
        // Update the existing interview with latest data from Google Calendar
        const { error: updateErr } = await db
          .from("scheduled_interviews")
          .update({
            company_name: companyName,
            role_title:   roleTitle,
            stage,
            location:     event.location ?? null,
            notes:        event.description ?? null,
            updated_at:   new Date().toISOString(),
          })
          .eq("id", existing.id);

        if (updateErr) {
          console.error("[sync-calendar] Update scheduled_interviews error:", updateErr.message);
          skipped++;
          continue;
        }

        // Update the first round's scheduled time and meeting link
        const { data: rounds } = await db
          .from("interview_rounds")
          .select("id")
          .eq("scheduled_interview_id", existing.id)
          .order("round_number", { ascending: true })
          .limit(1);

        if (rounds?.[0]) {
          await db.from("interview_rounds")
            .update({
              round_label:   title,
              interview_type: interviewType,
              scheduled_at:  scheduledAt,
              meeting_link:  meetingUrl,
              notes:         event.description ?? null,
              updated_at:    new Date().toISOString(),
            })
            .eq("id", rounds[0].id);
        }

        updated++;
        summaries.push({ title, scheduledAt, action: "updated" });
        continue;
      }

      // Create the parent scheduled_interview record
      const { data: newInterview, error: insertErr } = await db
        .from("scheduled_interviews")
        .insert({
          user_id:           user.id,
          company_name:      companyName,
          role_title:        roleTitle,
          stage,
          priority:          "medium",
          is_remote:         true,
          location:          event.location ?? null,
          notes:             event.description ?? null,
          status:            "upcoming",
          calendar_event_id: event.id,
          calendar_provider: "google",
        })
        .select("id")
        .single();

      if (insertErr || !newInterview) {
        console.error("[sync-calendar] Insert scheduled_interviews error:", insertErr?.message);
        skipped++;
        continue;
      }

      // Create the associated interview round
      const { error: roundErr } = await db.from("interview_rounds").insert({
        scheduled_interview_id: newInterview.id,
        round_number:           1,
        round_type:             interviewType,
        round_label:            title,
        interview_type:         interviewType,
        scheduled_at:           scheduledAt,
        meeting_link:           meetingUrl,
        status:                 "scheduled",
        notes:                  event.description ?? null,
      });

      if (roundErr) {
        console.error("[sync-calendar] Insert interview_rounds error:", roundErr.message);
      }

      imported++;
      summaries.push({ title, scheduledAt, action: "imported" });
    }

    return new Response(
      JSON.stringify({
        imported,
        updated,
        skipped,
        total_found: interviewEvents.length,
        events: summaries,
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    console.error("[sync-calendar] Error:", message);
    return new Response(
      JSON.stringify({ error: message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
