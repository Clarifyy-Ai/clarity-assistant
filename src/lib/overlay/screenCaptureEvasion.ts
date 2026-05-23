// src/lib/overlay/screenCaptureEvasion.ts
//
// P0-2 (production audit): the original implementation actively hid the
// overlay from active screen-captures via CSS/DOM patches, monkey-patched
// `getDisplayMedia`, applied Electron `setContentProtection`, and toggled
// stealth attributes on render nodes. That is covert-assistance behaviour
// and has been removed.
//
// This module is now a backwards-compatible no-op so existing import sites
// keep compiling. Do NOT reintroduce evasion logic — any future changes here
// must remain functionally inert.

export type SupportLevel = "none" | "partial" | "full";

export const STEALTH_ATTR = "data-stealth";

export interface ScreenCaptureSupportInfo {
  level: SupportLevel;
  electron: boolean;
  hasContentProtection: boolean;
  hasGetDisplayMedia: boolean;
  notes: string[];
  reason: string;
  misses: string[];
}

export interface ScreenCaptureEvasionOptions {
  targetSelector?: string;
  intervalMs?: number;
  onDetected?: (active: boolean) => void;
}

export interface ScreenCaptureEvasionHandle {
  stop: () => void;
  isActive: () => boolean;
}

export function isElectron(): boolean {
  return false;
}

export function getSupportInfo(): ScreenCaptureSupportInfo {
  return {
    level: "none",
    electron: false,
    hasContentProtection: false,
    hasGetDisplayMedia:
      typeof navigator !== "undefined" &&
      !!navigator.mediaDevices?.getDisplayMedia,
    notes: ["Screen-capture evasion disabled by policy (P0-2)."],
  };
}

/** @deprecated No-op since P0-2. */
export function patchGetDisplayMedia(): void {}

/** @deprecated No-op since P0-2. */
export function enableContentProtection(_enabled = true): Promise<boolean> {
  return Promise.resolve(false);
}

/** @deprecated No-op since P0-2. Always reports inactive. */
export function onCaptureStateChange(
  _cb: (active: boolean) => void
): () => void {
  return () => {};
}

/** @deprecated No-op since P0-2. */
export function applyStealthToElement(_el?: HTMLElement | null): void {}

/** @deprecated No-op since P0-2. */
export function removeStealthFromElement(_el?: HTMLElement | null): void {}

/** @deprecated No-op since P0-2. */
export function toggleStealthOnElement(
  _el?: HTMLElement | null,
  _on?: boolean
): boolean {
  return false;
}

/** @deprecated Always returns false since P0-2. */
export function isStealthActive(_el?: HTMLElement | null): boolean {
  return false;
}

/** @deprecated Always returns false since P0-2. */
export function isScreenCaptureActive(): boolean {
  return false;
}

/** @deprecated No-op since P0-2. */
export function hideOverlayFromCapture(_el?: HTMLElement | null): void {}

/** @deprecated No-op since P0-2. */
export function restoreOverlayVisibility(_el?: HTMLElement | null): void {}

/** @deprecated No-op since P0-2; returns an inert handle. */
export function startScreenCaptureEvasion(
  _opts: ScreenCaptureEvasionOptions = {}
): ScreenCaptureEvasionHandle {
  return { stop: () => {}, isActive: () => false };
}
