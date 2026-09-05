/** Local-date string (YYYY-MM-DD) for HTML date inputs. */
export function todayIsoDate(): string {
  return new Date().toISOString().slice(0, 10);
}

export function daysAgoIsoDate(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() - days);
  return d.toISOString().slice(0, 10);
}

export function isTodayRange(from: string, to: string): boolean {
  const today = todayIsoDate();
  return from === today && to === today;
}

export function isLast7DaysRange(from: string, to: string): boolean {
  return from === daysAgoIsoDate(7) && to === todayIsoDate();
}
