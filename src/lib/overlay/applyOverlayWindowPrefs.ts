/**
 * Apply persisted overlay window preferences to Electron / in-page geometry.
 */
import {
  resizeDesktopOverlayWindow,
  setDesktopAlwaysOnTop,
} from "@/lib/platform/electronWindowManager";
import { isElectronApp } from "@/lib/platform/isElectron";
import type { OverlayLayoutMode } from "@/store/overlayStore";
import type { OverlayPosition } from "@/store/overlayStore";

export function applyAlwaysOnTopPreference(enabled: boolean): void {
  setDesktopAlwaysOnTop(Boolean(enabled));
}

export async function applyPresentationSafePreference(
  enabled: boolean,
): Promise<void> {
  if (!isElectronApp()) return;
  const api = (window as Window & {
    electronAPI?: { setContentProtection?: (v: boolean) => Promise<void> };
  }).electronAPI;
  await api?.setContentProtection?.(Boolean(enabled));
}

/** Layout → recommended size (Electron shell or in-page panel). */
export function layoutModeDimensions(
  mode: OverlayLayoutMode,
): { width: number; height: number } {
  switch (mode) {
    case "compact":
      return { width: 360, height: 220 };
    case "docked":
      return { width: 400, height: 640 };
    case "sidebar":
      return { width: 380, height: Math.min(900, typeof window !== "undefined" ? window.innerHeight - 24 : 800) };
    case "floating":
    default:
      return { width: 420, height: 520 };
  }
}

export function layoutModePosition(
  mode: OverlayLayoutMode,
  current: OverlayPosition,
): OverlayPosition {
  if (typeof window === "undefined") return current;
  const dims = layoutModeDimensions(mode);
  if (mode === "docked" || mode === "sidebar") {
    return {
      x: Math.max(8, window.innerWidth - dims.width - 12),
      y: mode === "sidebar" ? 8 : Math.max(8, Math.round((window.innerHeight - dims.height) / 2)),
    };
  }
  if (mode === "compact") {
    return {
      x: Math.max(8, window.innerWidth - dims.width - 16),
      y: 16,
    };
  }
  return current;
}

export function applyLayoutModeToDesktop(mode: OverlayLayoutMode): void {
  const { width, height } = layoutModeDimensions(mode);
  resizeDesktopOverlayWindow(width, height);
}
