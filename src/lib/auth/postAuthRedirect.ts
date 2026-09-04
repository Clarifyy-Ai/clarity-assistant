import { pathWithReturnTo, sanitizeReturnTo } from "@/lib/auth/safeReturnTo";

/**
 * First in-app route after email verification / OAuth / MFA / onboarding completion.
 * Prefer a sanitized deep-link returnTo when the user is already onboarded (or admin).
 * Never send incomplete onboarding users to an app deep link — finish onboarding first,
 * but embed returnTo in the onboarding URL so it survives refresh.
 */
export function getAuthenticatedEntryPath(options: {
  isAdmin: boolean;
  isOnboarded: boolean;
  preferredReturnTo?: string | null;
}): string {
  const preferred = sanitizeReturnTo(options.preferredReturnTo ?? null);
  if (options.isAdmin) {
    // Admins may still deep-link into app tools when onboarded.
    if (options.isOnboarded && preferred) return preferred;
    return "/app/admin";
  }
  if (!options.isOnboarded) {
    return pathWithReturnTo("/onboarding", preferred);
  }
  if (preferred) return preferred;
  return "/app/dashboard";
}

/** Path to open after onboarding finishes (honors preserved returnTo). */
export function getPostOnboardingPath(preferredReturnTo?: string | null): string {
  return sanitizeReturnTo(preferredReturnTo) ?? "/app/dashboard";
}
