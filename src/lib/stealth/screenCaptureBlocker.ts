// src/lib/stealth/screenCaptureBlocker.ts

import { isElectron } from "../env/isElectron"; // adjust import path to your env helper
import { stealthBridge } from "./electronBridge";

export type StealthPlatform = "windows" | "macos" | "browser";

export type StealthMethod =
  | "setwindowdisplayaffinity" // Windows
  | "cgwindowlevel"            // macOS
  | "css-only";                // Browser fallback (no real protection)

export interface ScreenCaptureMitigation {
  platform: StealthPlatform;
  enabled: boolean;
  method: StealthMethod;
}

export interface ScreenCaptureBlockerOptions {
  /**
   * If true, we attempt to exclude the overlay window from OS-level
   * screen capture: SetWindowDisplayAffinity (Windows),
   * CGWindowLevel(kCGMaximumWindowLevelKey) (macOS).
   */
  excludeFromCapture?: boolean;

  /**
   * If true, overlay opacity auto-fades to ~15% when mouse leaves
   * the overlay bounds, per manual spec (Ch. 6.2 “Opacity Auto-Fade”).
   */
  enableOpacityAutoFade?: boolean;

  /**
   * If true, overlay auto-hides on focus loss, per manual spec
   * (Ch. 6.2 “Auto-Hide on Focus Loss”).
   */
  enableAutoHideOnFocusLoss?: boolean;
}

const DEFAULT_OPTIONS: Required<ScreenCaptureBlockerOptions> = {
  excludeFromCapture: true,
  enableOpacityAutoFade: true,
  enableAutoHideOnFocusLoss: true,
};

let currentMitigation: ScreenCaptureMitigation | null = null;
let mouseLeaveTimer: number | null = null;
let focusListenerAttached = false;

/**
 * Enable all configured stealth mechanisms for the overlay window.
 * This is called from overlay initialization (e.g., OverlayWindow.tsx mount).
 */
export async function enableScreenCaptureBlocker(
  opts: ScreenCaptureBlockerOptions = {}
): Promise<ScreenCaptureMitigation> {
  const options = { ...DEFAULT_OPTIONS, ...opts };

  const platform: StealthPlatform = detectPlatform();
  const mitigation: ScreenCaptureMitigation = {
    platform,
    enabled: false,
    method: platform === "browser" ? "css-only" : platform === "windows"
      ? "setwindowdisplayaffinity"
      : "cgwindowlevel",
  };

  // 1) OS-level capture exclusion (Electron desktop only)
  if (options.excludeFromCapture && isElectron()) {
    try {
      const success = await stealthBridge.setScreenCaptureExcluded(true);
      mitigation.enabled = success;
    } catch (err) {
      console.error("[stealth] Failed to enable OS capture blocker:", err);
      mitigation.enabled = false;
    }
  } else {
    // Browser or Electron disabled -> CSS-only fallback
    mitigation.enabled = false;
  }

  // 2) Opacity auto-fade (CSS / DOM only, works in browser + Electron)
  if (options.enableOpacityAutoFade) {
    attachOpacityAutoFade();
  }

  // 3) Auto-hide on focus loss (desktop only)
  if (options.enableAutoHideOnFocusLoss && isElectron()) {
    attachAutoHideOnFocusLoss();
  }

  currentMitigation = mitigation;
  return mitigation;
}

/**
 * Disable all stealth mechanisms (used by Panic Button or when leaving live mode).
 */
export async function disableScreenCaptureBlocker(): Promise<void> {
  if (isElectron()) {
    try {
      await stealthBridge.setScreenCaptureExcluded(false);
    } catch (err) {
      console.error("[stealth] Failed to disable OS capture blocker:", err);
    }
  }
  detachOpacityAutoFade();
  detachAutoHideOnFocusLoss();
  currentMitigation = null;
}

/**
 * Read-only accessor for current mitigation state.
 */
export function getCurrentScreenCaptureMitigation():
  ScreenCaptureMitigation | null {
  return currentMitigation;
}

/**
 * Manual trigger for the panic button:
 * - Immediately kills all overlay visibility
 * - Disables screen capture blocker (safe cleanup)
 */
