// ─────────────────────────────────────────────────────────────────────────────
// dateUtils.ts — Date parsing, formatting, comparison, and relative time.
// ─────────────────────────────────────────────────────────────────────────────

// ─── Constants ────────────────────────────────────────────────────────────────

const MS = {
  SECOND: 1000,
  MINUTE: 60 * 1000,
  HOUR:   60 * 60 * 1000,
  DAY:    24 * 60 * 60 * 1000,
  WEEK:   7  * 24 * 60 * 60 * 1000,
  MONTH:  30 * 24 * 60 * 60 * 1000,
  YEAR:   365 * 24 * 60 * 60 * 1000,
} as const;

// ─── Type Coercion ────────────────────────────────────────────────────────────

/**
 * Coerce any date-like value to a Date object.
 */
export function toDate(value: Date | string | number): Date {
  if (value instanceof Date) return value;
  return new Date(value);
}

/**
 * Safely parse a date — returns null instead of Invalid Date.
 */
export function parseDate(value: unknown): Date | null {
  if (!value) return null;
  const d = new Date(value as string | number | Date);
  return isNaN(d.getTime()) ? null : d;
}

// ─── Formatters ───────────────────────────────────────────────────────────────

/**
 * Format a date as a short readable string.
 * @example formatDate(new Date()) → "Mar 19, 2026"
 */
export function formatDate(date: Date | string, locale = "en-US"): string {
  return toDate(date).toLocaleDateString(locale, {
    month: "short",
    day:   "numeric",
    year:  "numeric",
  });
}

/**
 * Format a date with time.
 * @example formatDateTime(new Date()) → "Mar 19, 2026, 7:08 PM"
 */
export function formatDateTime(date: Date | string, locale = "en-US"): string {
  return toDate(date).toLocaleString(locale, {
    month:  "short",
    day:    "numeric",
    year:   "numeric",
    hour:   "numeric",
    minute: "2-digit",
    hour12: true,
  });
}

/**
 * Format time only.
 * @example formatTime(new Date()) → "7:08 PM"
 */
export function formatTime(date: Date | string, locale = "en-US"): string {
  return toDate(date).toLocaleTimeString(locale, {
    hour:   "numeric",
    minute: "2-digit",
    hour12: true,
  });
}

/**
 * Format as ISO date string (yyyy-mm-dd).
 * @example formatISODate(new Date()) → "2026-03-19"
 */
export function formatISODate(date: Date | string): string {
  return toDate(date).toISOString().split("T")[0];
}

/**
 * Format date for calendar inputs (yyyy-MM-ddThh:mm).
 */
