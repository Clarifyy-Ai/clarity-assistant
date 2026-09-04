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

/**
 * Prefer `?returnTo=` then React Router `location.state.from` (Location or path string).
 */
export function preferredReturnToFromNavigation(input: {
  searchParams?: URLSearchParams | null;
  locationState?: unknown;
}): string | null {
  const fromQuery = sanitizeReturnTo(input.searchParams?.get("returnTo") ?? null);
  if (fromQuery) return fromQuery;

  const state = input.locationState as
    | { from?: { pathname?: string; search?: string; hash?: string } | string }
    | null
    | undefined;
  const from = state?.from;
  if (typeof from === "string") {
    return sanitizeReturnTo(from);
  }
  if (from && typeof from === "object" && typeof from.pathname === "string") {
    return sanitizeReturnTo(
      `${from.pathname}${from.search ?? ""}${from.hash ?? ""}`,
    );
  }
  return null;
}

/**
 * Append a sanitized `returnTo` query so deep-links survive full-page refresh
 * (React Router `location.state` does not).
 */
export function pathWithReturnTo(
  pathname: string,
  returnTo?: string | null,
): string {
  const safe = sanitizeReturnTo(returnTo ?? null);
  if (!safe) return pathname;

  const qIndex = pathname.indexOf("?");
  const path = qIndex >= 0 ? pathname.slice(0, qIndex) : pathname;
  const existing = qIndex >= 0 ? pathname.slice(qIndex + 1) : "";
  const params = new URLSearchParams(existing);
  params.set("returnTo", safe);
  return `${path}?${params.toString()}`;
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
