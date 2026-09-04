import { describe, expect, it } from "vitest";
import {
  mergeNotificationPrefs,
  readCalendarIntegrationPrefs,
  shouldWriteCalendarEvent,
} from "@/lib/interviews/calendarIntegrationPrefs";

describe("calendar integration prefs", () => {
  it("defaults auto-create and auto-import to true", () => {
    expect(readCalendarIntegrationPrefs(null)).toEqual({
      calendar_auto_create: true,
      calendar_auto_import: true,
    });
  });

  it("reads nested notification_prefs.integrations", () => {
    expect(
      readCalendarIntegrationPrefs({
        notification_prefs: {
          session_complete: false,
          integrations: { calendar_auto_create: false, calendar_auto_import: true },
        },
      }),
    ).toEqual({
      calendar_auto_create: false,
      calendar_auto_import: true,
    });
  });

  it("merges integrations without clobbering other notification keys", () => {
    const merged = mergeNotificationPrefs(
      {
        session_complete: true,
        integrations: { calendar_auto_create: true, calendar_auto_import: true },
      },
      { session_complete: false },
    );
    expect(merged.session_complete).toBe(false);
    expect(merged.integrations).toEqual({
      calendar_auto_create: true,
      calendar_auto_import: true,
    });
  });

  it("merges a nested integrations patch", () => {
    const merged = mergeNotificationPrefs(
      {
        debrief_ready: true,
        integrations: { calendar_auto_create: true, calendar_auto_import: true },
      },
      { integrations: { calendar_auto_create: false } },
    );
    expect(merged.debrief_ready).toBe(true);
    expect(merged.integrations).toEqual({
      calendar_auto_create: false,
      calendar_auto_import: true,
    });
  });

  it("skips write_event when auto-create is off even if connected", () => {
    expect(
      shouldWriteCalendarEvent({
        syncAvailable: true,
        isConnected: true,
        autoCreate: false,
      }),
    ).toBe(false);
    expect(
      shouldWriteCalendarEvent({
        syncAvailable: true,
        isConnected: true,
        autoCreate: true,
      }),
    ).toBe(true);
  });
});
