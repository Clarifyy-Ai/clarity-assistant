import { isElectronApp } from "@/lib/platform/isElectron";
import {
  enableScreenCaptureBlocker,
  disableScreenCaptureBlocker,
} from "@/lib/stealth/screenCaptureBlocker";

export type DesktopOverlayLevel = "floating" | "normal";

export interface ElectronWindowAPI {
  isElectron?: boolean;
  platform?: string;
  show?: () => void;
  showInactive?: () => void;
  hide?: () => void;
  quit?: () => void;
  resize?: (width: number, height: number) => void;
  setAlwaysOnTop?: (enabled: boolean, level?: DesktopOverlayLevel) => void;
  setFocusable?: (focusable: boolean) => void;
  onGlobalShortcut?: (callback: (action: string) => void) => void;
  removeGlobalShortcutListener?: () => void;
}

function getApi(): ElectronWindowAPI | undefined {
  if (!isElectronApp()) return undefined;
  return (window as Window & { electronAPI?: ElectronWindowAPI }).electronAPI;
}

/**
 * Apply desktop overlay window profile.
 * Enables Parakeet-style screen capture exclusion:
 * the overlay window is invisible to Zoom, Meet, Teams, OBS, etc.
 * Uses Electron setContentProtection (Windows DWM / macOS CGWindowLevel).
 */
export async function initDesktopOverlayWindow(): Promise<void> {
  const api = getApi();
  if (!api) return;

  api.setAlwaysOnTop?.(true, "floating");
  api.setFocusable?.(true);
  api.showInactive?.();

  await enableScreenCaptureBlocker({
    excludeFromCapture: true,   // Hide from screen recorders (Parakeet-style)
    enableOpacityAutoFade: true,
    enableAutoHideOnFocusLoss: false, // Don't auto-hide; user controls via hotkeys
  });
}

export async function teardownDesktopOverlayWindow(): Promise<void> {
  await disableScreenCaptureBlocker();
}

export function hideDesktopOverlayWindow(): void {
  getApi()?.hide?.();
}

export function showDesktopOverlayWindow(focus = false): void {
  const api = getApi();
  if (!api) return;
  if (focus) api.show?.();
  else api.showInactive?.();
}

export function resizeDesktopOverlayWindow(width: number, height: number): void {
  getApi()?.resize?.(width, height);
}
