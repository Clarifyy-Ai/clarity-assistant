// src/lib/overlay/screenCaptureEvasion.ts
//
// Screen Capture Evasion — three-tier approach:
//
// TIER 1 — FULL (Electron on macOS 10.15+ / Windows 10+)
//   Uses window.electronAPI.setContentProtection(true) which maps to
//   BrowserWindow.setContentProtection() in the main process. The OS
//   kernel marks the framebuffer region as protected — capture tools
//   including OBS, Loom, Zoom, and native screenshot APIs get a black
//   rectangle. Works on macOS (CGWindowListCreateImage blocked) and
//   Windows (DWMWA_CLOAK + DRM-like surface flag). Linux: NOT supported
//   by Electron's setContentProtection — falls through to Tier 2.
//
// TIER 2 — PARTIAL (Chromium-based browsers: Chrome 94+, Edge 94+)
//   Intercepts navigator.mediaDevices.getDisplayMedia at the prototype
//   level before the page loads. When screen sharing starts, the overlay
//   element gets data-capture-active="true" which CSS can target with
//   visibility:hidden or mix-blend-mode tricks. This defeats tab-only
//   capture tools (Loom browser extension, some recording extensions).
//   Does NOT defeat OS-level capture or Zoom's native video capture.
//   Firefox: prototype intercept is blocked by Firefox's security model.
//   Safari: getDisplayMedia behaviour differs — intercept is unreliable.
//
// TIER 3 — NONE (Firefox, Safari, non-Electron desktop)
//   No reliable programmatic evasion possible. UI shows a clear warning.
//   Recommend the user use the desktop app (Electron) for real protection.

import { isElectronApp } from "@/lib/platform/isElectron";

/* ─── TYPES ─────────────────────────────────────────────────────────────── */

export const STEALTH_ATTR = "stealthActive" as const;
export const CAPTURE_ATTR = "captureActive" as const;

/**
 * Honest capture-exclusion product states (P0 overlay honesty).
 * Never claim Supported while enableContentProtection returns false.
 */
export type CaptureExclusionStatus =
  | "supported"
  | "unsupported"
  | "not_verified"
  | "not_guaranteed";

/** @deprecated Prefer CaptureExclusionStatus — same honesty vocabulary. */
export type SupportLevel = CaptureExclusionStatus;

export const CAPTURE_EXCLUSION_STATUS_LABEL: Record<CaptureExclusionStatus, string> = {
  supported: "Supported",
  unsupported: "Unsupported",
  not_verified: "Not Verified",
  not_guaranteed: "Not Guaranteed",
};

/**
 * Required before any capture-exclusion claim. Shown whenever UI discusses exclusion.
 */
export const CAPTURE_EXCLUSION_DISCLAIMER =
  "Overlay visibility during screen sharing depends on the operating system, conferencing application, capture method, and whether a window, tab, monitor, or complete desktop is shared. Career Pilot cannot guarantee that the overlay will remain hidden. Test the configuration before a real session, follow applicable policies, obtain required consent, and use assistance only where permitted.";

export interface SupportInfo {
  /** Honest product status for capture exclusion */
  status: CaptureExclusionStatus;
  /** Alias of status (legacy field name) */
  level: CaptureExclusionStatus;
  /** User-facing label: Supported / Unsupported / Not Verified / Not Guaranteed */
  label: string;
  reason: string;
  /** Always false while product disables setContentProtection */
  exclusionEnabled: boolean;
  /** Disclaimer must be shown before any exclusion claim */
  disclaimerRequired: true;
  disclaimer: string;
  /** Specific capture methods that ARE defeated at this tier (empty when disabled) */
  defeats: string[];
  /** Methods that are NOT defeated */
  misses: string[];
}

/** Electron preload API shape — exposed via contextBridge in preload.ts */
interface ElectronAPI {
  setContentProtection: (enabled: boolean) => Promise<void>;
  isElectron:           true;
}

declare global {
  interface Window {
    electronAPI?: ElectronAPI;
  }
}

