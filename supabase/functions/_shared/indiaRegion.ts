const INDIA_TIMEZONES = new Set(["Asia/Kolkata", "Asia/Calcutta"]);

/** Per-attempt budget for a profiles row (must not block search or paper preflight). */
export const PROFILE_LOOKUP_TIMEOUT_MS = 2_500;
/** JWT + billing profile path in authenticateRequest (gov paper / availability). */
export const AUTH_LOOKUP_TIMEOUT_MS = 8_000;

export type ProfileLookupState = "ok" | "timed_out" | "failed";

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

/**
 * Profile lookup is enrichment for hiding India-only families. A timeout or
 * failure must fail-open so search still returns the public registry.
 */
export function indiaUserAfterProfileLookup(
  profile: {
    region?: string | null;
    timezone?: string | null;
    locale?: string | null;
  } | null | undefined,
  lookupState: ProfileLookupState,
): boolean {
  if (lookupState !== "ok") return true;
  return resolveIsIndiaProfile(profile);
}