export async function triggerPanicKill(): Promise<void> {
  try {
    // Hide via bridge so desktop window is closed/minimized
    if (isElectron()) {
      await stealthBridge.hideOverlayWindow();
    } else {
      const root = document.getElementById("clarify-overlay-root");
      if (root) {
        root.style.display = "none";
      }
    }
  } finally {
    await disableScreenCaptureBlocker();
  }
}

/**
 * (Optional) Test helper: validate whether overlay is excluded from capture.
 * In practice, this will be implemented via an Electron-only diagnostic window,
 * so for now we leave a stub that always returns false.
 */
export async function testScreenShareExclusion(
  platform: "zoom" | "teams" | "google-meet" | "obs"
): Promise<boolean> {
  console.warn(
    "[stealth] testScreenShareExclusion is a placeholder; " +
      "implement platform-specific diagnostics in Electron."
  );
  return false;
}

/* ──────────────────────────────────────────────────────────────── */
/* Internal helpers                                                */
/* ──────────────────────────────────────────────────────────────── */

function detectPlatform(): StealthPlatform {
  if (!isElectron()) return "browser";
  const platform = process.platform;
  if (platform === "win32") return "windows";
  if (platform === "darwin") return "macos";
  return "browser";
}

/**
 * Attach listeners to auto-fade overlay opacity to ~15% when cursor
 * leaves the overlay bounds, per manual spec (Ch. 6.2).
 */
function attachOpacityAutoFade(): void {
  const root = document.getElementById("clarify-overlay-root");
  if (!root) return;

  const ACTIVE_OPACITY = "1";
  const FADED_OPACITY = "0.15";
  root.style.transition = "opacity 160ms ease-out";
  root.style.opacity = ACTIVE_OPACITY;

  const onMouseEnter = () => {
    if (mouseLeaveTimer != null) {
      window.clearTimeout(mouseLeaveTimer);
      mouseLeaveTimer = null;
    }
    root.style.opacity = ACTIVE_OPACITY;
  };

  const onMouseLeave = () => {
    if (mouseLeaveTimer != null) {
      window.clearTimeout(mouseLeaveTimer);
    }
    mouseLeaveTimer = window.setTimeout(() => {
      root.style.opacity = FADED_OPACITY;
    }, 250); // small delay to avoid flicker
  };

  root.addEventListener("mouseenter", onMouseEnter);
  root.addEventListener("mouseleave", onMouseLeave);

  (root as any).__clarifyOpacityHandlers = { onMouseEnter, onMouseLeave };
}

function detachOpacityAutoFade(): void {
  const root = document.getElementById("clarify-overlay-root");
  if (!root) return;

  const handlers = (root as any).__clarifyOpacityHandlers as
    | { onMouseEnter: () => void; onMouseLeave: () => void }
    | undefined;

  if (handlers) {
    root.removeEventListener("mouseenter", handlers.onMouseEnter);
    root.removeEventListener("mouseleave", handlers.onMouseLeave);
    delete (root as any).__clarifyOpacityHandlers;
  }
  root.style.opacity = "";
  root.style.transition = "";
}

/**
 * Attach a focus listener such that when another window gains focus,
 * the overlay auto-hides (minimize) per manual spec (Ch. 6.2).
 */
function attachAutoHideOnFocusLoss(): void {
  if (focusListenerAttached) return;
  if (!isElectron()) return;

  const handler = async () => {
    try {
      await stealthBridge.autoHideOnFocusLoss();
    } catch (err) {
      console.error("[stealth] autoHideOnFocusLoss failed:", err);
    }
  };

  window.addEventListener("blur", handler);
  (window as any).__clarifyFocusHandler = handler;
  focusListenerAttached = true;
}

function detachAutoHideOnFocusLoss(): void {
  if (!focusListenerAttached) return;

  const handler = (window as any).__clarifyFocusHandler as
    | (() => void)
    | undefined;

  if (handler) {
    window.removeEventListener("blur", handler);
    delete (window as any).__clarifyFocusHandler;
  }
  focusListenerAttached = false;
}
