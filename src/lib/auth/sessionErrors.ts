/**
 * Auth error classification helpers (pure — safe for unit tests).
 */

import { buildLoginUrl, sanitizeReturnTo } from "@/lib/auth/safeReturnTo";

function getErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }
  if (typeof error === "string" && error.trim().length > 0) {
    return error;
  }
  return "";
}

/** Stale/revoked refresh tokens should sign the user out locally, not freeze boot. */
export function isInvalidRefreshTokenError(error: unknown): boolean {
  const msg = getErrorMessage(error).toLowerCase();
  return (
    msg.includes("refresh token not found") ||
    msg.includes("invalid refresh token") ||
    msg.includes("invalid_grant")
  );
}

/**
 * Supabase errors that must NOT be retried — retrying burns time and creates log noise.
 */
export function isNonRetryableAuthError(error: unknown): boolean {
  const msg = getErrorMessage(error).toLowerCase();
  return (
    isInvalidRefreshTokenError(error) ||
    msg.includes("jwt expired") ||
    msg.includes("not authenticated") ||
    msg.includes("invalid api key") ||
    msg.includes("permission denied") ||
    msg.includes("row-level security")
  );
}

export const SESSION_EXPIRED_REASON = "session_expired" as const;
export const SESSION_EXPIRED_MESSAGE =
  "Your session has expired. Please sign in again.";

/** Shown when a sign-out in another browser tab ended this tab's session too. */
export const SIGNED_OUT_ELSEWHERE_REASON = "signed_out_elsewhere" as const;
export const SIGNED_OUT_ELSEWHERE_MESSAGE =
  "You were signed out because this account signed out in another tab.";

const AUTH_END_REASON_STORAGE_KEY = "clarify_auth_end_reason";
const LOGOUT_BROADCAST_STORAGE_KEY = "clarify_auth_logout_broadcast";
const LOGOUT_BROADCAST_MAX_AGE_MS = 8_000;

export type AuthEndReason =
  | typeof SESSION_EXPIRED_REASON
  | typeof SIGNED_OUT_ELSEWHERE_REASON;

export function persistAuthEndReason(reason: AuthEndReason): void {
  if (typeof sessionStorage === "undefined") return;
  try {
    sessionStorage.setItem(AUTH_END_REASON_STORAGE_KEY, reason);
  } catch {
    // Ignore quota / private-mode failures.
  }
}

export function peekAuthEndReason(): AuthEndReason | null {
  if (typeof sessionStorage === "undefined") return null;
  try {
    const value = sessionStorage.getItem(AUTH_END_REASON_STORAGE_KEY);
    if (value === SESSION_EXPIRED_REASON || value === SIGNED_OUT_ELSEWHERE_REASON) {
      return value;
    }
  } catch {
    // Ignore storage failures.
  }
  return null;
}

export function consumeAuthEndReason(): AuthEndReason | null {
  const value = peekAuthEndReason();
  if (typeof sessionStorage === "undefined" || !value) return value;
  try {
    sessionStorage.removeItem(AUTH_END_REASON_STORAGE_KEY);
  } catch {
    // Ignore storage failures.
  }
  return value;
}

/** Call before `signOut()` so other tabs can distinguish logout from expiry. */
export function markExplicitLogoutBroadcast(): void {
  if (typeof localStorage === "undefined") return;
  try {
    localStorage.setItem(LOGOUT_BROADCAST_STORAGE_KEY, String(Date.now()));
  } catch {
    // Ignore quota / private-mode failures.
  }
}

export function hasRecentLogoutBroadcast(
  nowMs = Date.now(),
  maxAgeMs = LOGOUT_BROADCAST_MAX_AGE_MS,
): boolean {
  if (typeof localStorage === "undefined") return false;
  try {
    const raw = localStorage.getItem(LOGOUT_BROADCAST_STORAGE_KEY);
    if (!raw) return false;
    const ts = Number(raw);
    return Number.isFinite(ts) && nowMs - ts >= 0 && nowMs - ts < maxAgeMs;
  } catch {
    return false;
  }
}

