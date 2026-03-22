import { handleCors, corsHeaders } from "../_shared/cors.ts";
import { createServiceClient } from "../_shared/supabase.ts";

// ─────────────────────────────────────────────────────────────────────────────
// sync-calendar — Import upcoming interview events from Google Calendar
//
// The frontend must pass the user's Google OAuth provider_token obtained after
// signInWithOAuth({ provider: "google", scopes: "calendar.readonly" }).
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

function isInterviewEvent(summary: string): boolean {
  const lower = summary.toLowerCase();
  const keywords = [
    "interview", "screening", "screen", "hiring", "recruiter",
    "technical", "onsite", "on-site", "assessment", "coding",
    "panel interview", "phone screen", "video call with", "loop",
  ];
  return keywords.some((kw) => lower.includes(kw));
}

function extractMeetingUrl(event: GoogleCalendarEvent): string | null {
  if (event.hangoutLink) return event.hangoutLink;
  const zoomEntry = event.conferenceData?.entryPoints?.find(
    (e) => e.entryPointType === "video"
  );
  return zoomEntry?.uri ?? null;
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
    const providerToken: string | undefined = body.provider_token;
    const daysAhead: number = body.days_ahead ?? 30;

    if (!providerToken) {
      return new Response(
        JSON.stringify({
          error: "Missing provider_token. Connect Google Calendar first.",
          code: "NO_TOKEN",
        }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

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
      headers: { Authorization: `Bearer ${providerToken}` },
    });

    if (!calRes.ok) {
      const errBody = await calRes.text();
      console.error("[sync-calendar] Google Calendar API error:", calRes.status, errBody);
      return new Response(
        JSON.stringify({
          error: "Google Calendar API error. Your token may have expired — reconnect Google Calendar.",
          code: "GOOGLE_API_ERROR",
          status: calRes.status,
        }),
        { status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const calData = await calRes.json();
    const events: GoogleCalendarEvent[] = calData.items ?? [];

    const interviewEvents = events.filter((e) =>
      e.summary && isInterviewEvent(e.summary)
    );

    let imported = 0;
    let skipped = 0;
    const summaries: Array<{ title: string; scheduledAt: string | null }> = [];

    for (const event of interviewEvents) {
      const title = event.summary ?? "Interview";
      const scheduledAt = event.start?.dateTime ?? event.start?.date ?? null;
      const meetingUrl = extractMeetingUrl(event);
      const interviewType = guessInterviewType(title);

      const { data: existing } = await db
        .from("interviews")
        .select("id")
        .eq("user_id", user.id)
        .eq("calendar_event_id", event.id)
        .maybeSingle();

      if (existing) {
        skipped++;
        continue;
      }

      const { error: insertErr } = await db.from("interviews").insert({
        user_id:           user.id,
        title,
        calendar_event_id: event.id,
        scheduled_at:      scheduledAt,
        location:          event.location ?? null,
        meeting_url:       meetingUrl,
        interview_type:    interviewType,
        status:            "scheduled",
        notes:             event.description ?? null,
      });

      if (insertErr) {
        console.error("[sync-calendar] Insert error:", insertErr.message);
        skipped++;
      } else {
        imported++;
        summaries.push({ title, scheduledAt });
      }
    }

    return new Response(
      JSON.stringify({
        imported,
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
