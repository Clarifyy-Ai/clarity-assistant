// src/lib/stealth/electronBridge.ts
// Desktop window facade — uses electronAPI from preload.cjs (not capture exclusion).

import { isElectron } from "../overlay/screenCaptureEvasion";
import type { ElectronWindowAPI } from "@/lib/platform/electronWindowManager";

export interface ElectronStealthAPI {
  setScreenCaptureExcluded(enabled: boolean): Promise<boolean>;
  hideOverlayWindow(): Promise<void>;
  autoHideOnFocusLoss(): Promise<void>;
}

function getElectronAPI(): ElectronWindowAPI | null {
  if (!isElectron()) return null;
  return (window as Window & { electronAPI?: ElectronWindowAPI }).electronAPI ?? null;
}

class ElectronStealthBridge implements ElectronStealthAPI {
  /**
   * Exclude the overlay window from OS screen capture.
   * Uses Electron setContentProtection (Windows DWM / macOS CGWindowLevel).
   * This makes the window invisible to screen recorders, OBS, Zoom, Meet, etc.
   * — identical to how Parakeet AI works.
   */
  async setScreenCaptureExcluded(enabled: boolean): Promise<boolean> {
    const api = getElectronAPI();
    if (!api) return false;
    try {
      // setContentProtection is exposed via preload.cjs → IPC → main.cjs
      await (api as any).setContentProtection?.(enabled);
      return true;
    } catch (err) {
      console.error("[stealth] setContentProtection failed:", err);
      return false;
    }
  }

  async hideOverlayWindow(): Promise<void> {
    getElectronAPI()?.hide?.();
  }

  async autoHideOnFocusLoss(): Promise<void> {
    getElectronAPI()?.hide?.();
  }
}

export const stealthBridge = new ElectronStealthBridge();
