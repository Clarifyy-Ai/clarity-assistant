/**
 * Pure helpers for building absolute redirect URLs used in Supabase Auth
 * emails (password reset, magic link, signup confirmation, etc.).
 *
 * QA-041 root cause: `VITE_APP_URL` is inlined at build time. A production
 * bundle built with a dev/preview `.env` (which defaults `VITE_APP_URL` to
 * `http://localhost:5173`) bakes that localhost URL into every
 * `resetPasswordForEmail({ redirectTo })` call — regardless of the domain the
 * page is actually served from. The recipient's email client then tries to
 * open `http://localhost:5173/...`, which is not routable from their
 * machine ("connection refused").
 *
 * Fix: never trust a localhost `VITE_APP_URL` while `VITE_APP_ENV=production`.
 * In that case, fall back to the known production origin instead.
 */

/** Canonical production origin for Career Pilot. Keep in sync with docs/QA_ENVIRONMENTS.md. */
export const PRODUCTION_APP_URL = "https://clarify.ai.sltfinanceindia.com";

const LOCAL_HOSTNAMES = new Set(["localhost", "127.0.0.1", "0.0.0.0", "::1"]);

function parseHttpUrl(value: string): URL | null {
  try {
    const parsed = new URL(value);
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

/** True if `value` is a syntactically valid http(s) URL pointing at localhost/loopback. */
export function isLocalhostUrl(value: string): boolean {
  const parsed = parseHttpUrl(value);
  if (!parsed) return false;
  return LOCAL_HOSTNAMES.has(parsed.hostname.toLowerCase());
}

function stripTrailingSlashes(value: string): string {
  return value.replace(/\/+$/, "");
}

export interface BuildAuthRedirectUrlOptions {
  /** Path to append, e.g. "/reset-password". Leading slash optional. */
  path: string;
  /** Raw `import.meta.env.VITE_APP_URL` value (may be undefined/empty). */
  configuredAppUrl?: string | null;
  /** Raw `import.meta.env.VITE_APP_ENV` value (may be undefined/empty). */
  appEnv?: string | null;
  /** Runtime fallback, typically `window.location.origin`. */
  windowOrigin?: string | null;
  /** Override for testing; defaults to {@link PRODUCTION_APP_URL}. */
  productionFallbackUrl?: string;
}

/**
 * Resolve the absolute URL Supabase Auth should redirect to after a user
 * completes an email-based auth flow (password recovery, magic link, etc.).
 *
 * Priority:
 * 1. `VITE_APP_URL`, unless it's a localhost URL in a production build
 *    (misconfigured preview/dev env leaking into a prod bundle).
 * 2. The known production URL, if `VITE_APP_ENV=production`.
 * 3. `window.location.origin` (safe for local/dev/preview usage).
 * 4. The known production URL, as a last-resort default.
 */
export function buildAuthRedirectUrl(
  options: BuildAuthRedirectUrlOptions,
): string {
  const {
    path,
    configuredAppUrl,
    appEnv,
    windowOrigin,
    productionFallbackUrl = PRODUCTION_APP_URL,
  } = options;

  const normalizedPath = path.startsWith("/") ? path : `/${path}`;
  const isProduction = (appEnv ?? "").trim().toLowerCase() === "production";

  const configured = (configuredAppUrl ?? "").trim();
  const configuredParsed = configured ? parseHttpUrl(configured) : null;

  if (configuredParsed) {
    const configuredIsLocalhost = isLocalhostUrl(configured);
    // A localhost VITE_APP_URL is a dev convenience — never honor it in prod.
    if (!(isProduction && configuredIsLocalhost)) {
      return `${stripTrailingSlashes(configuredParsed.toString())}${normalizedPath}`;
    }
  } else if (isProduction) {
    // Missing/invalid VITE_APP_URL in a production build: never fall back to
    // window.location.origin here, since a misconfigured preview deploy can
    // be served from an unexpected/internal host.
    return `${stripTrailingSlashes(productionFallbackUrl)}${normalizedPath}`;
  }

  const origin = (windowOrigin ?? "").trim();
  const originParsed = origin ? parseHttpUrl(origin) : null;
  if (originParsed) {
    return `${stripTrailingSlashes(originParsed.toString())}${normalizedPath}`;
  }

  return `${stripTrailingSlashes(productionFallbackUrl)}${normalizedPath}`;
}
