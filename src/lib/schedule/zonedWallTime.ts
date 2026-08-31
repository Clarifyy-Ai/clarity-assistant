/** Convert a wall-clock date+time in an IANA zone (or offset) to a UTC Date. */

export function zonedWallTimeToUtc(
  date: string,
  time: string,
  zoneOrOffset: string,
): Date | null {
  if (!date || !time) return null;
  if (zoneOrOffset === "local") {
    const parsed = new Date(`${date}T${time}:00`);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  }
  if (zoneOrOffset === "Z" || /^[+-]\d{2}:\d{2}$/.test(zoneOrOffset)) {
    const parsed = new Date(`${date}T${time}:00${zoneOrOffset}`);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  }

  const [year, month, day] = date.split("-").map(Number);
  const [hour, minute] = time.split(":").map(Number);
  if (![year, month, day, hour, minute].every((n) => Number.isFinite(n))) return null;

  const asUtc = Date.UTC(year, month - 1, day, hour, minute, 0);
  try {
    const dtf = new Intl.DateTimeFormat("en-US", {
      timeZone: zoneOrOffset,
      hourCycle: "h23",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    });
    const partsOf = (ts: number) => {
      const parts = Object.fromEntries(
        dtf
          .formatToParts(new Date(ts))
          .filter((p) => p.type !== "literal")
          .map((p) => [p.type, p.value]),
      ) as Record<string, string>;
      return Date.UTC(
        Number(parts.year),
        Number(parts.month) - 1,
        Number(parts.day),
        Number(parts.hour),
        Number(parts.minute),
        Number(parts.second),
      );
    };
    return new Date(asUtc - (partsOf(asUtc) - asUtc));
  } catch {
    const parsed = new Date(`${date}T${time}:00`);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  }
}
