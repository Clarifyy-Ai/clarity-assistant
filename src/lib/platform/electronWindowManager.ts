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
 * Always-on-top and screen-capture exclusion are OPT-IN.
 * Defaults favor transparency: visible on share, not pinned above other apps.
 */
export async function initDesktopOverlayWindow(opts?: {
  alwaysOnTop?: boolean;
}): Promise<void> {
  const api = getApi();
  if (!api) return;

  api.setAlwaysOnTop?.(Boolean(opts?.alwaysOnTop), "floating");
  api.setFocusable?.(true);
  api.showInactive?.();
  api.resize?.(480, 640);

  await enableScreenCaptureBlocker({
    excludeFromCapture: false,
    enableOpacityAutoFade: false,
    enableAutoHideOnFocusLoss: false,
  });
}

/** User-controlled always-on-top (never forced on by default). */
export function setDesktopAlwaysOnTop(enabled: boolean): void {
  getApi()?.setAlwaysOnTop?.(Boolean(enabled), "floating");
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
