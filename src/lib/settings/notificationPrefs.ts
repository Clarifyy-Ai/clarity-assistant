/**
 * Notification preference helpers shared by Settings → Notifications.
 * Kept pure so boot/load regressions are easy to unit-test.
 */

export type NotificationCategoryPrefs = {
  session_complete?: boolean;
  credit_low?: boolean;
  product_updates?: boolean;
  debrief_ready?: boolean;
};

export const DEFAULT_NOTIFICATION_CATEGORY_PREFS: Required<NotificationCategoryPrefs> = {
  session_complete: true,
  credit_low: true,
  product_updates: false,
  debrief_ready: true,
};

export function readNotificationCategoryPrefs(
  profile: unknown,
): Required<NotificationCategoryPrefs> {
  const raw =
    profile &&
    typeof profile === "object" &&
    "notification_prefs" in profile
      ? (profile as { notification_prefs?: NotificationCategoryPrefs | null })
          .notification_prefs
      : null;

  return {
    session_complete:
      typeof raw?.session_complete === "boolean"
        ? raw.session_complete
        : DEFAULT_NOTIFICATION_CATEGORY_PREFS.session_complete,
    credit_low:
      typeof raw?.credit_low === "boolean"
        ? raw.credit_low
        : DEFAULT_NOTIFICATION_CATEGORY_PREFS.credit_low,
    product_updates:
      typeof raw?.product_updates === "boolean"
        ? raw.product_updates
        : DEFAULT_NOTIFICATION_CATEGORY_PREFS.product_updates,
    debrief_ready:
      typeof raw?.debrief_ready === "boolean"
        ? raw.debrief_ready
        : DEFAULT_NOTIFICATION_CATEGORY_PREFS.debrief_ready,
  };
}

export function readNotificationGlobalPrefs(profile: unknown): {
  email_notifications: boolean;
  session_reminders: boolean;
  marketing_emails: boolean;
} {
  const row =
    profile && typeof profile === "object"
      ? (profile as Record<string, unknown>)
      : null;

  return {
    email_notifications:
      typeof row?.email_notifications === "boolean"
        ? row.email_notifications
        : true,
    session_reminders:
      typeof row?.session_reminders === "boolean" ? row.session_reminders : true,
    marketing_emails:
      typeof row?.marketing_emails === "boolean" ? row.marketing_emails : false,
  };
}
