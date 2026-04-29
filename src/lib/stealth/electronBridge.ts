// src/lib/stealth/electronBridge.ts

import { isElectron } from "../overlay/screenCaptureEvasion";

export interface ElectronStealthAPI {
  /**
   * Enable / disable OS-level screen capture exclusion.
   * - Windows: SetWindowDisplayAffinity(WDA_EXCLUDEFROMCAPTURE)
   * - macOS:   NSWindowLevel / CGShieldingWindowLevel / kCGMaximumWindowLevelKey
   */
  setScreenCaptureExcluded(enabled: boolean): Promise<boolean>;

  /**
   * Hide/minimize the overlay window immediately (used by Panic Button).
   */
  hideOverlayWindow(): Promise<void>;

  /**
   * Called when browser window loses focus so the desktop overlay
   * can auto-hide/minimize per manual spec.
   */
  autoHideOnFocusLoss(): Promise<void>;
}

/**
 * Safe facade around window.electronStealth injected by preload.ts.
 * In browser (non-Electron) we fall back to no-ops.
 */
class ElectronStealthBridge implements ElectronStealthAPI {
  private get api(): ElectronStealthAPI | null {
    if (!isElectron()) return null;
    const anyWindow = window as any;
    const api = anyWindow.electronStealth as ElectronStealthAPI | undefined;
    if (!api) {
      console.warn(
        "[stealth] window.electronStealth not found; " +
          "ensure preload.ts is exposing the API."
      );
    }
    return api ?? null;
  }

  async setScreenCaptureExcluded(enabled: boolean): Promise<boolean> {
    const api = this.api;
    if (!api) return false;
    try {
      return await api.setScreenCaptureExcluded(enabled);
    } catch (err) {
      console.error("[stealth] setScreenCaptureExcluded failed:", err);
      return false;
    }
  }

  async hideOverlayWindow(): Promise<void> {
    const api = this.api;
    if (!api) return;
    try {
      await api.hideOverlayWindow();
    } catch (err) {
      console.error("[stealth] hideOverlayWindow failed:", err);
    }
  }

  async autoHideOnFocusLoss(): Promise<void> {
    const api = this.api;
    if (!api) return;
    try {
      await api.autoHideOnFocusLoss();
    } catch (err) {
      console.error("[stealth] autoHideOnFocusLoss failed:", err);
    }
  }
}

export const stealthBridge = new ElectronStealthBridge();