export function formatInputDateTime(date: Date | string): string {
  const d = toDate(date);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

// ─── Relative Time ────────────────────────────────────────────────────────────

/**
 * Format a date as a relative time string.
 * @example timeAgo(new Date(Date.now() - 90000)) → "2 minutes ago"
 * @example timeAgo(new Date(Date.now() + 3600000)) → "in 1 hour"
 */
export function timeAgo(date: Date | string): string {
  const diff = Date.now() - toDate(date).getTime();
  const abs  = Math.abs(diff);
  const past = diff > 0;

  const format = (value: number, unit: string) => {
    const rounded = Math.round(value);
    const label   = `${rounded} ${unit}${rounded !== 1 ? "s" : ""}`;
    return past ? `${label} ago` : `in ${label}`;
  };

  if (abs < MS.MINUTE)  return past ? "just now" : "in a moment";
  if (abs < MS.HOUR)    return format(abs / MS.MINUTE, "minute");
  if (abs < MS.DAY)     return format(abs / MS.HOUR,   "hour");
  if (abs < MS.WEEK)    return format(abs / MS.DAY,    "day");
  if (abs < MS.MONTH)   return format(abs / MS.WEEK,   "week");
  if (abs < MS.YEAR)    return format(abs / MS.MONTH,  "month");
  return format(abs / MS.YEAR, "year");
}

/**
 * Use Intl.RelativeTimeFormat for locale-aware relative time.
 */
export function relativeTime(date: Date | string, locale = "en"): string {
  const rtf  = new Intl.RelativeTimeFormat(locale, { numeric: "auto" });
  const diff = toDate(date).getTime() - Date.now();
  const abs  = Math.abs(diff);
  const sign = diff < 0 ? -1 : 1;

  if (abs < MS.MINUTE)  return rtf.format(Math.round(diff / MS.SECOND), "second");
  if (abs < MS.HOUR)    return rtf.format(sign * Math.round(abs / MS.MINUTE), "minute");
  if (abs < MS.DAY)     return rtf.format(sign * Math.round(abs / MS.HOUR), "hour");
  if (abs < MS.WEEK)    return rtf.format(sign * Math.round(abs / MS.DAY), "day");
  if (abs < MS.MONTH)   return rtf.format(sign * Math.round(abs / MS.WEEK), "week");
  if (abs < MS.YEAR)    return rtf.format(sign * Math.round(abs / MS.MONTH), "month");
  return rtf.format(sign * Math.round(abs / MS.YEAR), "year");
}

// ─── Comparisons ──────────────────────────────────────────────────────────────

export function isBefore(a: Date | string, b: Date | string): boolean {
  return toDate(a).getTime() < toDate(b).getTime();
}

export function isAfter(a: Date | string, b: Date | string): boolean {
  return toDate(a).getTime() > toDate(b).getTime();
}

export function isSameDay(a: Date | string, b: Date | string): boolean {
  const da = toDate(a);
  const db = toDate(b);
  return (
    da.getFullYear() === db.getFullYear() &&
    da.getMonth()    === db.getMonth()    &&
    da.getDate()     === db.getDate()
  );
}

export function isToday(date: Date | string): boolean {
  return isSameDay(date, new Date());
}

export function isTomorrow(date: Date | string): boolean {
  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  return isSameDay(date, tomorrow);
}

export function isPast(date: Date | string): boolean {
  return toDate(date).getTime() < Date.now();
}

export function isFuture(date: Date | string): boolean {
  return toDate(date).getTime() > Date.now();
}

// ─── Arithmetic ───────────────────────────────────────────────────────────────

export function addDays(date: Date | string, days: number): Date {
  const d = new Date(toDate(date).getTime());
  d.setDate(d.getDate() + days);
  return d;
}

export function addHours(date: Date | string, hours: number): Date {
  return new Date(toDate(date).getTime() + hours * MS.HOUR);
}

export function addMinutes(date: Date | string, minutes: number): Date {
  return new Date(toDate(date).getTime() + minutes * MS.MINUTE);
}

export function addMs(date: Date | string, ms: number): Date {
  return new Date(toDate(date).getTime() + ms);
}

export function diffMs(a: Date | string, b: Date | string): number {
  return toDate(a).getTime() - toDate(b).getTime();
}

export function diffDays(a: Date | string, b: Date | string): number {
  return Math.round(diffMs(a, b) / MS.DAY);
}

export function diffMinutes(a: Date | string, b: Date | string): number {
  return Math.round(diffMs(a, b) / MS.MINUTE);
}

// ─── Period Helpers ───────────────────────────────────────────────────────────

export function startOfDay(date: Date | string): Date {
  const d = new Date(toDate(date));
  d.setHours(0, 0, 0, 0);
  return d;
}

export function endOfDay(date: Date | string): Date {
  const d = new Date(toDate(date));
  d.setHours(23, 59, 59, 999);
  return d;
}

export function startOfMonth(date: Date | string): Date {
  const d = toDate(date);
  return new Date(d.getFullYear(), d.getMonth(), 1);
}

export function endOfMonth(date: Date | string): Date {
  const d = toDate(date);
  return new Date(d.getFullYear(), d.getMonth() + 1, 0, 23, 59, 59, 999);
}

/**
 * Get days remaining until a target date.
 * Returns 0 if already past.
 */
export function daysUntil(targetDate: Date | string): number {
  return Math.max(0, Math.ceil(diffMs(targetDate, new Date()) / MS.DAY));
}

/**
 * Format a session duration from start time to now (or end time).
 */
export function sessionDuration(
  startedAt: Date | string,
  endedAt?: Date | string
): string {
  const end   = endedAt ? toDate(endedAt) : new Date();
  const ms    = Math.abs(end.getTime() - toDate(startedAt).getTime());
  const mins  = Math.floor(ms / MS.MINUTE);
  const secs  = Math.floor((ms % MS.MINUTE) / MS.SECOND);
  return `${mins}:${String(secs).padStart(2, "0")}`;
}

/**
 * Determine if a date is within a time window.
 */
export function isWithin(
  date: Date | string,
  windowMs: number,
  from: Date | string = new Date()
): boolean {
  return Math.abs(diffMs(date, from)) <= windowMs;
}
