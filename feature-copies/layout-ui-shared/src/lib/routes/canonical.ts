import { ROUTES } from "@/lib/constants/apiEndpoints";

/** Onboarding completion always lands here — Start Practice is a separate CTA. */
export const ONBOARDING_COMPLETION_PATH = ROUTES.DASHBOARD;

export const CANONICAL_DEBRIEFS = "/app/debriefs";
export const LEGACY_DEBRIEF = "/app/debrief";
export const RETIRED_ROOMS_PATH = "/app/rooms";
export const RETIRED_ROOMS_REDIRECT = ROUTES.DASHBOARD;
export const RETIRED_ROOMS_TOAST = "Group Practice is not currently available.";

export function debriefCanonicalPath(id?: string | null): string {
  if (!id) return CANONICAL_DEBRIEFS;
  return `${CANONICAL_DEBRIEFS}/${id}`;
}

export function debriefLegacyRedirect(id?: string | null): string {
  return debriefCanonicalPath(id);
}
