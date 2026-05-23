// src/lib/stealth/screenCaptureBlocker.ts
//
// P0-2 (production audit): screen-capture blocking, opacity auto-fade on mouse
// leave, auto-hide on focus loss, and panic-kill have all been disabled. They
// existed to conceal the overlay from an interviewer during a live call —
// covert-assistance behaviour outside the launch product scope.
//
// This module is now a backwards-compatible shim. All functions resolve safely
// without mutating window state or invoking the Electron stealth bridge. Do
// NOT reintroduce the original behaviour.

export type StealthPlatform = "windows" | "macos" | "browser";

export type StealthMethod =
  | "setwindowdisplayaffinity"
  | "cgwindowlevel"
  | "css-only"
  | "disabled";

export interface ScreenCaptureMitigation {
  platform: StealthPlatform;
  enabled: boolean;
  method: StealthMethod;
}

export interface ScreenCaptureBlockerOptions {
  excludeFromCapture?: boolean;
  enableOpacityAutoFade?: boolean;
  enableAutoHideOnFocusLoss?: boolean;
}

const DISABLED_MITIGATION: ScreenCaptureMitigation = {
  platform: "browser",
  enabled: false,
  method: "disabled",
};

/** @deprecated Disabled in P0-2. Returns an inert mitigation descriptor. */
export async function enableScreenCaptureBlocker(
  _opts: ScreenCaptureBlockerOptions = {}
): Promise<ScreenCaptureMitigation> {
  return DISABLED_MITIGATION;
}

/** @deprecated Disabled in P0-2. No-op. */
export async function disableScreenCaptureBlocker(): Promise<void> {}

export function getCurrentScreenCaptureMitigation():
  ScreenCaptureMitigation | null {
  return null;
}

/** @deprecated Disabled in P0-2 — panic-kill removed. No-op. */
export async function triggerPanicKill(): Promise<void> {}

/** @deprecated Always false since P0-2. */
export async function testScreenShareExclusion(
  _platform: "zoom" | "teams" | "google-meet" | "obs"
): Promise<boolean> {
  return false;
}