/* ─── ENVIRONMENT DETECTION ─────────────────────────────────────────────── */

export function isElectron(): boolean {
  return isElectronApp();
}

/**
 * Returns true if running in a Chromium-based browser (Chrome, Edge, Opera,
 * Brave) where prototype-level getDisplayMedia interception is reliable.
 * Does NOT return true for Electron (which is also Chromium-based) because
 * Electron should use setContentProtection instead.
 */
export function isChromiumBrowser(): boolean {
  if (typeof navigator === "undefined") return false;
  if (isElectron()) return false;

  // Prefer userAgentData (accurate, no UA spoofing)
  const brands = (navigator as Navigator & {
    userAgentData?: { brands: Array<{ brand: string }> };
  }).userAgentData?.brands;

  if (brands) {
    return brands.some(
      (b) =>
        b.brand === "Chromium" ||
        b.brand === "Google Chrome" ||
        b.brand === "Microsoft Edge",
    );
  }

  // Fallback: UA string heuristic
  const ua = navigator.userAgent;
  return (
    /Chrome\/\d/.test(ua) &&
    !/Edg\/\d/.test(ua) === false || // Edge is fine too
    /Edg\/\d/.test(ua)
  ) && !/Firefox\/\d/.test(ua) && !/Safari\/\d/.test(ua.replace(/Chrome\/\d[^S]+/, ""));
}

/**
 * Honest capture-exclusion status for the current environment.
 * Product policy: enableContentProtection() always returns false — never claim Supported.
 */
export function getCaptureExclusionStatus(): CaptureExclusionStatus {
  if (!isElectron()) return "unsupported";
  const api = typeof window !== "undefined" ? window.electronAPI : undefined;
  // API may exist on desktop, but Career Pilot does not enable or certify exclusion.
  if (typeof api?.setContentProtection === "function") {
    return contentProtectionEnabled ? "not_verified" : "not_guaranteed";
  }
  return "unsupported";
}

/** Returns honest capture-exclusion support info for the current environment. */
export function getSupportInfo(): SupportInfo {
  const status = getCaptureExclusionStatus();
  const base = {
    status,
    level: status,
    label: CAPTURE_EXCLUSION_STATUS_LABEL[status],
    exclusionEnabled: contentProtectionEnabled,
    disclaimerRequired: true as const,
    disclaimer: CAPTURE_EXCLUSION_DISCLAIMER,
    defeats: [] as string[],
  };

  if (status === "unsupported") {
    return {
      ...base,
      reason:
        "Capture exclusion is not available in the browser. The overlay stays visible on screen share and recordings.",
      misses: ["All capture tools"],
    };
  }

  if (status === "not_verified") {
    return {
      ...base,
      reason:
        "Desktop content-protection API is present but exclusion has not been verified for your share setup.",
      misses: [
        "Zoom / Meet / Teams native capture",
        "OBS",
        "OS screenshots",
        "Entire-desktop share",
      ],
    };
  }

  // not_guaranteed (default for Electron while product keeps protection off)
  return {
    ...base,
    reason:
      "Career Pilot does not enable OS content protection. Overlay visibility on screen share is Not Guaranteed.",
    misses: [
      "Zoom / Meet / Teams native capture",
      "OBS",
      "OS screenshots",
      "Entire-desktop share",
      "Physical camera pointed at screen",
    ],
  };
}

/* ─── TIER 1: ELECTRON CONTENT PROTECTION ───────────────────────────────── */

let contentProtectionEnabled = false;

/**
 * Calls Electron's setContentProtection(true) via the preload-exposed API.
 * The main process must expose this in preload.ts:
 *
 *   contextBridge.exposeInMainWorld("electronAPI", {
 *     isElectron: true,
 *     setContentProtection: (enabled: boolean) =>
 *       ipcRenderer.invoke("set-content-protection", enabled),
 *   });
 *
 * And in main.ts:
 *
 *   ipcMain.handle("set-content-protection", (_, enabled: boolean) => {
 *     mainWindow.setContentProtection(enabled);
 *   });
 */
