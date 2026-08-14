const INDIA_TIMEZONES = new Set(["Asia/Kolkata", "Asia/Calcutta"]);

export function resolveIsIndiaProfile(profile: {
  region?: string | null;
  timezone?: string | null;
  locale?: string | null;
} | null | undefined): boolean {
  const storedRegion = String(profile?.region ?? "").trim().toUpperCase();
  if (storedRegion === "IN" || storedRegion === "INDIA") return true;
  if (storedRegion.length > 0) return false;
  const tz = String(profile?.timezone ?? "").trim();
  if (INDIA_TIMEZONES.has(tz)) return true;
  const locale = String(profile?.locale ?? "").trim();
  if (locale.endsWith("-IN") || locale === "en-IN" || locale === "hi-IN") return true;
  return false;
}
