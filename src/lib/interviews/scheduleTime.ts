export { zonedWallTimeToUtc } from "@/lib/schedule/zonedWallTime";

export function formatInTimeZone(iso: string, timeZone: string): string {
  const when = new Date(iso);
  if (Number.isNaN(when.getTime())) return iso;
  try {
    return when.toLocaleString("en-US", {
      timeZone,
      dateStyle: "full",
      timeStyle: "short",
    });
  } catch {
    return when.toLocaleString("en-US", { dateStyle: "full", timeStyle: "short" });
  }
}
