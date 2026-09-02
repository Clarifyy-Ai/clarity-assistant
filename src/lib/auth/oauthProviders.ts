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

function buildOAuthErrorHaystack(
  ...parts: Array<string | null | undefined>
): string {
  return parts
    .filter((value): value is string => typeof value === "string" && value.trim().length > 0)
    .join(" ")
    .toLowerCase();
}

/** True when Google/GitHub/etc. is not enabled or misconfigured for this deployment. */
export function isOAuthNotConfiguredError(
  error: string | null | undefined,
  description?: string | null,
  errorCode?: string | null,
): boolean {
  const haystack = buildOAuthErrorHaystack(error, description, errorCode);
  return (
    haystack.includes("provider is not enabled") ||
    haystack.includes("unsupported provider") ||
    haystack.includes("oauth_provider_not_found") ||
    haystack.includes("provider_disabled") ||
    haystack.includes("redirect_uri_mismatch") ||
    haystack.includes("redirect url") ||
    haystack.includes("redirect_to") ||
    haystack.includes("invalid redirect") ||
    haystack.includes("access blocked") ||
    haystack.includes("oauth client") ||
    haystack.includes("validation_failed")
  );
}

/** True when an OAuth preflight (`skipBrowserRedirect`) proves the provider is broken. */
export function isOAuthProbeMisconfiguredError(error: unknown): boolean {
  if (!error) {
    return false;
  }

  if (typeof error === "string") {
    return isOAuthNotConfiguredError(error);
  }

  if (typeof error !== "object") {
    return false;
  }

  const err = error as {
    message?: string;
    msg?: string;
    error_description?: string;
    code?: string;
    error_code?: string;
    status?: number;
  };

  return isOAuthNotConfiguredError(
    err.message ?? err.msg ?? null,
    err.error_description ?? null,
    err.code ?? err.error_code ?? null,
  );
}

/** True when the provider returned a state/PKCE mismatch (user should retry). */
export function isOAuthStateMismatchError(
  error: string | null | undefined,
  description?: string | null,
  errorCode?: string | null,
): boolean {
  const haystack = buildOAuthErrorHaystack(error, description, errorCode);
  return (
    haystack.includes("state mismatch") ||
    haystack.includes("invalid state") ||
    haystack.includes("bad_oauth_state") ||
    haystack.includes("oauth state") ||
    (haystack.includes("state") && haystack.includes("mismatch"))
  );
}

export const OAUTH_NOT_CONFIGURED_MESSAGE =
  "Google sign-in is not configured on this deployment. Use email and password, or contact support.";
