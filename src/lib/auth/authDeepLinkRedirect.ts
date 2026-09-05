/**
 * Preserve intended auth destinations when Supabase falls back to Site URL.
 *
 * Recovery / magic-link / OAuth links must land on `/reset-password` or
 * `/auth/callback` with query + hash intact so tokens are not consumed on `/`.
 */

export const AUTH_RECOVERY_FLAG_KEY = "cp_auth_password_recovery";

export type AuthDeepLinkKind = "recovery" | "callback" | null;

function hasParam(
  search: string,
  hash: string,
  key: string,
): boolean {
  const fromSearch = new URLSearchParams(search.startsWith("?") ? search.slice(1) : search);
  const fromHash = new URLSearchParams(hash.replace(/^#/, ""));
  return Boolean(fromSearch.get(key) || fromHash.get(key));
}

function paramValue(search: string, hash: string, key: string): string | null {
  const fromSearch = new URLSearchParams(search.startsWith("?") ? search.slice(1) : search);
  const fromHash = new URLSearchParams(hash.replace(/^#/, ""));
  return fromSearch.get(key) || fromHash.get(key);
}

/** Supabase auth `type` values — not app filters like Session History `?type=mock_interview`. */
const SUPABASE_AUTH_TYPE_VALUES = new Set([
  "recovery",
  "signup",
  "magiclink",
  "invite",
  "email",
  "email_change",
  "email_change_current",
  "email_change_new",
  "reauthentication",
]);

function hasSupabaseAuthTypeParam(search: string, hash: string): boolean {
  const type = (paramValue(search, hash, "type") ?? "").toLowerCase();
  return SUPABASE_AUTH_TYPE_VALUES.has(type);
}

/** True when the URL carries Supabase auth tokens or errors that need a dedicated route. */
export function urlHasAuthDeepLinkParams(search = "", hash = ""): boolean {
  return (
    hasParam(search, hash, "code") ||
    hasParam(search, hash, "access_token") ||
    hasParam(search, hash, "token_hash") ||
    hasSupabaseAuthTypeParam(search, hash) ||
    hasParam(search, hash, "error_code") ||
    (hasParam(search, hash, "error") &&
      Boolean(paramValue(search, hash, "error_description") || paramValue(search, hash, "error_code")))
  );
}

export function detectAuthDeepLinkKind(input: {
  pathname?: string;
  search?: string;
  hash?: string;
  recoveryFlag?: boolean;
}): AuthDeepLinkKind {
  const search = input.search ?? "";
  const hash = input.hash ?? "";
  const type = (paramValue(search, hash, "type") ?? "").toLowerCase();

  if (input.recoveryFlag === true || type === "recovery") {
    return "recovery";
  }

  if (!urlHasAuthDeepLinkParams(search, hash)) {
    return null;
  }

  // OAuth / magic link / email confirm / invite share /auth/callback.
  return "callback";
}

/**
 * Returns a same-origin path (+ search + hash) to navigate to, or null when
 * the current location already matches the intended auth route.
 */
export function resolveAuthDeepLinkRedirect(input: {
  pathname: string;
  search?: string;
  hash?: string;
  recoveryFlag?: boolean;
}): string | null {
  const pathname = input.pathname || "/";
  const search = input.search ?? "";
  const hash = input.hash ?? "";
  const kind = detectAuthDeepLinkKind({
    pathname,
    search,
    hash,
    recoveryFlag: input.recoveryFlag,
  });

  if (!kind) return null;

  const targetPath = kind === "recovery" ? "/reset-password" : "/auth/callback";
  const normalized =
    pathname.length > 1 && pathname.endsWith("/")
      ? pathname.slice(0, -1)
      : pathname;

  if (normalized === targetPath) return null;

  return `${targetPath}${search}${hash}`;
}

export function markPasswordRecoveryFlow(): void {
  try {
    sessionStorage.setItem(AUTH_RECOVERY_FLAG_KEY, "1");
  } catch {
    // ignore quota / private mode
  }
}

export function clearPasswordRecoveryFlow(): void {
  try {
    sessionStorage.removeItem(AUTH_RECOVERY_FLAG_KEY);
  } catch {
    // ignore
  }
}

export function isPasswordRecoveryFlowMarked(): boolean {
  try {
    return sessionStorage.getItem(AUTH_RECOVERY_FLAG_KEY) === "1";
  } catch {
    return false;
  }
}

/**
 * Synchronous redirect before Supabase createClient consumes ?code= / hash
 * tokens on the wrong route (e.g. Site URL `/`).
 * Returns true when a redirect was started (caller should stop init).
 */
export function maybeRedirectAuthDeepLink(location?: {
  pathname: string;
  search: string;
  hash: string;
  href?: string;
  replace?: (url: string) => void;
}): boolean {
  if (typeof window === "undefined" && !location) return false;

  const pathname = location?.pathname ?? window.location.pathname;
  const search = location?.search ?? window.location.search;
  const hash = location?.hash ?? window.location.hash;
  const recoveryFlag = isPasswordRecoveryFlowMarked();

  const target = resolveAuthDeepLinkRedirect({
    pathname,
    search,
    hash,
    recoveryFlag,
  });

  if (!target) return false;

  if (target.startsWith("/reset-password")) {
    markPasswordRecoveryFlow();
  }

  const replace =
    location?.replace ??
    ((url: string) => {
      window.location.replace(url);
    });

  replace(target);
  return true;
}
