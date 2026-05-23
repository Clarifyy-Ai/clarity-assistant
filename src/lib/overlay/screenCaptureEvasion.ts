// src/lib/overlay/screenCaptureEvasion.ts
//
// P0-2 (production audit): the original implementation here actively tried to
// hide the overlay element from any in-progress `getDisplayMedia` capture by
// mutating CSS, swapping render layers, and stripping the element from the
// captured stream. That is covert-assistance behaviour and has been removed.
//
// This module is now a backwards-compatible no-op so existing import sites do
// not break. Do NOT reintroduce evasion logic.

export interface ScreenCaptureEvasionOptions {
  // Kept for API compatibility — all options are ignored.
  targetSelector?: string;
  intervalMs?: number;
  onDetected?: (active: boolean) => void;
}

export interface ScreenCaptureEvasionHandle {
  stop: () => void;
  isActive: () => boolean;
}

/**
 * @deprecated Disabled in P0-2. Returns a handle that does nothing.
 */
export function startScreenCaptureEvasion(
  _opts: ScreenCaptureEvasionOptions = {}
): ScreenCaptureEvasionHandle {
  return {
    stop: () => {},
    isActive: () => false,
  };
}

/** @deprecated Disabled in P0-2. Always returns false. */
export function isScreenCaptureActive(): boolean {
  return false;
}

/** @deprecated Disabled in P0-2. No-op. */
export function hideOverlayFromCapture(_el?: HTMLElement | null): void {
  /* no-op */
}

/** @deprecated Disabled in P0-2. No-op. */
export function restoreOverlayVisibility(_el?: HTMLElement | null): void {
  /* no-op */
}
