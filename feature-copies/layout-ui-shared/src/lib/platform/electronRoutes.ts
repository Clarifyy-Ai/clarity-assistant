/**
 * Desktop app scope: overlay Practice Coach sessions only.
 * Dashboard, prep, billing, mock tests, etc. run in the web browser.
 */

const ELECTRON_ALLOWED_EXACT = new Set([
  "/login",
  "/signup",
  "/verify-email",
  "/forgot-password",
  "/reset-password",
  "/auth/callback",
  "/onboarding",
  "/app/live",
  "/app/live/overlay",
]);

const ELECTRON_ALLOWED_PREFIXES = [
  "/onboarding/",
] as const;

/** Paths the Electron shell may render. Everything else opens in the browser. */
export function isElectronAllowedPath(pathname: string): boolean {
  if (ELECTRON_ALLOWED_EXACT.has(pathname)) return true;
  return ELECTRON_ALLOWED_PREFIXES.some((prefix) => pathname.startsWith(prefix));
}

export const ELECTRON_DEFAULT_PATH = "/app/live/overlay";
