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
  "Your session expired. Please sign in again.";

/** Shown when a sign-out in another browser tab ended this tab's session too. */
export const SIGNED_OUT_ELSEWHERE_REASON = "signed_out_elsewhere" as const;
export const SIGNED_OUT_ELSEWHERE_MESSAGE =
  "You were signed out because this account signed out in another tab.";

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
  reason: string,
  currentPath?: string | null,
): void {
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
