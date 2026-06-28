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
   * OS capture exclusion is not enabled in this build (compliance).
   * Callers may still invoke this; it always returns false.
   */
  async setScreenCaptureExcluded(_enabled: boolean): Promise<boolean> {
    return false;
  }

  async hideOverlayWindow(): Promise<void> {
    getElectronAPI()?.hide?.();
  }

  async autoHideOnFocusLoss(): Promise<void> {
    getElectronAPI()?.hide?.();
  }
}

export const stealthBridge = new ElectronStealthBridge();
