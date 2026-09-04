export type CalendarIntegrationPrefs = {
  calendar_auto_create: boolean;
  calendar_auto_import: boolean;
};

export const DEFAULT_CALENDAR_INTEGRATION_PREFS: CalendarIntegrationPrefs = {
  calendar_auto_create: true,
  calendar_auto_import: true,
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function readBool(value: unknown, fallback: boolean): boolean {
  return typeof value === "boolean" ? value : fallback;
}

export function readCalendarIntegrationPrefs(profile: unknown): CalendarIntegrationPrefs {
  const prefs = isRecord(profile) ? profile.notification_prefs : undefined;
  const integrations = isRecord(prefs) ? prefs.integrations : undefined;
  return {
    calendar_auto_create: readBool(
      isRecord(integrations) ? integrations.calendar_auto_create : undefined,
      DEFAULT_CALENDAR_INTEGRATION_PREFS.calendar_auto_create,
    ),
    calendar_auto_import: readBool(
      isRecord(integrations) ? integrations.calendar_auto_import : undefined,
      DEFAULT_CALENDAR_INTEGRATION_PREFS.calendar_auto_import,
    ),
  };
}

/** Merge a notification_prefs patch without dropping nested `integrations`. */
export function mergeNotificationPrefs(
  existing: unknown,
  patch: Record<string, unknown>,
): Record<string, unknown> {
  const base = isRecord(existing) ? { ...existing } : {};
  const prevIntegrations = isRecord(base.integrations) ? base.integrations : {};
  const next = { ...base, ...patch };
  if (isRecord(patch.integrations)) {
    next.integrations = { ...prevIntegrations, ...patch.integrations };
  } else {
    next.integrations = prevIntegrations;
  }
  return next;
}

export function shouldWriteCalendarEvent(input: {
  syncAvailable: boolean;
  isConnected: boolean;
  autoCreate: boolean;
}): boolean {
  return input.syncAvailable && input.isConnected && input.autoCreate;
}
