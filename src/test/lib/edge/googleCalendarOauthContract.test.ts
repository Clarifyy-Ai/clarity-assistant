import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../..");
const functionsDir = path.join(root, "supabase/functions");

function readFunction(name: string): string {
  return fs.readFileSync(path.join(functionsDir, name, "index.ts"), "utf8");
}

function readShared(name: string): string {
  return fs.readFileSync(path.join(functionsDir, "_shared", name), "utf8");
}

describe("Google Calendar OAuth source contracts", () => {
  const sync = readFunction("sync-calendar");
  const disconnect = readFunction("disconnect-calendar");
  const shared = readShared("googleCalendar.ts");
  const loginAuth = fs.readFileSync(path.join(root, "src/lib/supabase/auth.ts"), "utf8");
  const authStore = fs.readFileSync(path.join(root, "src/store/authStore.ts"), "utf8");
  const hook = fs.readFileSync(path.join(root, "src/hooks/useCalendarSync.ts"), "utf8");
  const migration = fs.readFileSync(
    path.join(root, "supabase/migrations/20260901090000_calendar_oauth_hardening.sql"),
    "utf8",
  );

  it("uses a dedicated Calendar OAuth code flow, not Sign-In", () => {
    expect(sync).toContain('action === "oauth_start"');
    expect(sync).toContain('action === "oauth_callback"');
    expect(sync).toContain("generatePkce");
    expect(shared).toContain("code_challenge");
    expect(shared).toContain("calendar.events");
    expect(shared).toContain("/app/settings/calendar-callback");
    expect(hook).not.toContain("signInWithOAuth");
    expect(hook).not.toContain("provider_refresh_token");
    expect(hook).not.toContain("store_token_only");
    expect(hook).not.toContain("session?.provider_token");
  });

  it("never accepts Calendar tokens from the browser", () => {
    expect(sync).toContain("Rejected client-supplied Google token fields");
    expect(sync).not.toMatch(/accessToken = typeof body\?\.provider_token/);
    expect(hook).not.toContain("provider_token");
  });

  it("maps Google HTTP statuses to domain codes", () => {
    expect(shared).toContain("REAUTH_REQUIRED");
    expect(shared).toContain("EVENT_NOT_FOUND");
    expect(shared).toContain("RATE_LIMITED");
    expect(shared).toContain("SERVICE_UNAVAILABLE");
    expect(sync).toContain("CALENDAR_NOT_CONNECTED");
  });

  it("does not treat Google login identity as a Calendar connection", () => {
    expect(disconnect).not.toContain("getGoogleIdentity");
    expect(disconnect).not.toContain("usesGoogleAsSoleLogin");
    expect(disconnect).toContain("Never unlink Google as a login identity");
    expect(disconnect).toContain("get_calendar_connection_status");
  });

  it("Google Sign-In requests identity scopes only", () => {
    expect(authStore).toContain('scopes: provider === "google" ? "email profile"');
    expect(loginAuth).toContain('scopes: provider === "google" ? "email profile"');
    expect(loginAuth).not.toContain("access_type");
    expect(loginAuth).not.toContain("calendar.events");
    expect(authStore).not.toContain("calendar.events");
  });

  it("stores tokens server-side and hides them from clients", () => {
    expect(migration).toContain("google_calendar_refresh_tokens");
    expect(migration).toContain("calendar_oauth_states");
    expect(migration).toContain("REVOKE ALL ON TABLE public.google_calendar_refresh_tokens FROM authenticated");
    expect(migration).toContain("get_calendar_connection_status");
    expect(migration).toContain("never returns tokens");
  });

  it("keeps interview records when Calendar delete fails", () => {
    expect(sync).toContain('calendar_sync_status: mapped.code === "REAUTH_REQUIRED" ? "reauth_required" : "sync_error"');
    expect(sync).not.toContain(".delete().eq(\"id\", interviewId)");
  });

  it("uses a deterministic event id for create idempotency", () => {
    expect(shared).toContain("deterministicCalendarEventId");
    expect(shared).toContain("clarify_interview_id");
  });

  it("retries calendar import via googleCalendarFetch", () => {
    expect(sync).toContain("googleCalendarFetch");
    const fetchEventsBlock = sync.slice(
      sync.indexOf("async function fetchEvents"),
      sync.indexOf("async function setInterviewSync"),
    );
    expect(fetchEventsBlock).toContain("googleCalendarFetch");
    expect(fetchEventsBlock).not.toMatch(/await fetch\(url\.toString\(\)/);
  });
});

describe("scheduler UI contracts", () => {
  const detail = fs.readFileSync(
    path.join(root, "src/pages/app/interviews/InterviewDetail.tsx"),
    "utf8",
  );
  const scheduleInterview = readFunction("schedule-interview");
  const reminderWorker = readFunction("send-interview-reminders");

  it("InterviewDetail exposes calendar sync status and retry", () => {
    expect(detail).toContain("calendar_sync_status");
    expect(detail).toContain("Retry calendar sync");
    expect(detail).toContain("teardownInterviewSideEffects");
  });

  it("schedule-interview queues reminders without requiring Resend", () => {
    expect(scheduleInterview).toContain("buildReminderRows");
    expect(scheduleInterview).toMatch(/rows\.length > 0[\s\S]{0,400}interview_reminders/);
    expect(scheduleInterview).not.toMatch(/if \(emailConfigured\) \{[\s\S]*buildReminderRows/);
  });

  it("reminder worker delivers in-app notifications and retries email failures", () => {
    expect(reminderWorker).toContain('from("notifications").insert');
    expect(reminderWorker).toContain("resend_failed");
    expect(reminderWorker).toContain('status: "pending"');
    expect(reminderWorker).not.toMatch(/if \(!RESEND_API_KEY\) \{[\s\S]*return json/);
  });
});
