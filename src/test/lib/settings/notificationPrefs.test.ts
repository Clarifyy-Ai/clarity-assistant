import { describe, expect, it } from "vitest";
import {
  readNotificationCategoryPrefs,
  readNotificationGlobalPrefs,
} from "@/lib/settings/notificationPrefs";
import { mergeNotificationPrefs } from "@/lib/interviews/calendarIntegrationPrefs";
import { PROFILE_BOOT_COLUMNS } from "@/lib/supabase/database";

describe("notification prefs load/save contract", () => {
  it("preserves explicit false values instead of falling back to defaults", () => {
    const profile = {
      email_notifications: false,
      session_reminders: false,
      marketing_emails: true,
      notification_prefs: {
        session_complete: false,
        credit_low: false,
        product_updates: true,
        debrief_ready: false,
        integrations: { calendar_auto_create: false },
      },
    };

    expect(readNotificationGlobalPrefs(profile)).toEqual({
      email_notifications: false,
      session_reminders: false,
      marketing_emails: true,
    });
    expect(readNotificationCategoryPrefs(profile)).toEqual({
      session_complete: false,
      credit_low: false,
      product_updates: true,
      debrief_ready: false,
    });
  });

  it("merges category toggles without dropping calendar integrations", () => {
    const merged = mergeNotificationPrefs(
      {
        experience_level: "intern",
        integrations: { calendar_auto_create: false, calendar_auto_import: true },
      },
      {
        session_complete: false,
        product_updates: true,
        credit_low: true,
        debrief_ready: true,
      },
    );

    expect(merged.session_complete).toBe(false);
    expect(merged.product_updates).toBe(true);
    expect(merged.experience_level).toBe("intern");
    expect(merged.integrations).toEqual({
      calendar_auto_create: false,
      calendar_auto_import: true,
    });
  });

  it("boots notification columns so refresh can rehydrate the form", () => {
    const cols = PROFILE_BOOT_COLUMNS.split(",").map((c) => c.trim());
    expect(cols).toEqual(
      expect.arrayContaining([
        "notification_prefs",
        "email_notifications",
        "session_reminders",
        "marketing_emails",
      ]),
    );
  });
});
