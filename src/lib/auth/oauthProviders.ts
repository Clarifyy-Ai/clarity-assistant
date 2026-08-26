// Enabled OAuth providers for login/signup UI and auth hooks.
// Controlled by VITE_OAUTH_PROVIDERS (comma-separated). Unset = none (fail closed).

export type OAuthProviderId =
  | "google"
  | "github"
  | "linkedin_oidc"
  | "azure";

const KNOWN_PROVIDERS = new Set<OAuthProviderId>([
  "google",
  "github",
  "linkedin_oidc",
  "azure",
]);

// Fail closed: never show OAuth CTAs unless VITE_OAUTH_PROVIDERS explicitly
// lists providers that are enabled in the Supabase Auth dashboard.
function parseProviderList(raw: string | undefined): OAuthProviderId[] {
  if (raw === undefined) {
    return [];
  }

  const trimmed = raw.trim();
  // Unset / empty / "none" → no OAuth CTAs (avoids "provider is not enabled").
  if (trimmed.length === 0 || trimmed.toLowerCase() === "none") {
    return [];
  }

  const seen = new Set<OAuthProviderId>();
  const result: OAuthProviderId[] = [];

  for (const part of trimmed.split(",")) {
    const id = part.trim().toLowerCase() as OAuthProviderId;
    if (!KNOWN_PROVIDERS.has(id) || seen.has(id)) continue;
    seen.add(id);
    result.push(id);
  }

  return result;
}

/** Providers enabled for the current build (from VITE_OAUTH_PROVIDERS). */
export function getEnabledOAuthProviders(): OAuthProviderId[] {
  return parseProviderList(import.meta.env.VITE_OAUTH_PROVIDERS);
}

export function isOAuthProviderEnabled(provider: string): boolean {
  return getEnabledOAuthProviders().includes(provider as OAuthProviderId);
}

/** True when the user cancelled the OAuth consent screen (not a failed login). */
export function isOAuthCancelledError(
  error: string | null | undefined,
  description?: string | null,
): boolean {
  const err = (error ?? "").trim().toLowerCase();
  const desc = (description ?? "").trim().toLowerCase();
  if (err === "access_denied") return true;
  const haystack = `${err} ${desc}`;
  return (
    haystack.includes("access_denied") ||
    haystack.includes("cancelled") ||
    haystack.includes("canceled")
  );
}
