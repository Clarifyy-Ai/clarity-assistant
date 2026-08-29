/**
 * Validate same-origin internal return paths for post-login redirects.
 * Rejects protocol-relative URLs, external hosts, and javascript: schemes.
 */
export function sanitizeReturnTo(
  raw: string | null | undefined,
  fallback: string | null = null,
): string | null {
  if (typeof raw !== "string") {
    return fallback;
  }

  const trimmed = raw.trim();
  if (!trimmed.startsWith("/")) {
    return fallback;
  }

  // Block protocol-relative and scheme-smuggling paths.
  if (trimmed.startsWith("//") || trimmed.includes("://")) {
    return fallback;
  }

  if (/^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(trimmed)) {
    return fallback;
  }

  // Disallow backslash tricks used in some open-redirect payloads.
  if (trimmed.includes("\\")) {
    return fallback;
  }

  return trimmed;
}

/** Build a login URL with optional reason + sanitized returnTo. */
export function buildLoginUrl(options?: {
  loginPath?: string;
  reason?: string;
  returnTo?: string | null;
}): string {
  const loginPath = options?.loginPath ?? "/login";
  const params = new URLSearchParams();

  if (options?.reason) {
    params.set("reason", options.reason);
  }

  const safeReturn = sanitizeReturnTo(options?.returnTo ?? null);
  if (safeReturn) {
    params.set("returnTo", safeReturn);
  }

  const qs = params.toString();
  return qs ? `${loginPath}?${qs}` : loginPath;
}

/**
 * Hard-navigate to login with returnTo of the current (or provided) path.
 * Prefer this after logout so SPA race with ProtectedRoute cannot drop returnTo.
 */
export function assignLoginWithReturnTo(options?: {
  returnTo?: string | null;
  reason?: string;
}): void {
  if (typeof window === "undefined") return;

  const returnTo =
    options?.returnTo ??
    `${window.location.pathname}${window.location.search}${window.location.hash}`;

  window.location.assign(
    buildLoginUrl({
      returnTo,
      reason: options?.reason,
    }),
  );
}