export async function enableContentProtection(): Promise<boolean> {
  // Capture exclusion is intentionally not offered. Overlay stays visible on screen share.
  // Callers must treat false as Unsupported / Not Guaranteed — never claim Supported.
  contentProtectionEnabled = false;
  return false;
}

export async function disableContentProtection(): Promise<void> {
  if (!isElectron() || !contentProtectionEnabled) return;
  try {
    await window.electronAPI!.setContentProtection(false);
    contentProtectionEnabled = false;
  } catch (err) {
    console.error("[screenCaptureEvasion] setContentProtection(false) failed:", err);
  }
}

/* ─── TIER 2: GETDISPLAYMEDIA INTERCEPTION ──────────────────────────────── */

type CaptureNotifyFn = (active: boolean) => void;
const captureListeners = new Set<CaptureNotifyFn>();

export function onCaptureStateChange(fn: CaptureNotifyFn): () => void {
  captureListeners.add(fn);
  return () => captureListeners.delete(fn);
}

function notifyCaptureListeners(active: boolean) {
  captureListeners.forEach((fn) => fn(active));
}

let displayMediaPatched = false;

/**
 * Intercepts navigator.mediaDevices.getDisplayMedia at the prototype level.
 * Must be called as early as possible (before any screen sharing attempt).
 *
 * When sharing starts: sets data-capture-active="true" on document.body
 * so CSS can hide overlay elements:
 *   [data-capture-active="true"] .overlay-panel { visibility: hidden; }
 *
 * When sharing ends: removes the attribute and resets state.
 *
 * Only effective in Chromium. In Firefox/Safari this function is a no-op
 * (the prototype modification either throws or has no effect).
 */
export function patchGetDisplayMedia(): boolean {
  if (typeof window === "undefined") return false;
  if (displayMediaPatched) return true;
  if (!navigator.mediaDevices?.getDisplayMedia) return false;

  // Firefox rejects prototype modifications on MediaDevices — detect and bail
  const isFirefox = /Firefox\/\d/.test(navigator.userAgent);
  if (isFirefox) return false;

  try {
    const proto    = Object.getPrototypeOf(navigator.mediaDevices);
    const original = proto.getDisplayMedia as (
      opts?: DisplayMediaStreamOptions,
    ) => Promise<MediaStream>;

    Object.defineProperty(proto, "getDisplayMedia", {
      configurable: true,
      writable:     true,
      value: async function (
        this: MediaDevices,
        opts?: DisplayMediaStreamOptions,
      ): Promise<MediaStream> {
        const stream = await original.call(this, opts);

        // Mark capture as active
        document.body.dataset[CAPTURE_ATTR] = "true";
        notifyCaptureListeners(true);

        // Clean up when all tracks end
        const tracks = stream.getTracks();
        let   ended  = 0;
        tracks.forEach((track) => {
          track.addEventListener(
            "ended",
            () => {
              ended++;
              if (ended >= tracks.length) {
                delete document.body.dataset[CAPTURE_ATTR];
                notifyCaptureListeners(false);
              }
            },
            { once: true },
          );
        });

        return stream;
      },
    });

    displayMediaPatched = true;
    return true;
  } catch (err) {
    console.warn("[screenCaptureEvasion] getDisplayMedia patch failed:", err);
    return false;
  }
}

/* ─── STEALTH ATTRIBUTE HELPERS ─────────────────────────────────────────── */

export function applyStealthToElement(el: HTMLElement): void {
  el.dataset[STEALTH_ATTR] = "true";
}

export function removeStealthFromElement(el: HTMLElement): void {
  delete el.dataset[STEALTH_ATTR];
}

export function isStealthActive(el: HTMLElement): boolean {
  return el.dataset[STEALTH_ATTR] === "true";
}

export function toggleStealthOnElement(el: HTMLElement): boolean {
  if (isStealthActive(el)) {
    removeStealthFromElement(el);
    return false;
  }
  applyStealthToElement(el);
  return true;
}
