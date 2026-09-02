/** Strip PostgREST `.or()` / `ilike` metacharacters from admin search boxes. */
export function sanitizeAdminSearch(raw: string): string {
  return raw.replace(/[%(),]/g, "").trim();
}

function localIsoDay(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/** Fill a contiguous local-day series and count ISO timestamps that fall on those days. */
export function bucketIsoDays(
  timestamps: Array<string | null | undefined>,
  dayCount: number,
  end: Date = new Date(),
): { day: string; count: number }[] {
  const span = Math.max(1, dayCount);
  const days: string[] = [];
  const origin = new Date(end);
  origin.setHours(0, 0, 0, 0);
  for (let i = span - 1; i >= 0; i--) {
    const d = new Date(origin);
    d.setDate(origin.getDate() - i);
    days.push(localIsoDay(d));
  }
  const counts = new Map(days.map((day) => [day, 0]));
  for (const ts of timestamps) {
    if (!ts) continue;
    const parsed = new Date(ts);
    if (Number.isNaN(parsed.getTime())) continue;
    const key = localIsoDay(parsed);
    if (counts.has(key)) counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return days.map((day) => ({ day, count: counts.get(day) ?? 0 }));
}

export function formatAdminRelativeTime(
  value: string | null | undefined,
  formatDistanceToNow: (date: Date, options?: { addSuffix?: boolean }) => string,
): string {
  if (!value) return "—";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return "—";
  try {
    return formatDistanceToNow(parsed, { addSuffix: true });
  } catch {
    return "—";
  }
}
