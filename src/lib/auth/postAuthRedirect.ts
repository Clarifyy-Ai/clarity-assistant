/** First in-app route after email verification / OAuth callback. */
export function getAuthenticatedEntryPath(options: {
  isAdmin: boolean;
  isOnboarded: boolean;
}): string {
  if (options.isAdmin) return "/app/admin";
  if (!options.isOnboarded) return "/onboarding";
  return "/app/dashboard";
}
