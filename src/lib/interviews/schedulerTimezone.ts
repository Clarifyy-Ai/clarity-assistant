/** Shared scheduler timezone picker values and persistence helpers. */

export const SCHEDULER_TIMEZONE_OPTIONS = [
  { value: "Asia/Kolkata", label: "Asia/Kolkata (India)", offset: "+05:30" },
  { value: "UTC", label: "UTC", offset: "Z" },
  { value: "America/New_York", label: "America/New_York", offset: "local" },
  { value: "Europe/London", label: "Europe/London", offset: "local" },
  { value: "local", label: "Local browser time", offset: "local" },
] as const;

export type SchedulerTimezoneKey = (typeof SCHEDULER_TIMEZONE_OPTIONS)[number]["value"];

const PICKER_VALUES = new Set(
  SCHEDULER_TIMEZONE_OPTIONS.map((z) => z.value),
);

/** Legacy / OS aliases → canonical IANA ids we allowlist. */
const IANA_TIMEZONE_ALIASES: Record<string, string> = {
  "Asia/Calcutta": "Asia/Kolkata",
  "Asia/Saigon": "Asia/Ho_Chi_Minh",
  "Europe/Kyiv": "Europe/Kiev",
  "America/Argentina/Buenos_Aires": "America/Buenos_Aires",
};

/** Map known aliases to canonical IANA; leave unknown values unchanged. */
export function normalizeIanaTimezoneAlias(value: string): string {
  const trimmed = value.trim();
  if (!trimmed || trimmed === "local") return trimmed;
  return IANA_TIMEZONE_ALIASES[trimmed] ?? trimmed;
}

/** Resolve stored DB timezone to a picker key (round wins over interview). */
export function resolveSchedulerTimezoneKey(
  roundTimezone?: string | null,
  interviewTimezone?: string | null,
): SchedulerTimezoneKey {
  const storedRaw = roundTimezone ?? interviewTimezone;
  if (!storedRaw) return "local";
  const stored = normalizeIanaTimezoneAlias(storedRaw);
  if (PICKER_VALUES.has(stored as SchedulerTimezoneKey)) {
    return stored as SchedulerTimezoneKey;
  }
  return stored as SchedulerTimezoneKey;
}

/** Map picker key to zonedWallTimeToUtc zoneOrOffset argument. */
export function zoneOrOffsetForPicker(timeZoneKey: string): string {
  const key = normalizeIanaTimezoneAlias(timeZoneKey);
  const opt = SCHEDULER_TIMEZONE_OPTIONS.find((z) => z.value === key);
  if (!opt) return "local";
  if (opt.offset !== "local") return opt.offset;
  if (opt.value === "local") return "local";
  return opt.value;
}

/** Extract YYYY-MM-DD and HH:MM wall parts for a UTC ISO in the given zone. */
export function utcIsoToZonedWallParts(
  iso: string | null | undefined,
  timeZoneKey: string,
): { date: string; time: string } | null {
  if (!iso) return null;
  const when = new Date(iso);
  if (Number.isNaN(when.getTime())) return null;

  const key = normalizeIanaTimezoneAlias(timeZoneKey);
  if (key === "local") {
    const y = when.getFullYear();
    const m = String(when.getMonth() + 1).padStart(2, "0");
    const day = String(when.getDate()).padStart(2, "0");
    const h = String(when.getHours()).padStart(2, "0");
    const min = String(when.getMinutes()).padStart(2, "0");
    return { date: `${y}-${m}-${day}`, time: `${h}:${min}` };
  }

  const ianaZone = key === "UTC" ? "UTC" : key;
  return isoWallPartsFromDate(when, ianaZone);
}

function isoWallPartsFromDate(
  when: Date,
  timeZone?: string,
): { date: string; time: string } | null {
  try {
    const dtf = new Intl.DateTimeFormat("en-CA", {
      timeZone: timeZone ?? undefined,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
    });
    const parts = Object.fromEntries(
      dtf
        .formatToParts(when)
        .filter((p) => p.type !== "literal")
        .map((p) => [p.type, p.value]),
    ) as Record<string, string>;
    const year = parts.year;
    const month = parts.month;
    const day = parts.day;
    const hour = parts.hour;
    const minute = parts.minute;
    if (!year || !month || !day || hour === undefined || minute === undefined) return null;
    return { date: `${year}-${month}-${day}`, time: `${hour}:${minute}` };
  } catch {
    return null;
  }
}

function calendarDateInZone(when: Date, timeZoneKey: string): string | null {
  const key = normalizeIanaTimezoneAlias(timeZoneKey);
  if (key === "local") {
    const y = when.getFullYear();
    const m = String(when.getMonth() + 1).padStart(2, "0");
    const day = String(when.getDate()).padStart(2, "0");
    return `${y}-${m}-${day}`;
  }
  const ianaZone = key === "UTC" ? "UTC" : key;
  const wall = isoWallPartsFromDate(when, ianaZone);
  return wall?.date ?? null;
}

/** True when the scheduled instant falls on today's calendar date in the interview timezone. */
export function isScheduledToday(
  iso: string | null | undefined,
  timeZoneKey?: string | null,
): boolean {
  if (!iso) return false;
  const when = new Date(iso);
  if (Number.isNaN(when.getTime())) return false;
  const zone = timeZoneKey && timeZoneKey !== "local" ? timeZoneKey : "local";
  const scheduledDate = calendarDateInZone(when, zone);
  const todayDate = calendarDateInZone(new Date(), zone);
  return Boolean(scheduledDate && todayDate && scheduledDate === todayDate);
}

/** Persist IANA timezone, never the picker sentinel `local`. */
export function persistableIanaTimezone(key: string | null | undefined): string {
  if (key && key !== "local") return normalizeIanaTimezoneAlias(key);
  try {
    const browser = Intl.DateTimeFormat().resolvedOptions().timeZone || "Asia/Kolkata";
    return normalizeIanaTimezoneAlias(browser);
  } catch {
    return "Asia/Kolkata";
  }
}

/** Infer picker key from ISO offset when no DB timezone column is set (legacy rows). */
export function inferTimezoneKeyFromIso(iso: string): SchedulerTimezoneKey {
  if (/[+-]05:30$/.test(iso)) return "Asia/Kolkata";
  return "local";
}