/**
 * Other tabs observe the logout broadcast key via the `storage` event.
 * This is more reliable than relying solely on GoTrue SIGNED_OUT when
 * network logout is mocked or delayed.
 */
export function subscribeCrossTabLogoutBroadcast(
  onLogout: () => void,
): () => void {
  if (typeof window === "undefined") {
    return () => undefined;
  }
  const handler = (event: StorageEvent) => {
    if (event.storageArea && event.storageArea !== localStorage) return;
    if (event.key !== LOGOUT_BROADCAST_STORAGE_KEY) return;
    if (event.newValue == null) return;
    onLogout();
  };
  window.addEventListener("storage", handler);
  return () => window.removeEventListener("storage", handler);
}

/**
 * Unexpected SIGNED_OUT (not the tab that clicked Log out):
 * a recent logout broadcast means another tab signed out; otherwise the
 * refresh token failed and the session expired.
 */
export function classifyUnexpectedSignedOut(opts: {
  recentLogoutBroadcast: boolean;
}): AuthEndReason {
  return opts.recentLogoutBroadcast
    ? SIGNED_OUT_ELSEWHERE_REASON
    : SESSION_EXPIRED_REASON;
}

/**
 * Normalize browser + Electron hash-router locations to an app path.
 * Examples:
 *   /app/dashboard → /app/dashboard
 *   /#/app/live → /app/live
 *   /?x=1#/app/admin → /app/admin
 */
export function resolveAppPath(raw: string | null | undefined): string {
  if (typeof raw !== "string" || raw.trim().length === 0) {
    return "/";
  }

  const trimmed = raw.trim();
  const hashIdx = trimmed.indexOf("#/");
  if (hashIdx >= 0) {
    const afterHash = trimmed.slice(hashIdx + 1); // "/app/..."
    const [pathOnly, query = ""] = afterHash.split("?");
    return query ? `${pathOnly}?${query}` : pathOnly;
  }

  return trimmed;
}

function isLoginPath(path: string): boolean {
  const resolved = resolveAppPath(path);
  return resolved === "/login" || resolved.startsWith("/login?");
}

function isProtectedAppPath(path: string): boolean {
  const resolved = resolveAppPath(path);
  return (
    resolved.startsWith("/app") ||
    resolved === "/dashboard" ||
    resolved.startsWith("/dashboard?") ||
    resolved === "/onboarding" ||
    resolved.startsWith("/onboarding/")
  );
}

/**
 * Hard-navigate to login with a given `reason`. Shared by session-expiry and
 * cross-tab sign-out flows. Uses assign() so half-mounted protected UI cannot
 * keep retrying. Supports Electron hash-router (`/#/app/...`) locations.
 */
function redirectToLoginWithReason(
  reason: AuthEndReason,
  currentPath?: string | null,
): void {
  persistAuthEndReason(reason);

  if (typeof window === "undefined") {
    return;
  }

  const path =
    currentPath ??
    `${window.location.pathname}${window.location.search}${window.location.hash}`;

  if (
    isLoginPath(path) ||
    window.location.pathname.startsWith("/login") ||
    window.location.hash.startsWith("#/login")
  ) {
    return;
  }

  // Only bounce protected / legacy dashboard / onboarding routes.
  if (!isProtectedAppPath(path)) {
    return;
  }

  const returnTo =
    sanitizeReturnTo(resolveAppPath(path)) ?? "/app/dashboard";
  const target = buildLoginUrl({
    reason,
    returnTo,
  });

  window.location.assign(target);
}

/**
 * Hard-navigate to login after an invalid refresh token.
 */
export function redirectToSessionExpiredLogin(
  currentPath?: string | null,
): void {
  redirectToLoginWithReason(SESSION_EXPIRED_REASON, currentPath);
}

/**
 * Hard-navigate to login after another tab signed this account out
 * (concurrent-tab logout sync).
 */
export function redirectAfterCrossTabSignOut(
  currentPath?: string | null,
): void {
  redirectToLoginWithReason(SIGNED_OUT_ELSEWHERE_REASON, currentPath);
}
