/** Per-attempt budget for a profiles row (must not block search or paper preflight). */
export const PROFILE_LOOKUP_TIMEOUT_MS = 2_500;
/** JWT + billing profile path in authenticateRequest (gov paper / availability). */
export const AUTH_LOOKUP_TIMEOUT_MS = 8_000;

export type ProfileLookupState = "ok" | "timed_out" | "failed";

/**
 * Gov exam APIs are available worldwide (matches client `resolveIsIndiaUser`).
 * Kept as a named check so call sites and REGION_RESTRICTED contracts stay stable;
 * force-deny can be reintroduced here without rewriting every edge handler.
 */
export function resolveIsIndiaProfile(profile: {
  region?: string | null;
  timezone?: string | null;
  locale?: string | null;
} | null | undefined): boolean {
  void profile;
  return true;
}

/**
 * Profile lookup is enrichment for India-family ranking. A timeout or
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
