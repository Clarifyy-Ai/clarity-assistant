/**
 * Desktop app scope: overlay Practice Coach sessions only.
 * Dashboard, prep, billing, mock tests, etc. run in the web browser.
 */

import { isElectronApp } from "@/lib/platform/isElectron";

const ELECTRON_ALLOWED_EXACT = new Set([
  "/login",
  "/signup",
  "/verify-email",
  "/forgot-password",
  "/reset-password",
  "/auth/callback",
  "/auth/mfa-enroll",
  "/auth/mfa-recovery",
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

/**
 * Desktop-only capabilities that must not be advertised as fully available in the browser.
 * Browser may offer limited tab-audio share; that is not full system-audio capture.
 */
export type DesktopOnlyCapability =
  | "system_audio_full"
  | "capture_exclusion"
  | "global_hotkeys";

/** True only inside the Electron desktop shell (uses isElectronApp). */
export function isDesktopOnlyCapabilityAvailable(
  _capability: DesktopOnlyCapability,
): boolean {
  return isElectronApp();
}

/**
 * Honest system-audio availability for Live Copilot setup UI.
 * - desktop: full interviewer/system audio path is available in the app
 * - browser: not fully available — only optional Chromium tab-audio share
 * - none: no getDisplayMedia / unsupported surface
 */
export type SystemAudioAvailability = "desktop_full" | "browser_tab_limited" | "unavailable";

export function getSystemAudioAvailability(): SystemAudioAvailability {
  if (typeof navigator === "undefined" || !navigator.mediaDevices?.getDisplayMedia) {
    return "unavailable";
  }
  if (isElectronApp()) return "desktop_full";
  return "browser_tab_limited";
}

/** Never treat browser tab-share as “fully available” system audio. */
export function isSystemAudioFullyAvailable(): boolean {
  return getSystemAudioAvailability() === "desktop_full";
}
