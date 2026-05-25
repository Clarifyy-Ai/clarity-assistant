// src/lib/stealth/electronBridge.ts
// P0-2: OS capture exclusion and panic-hide IPC are disabled for compliance.

export interface ElectronStealthAPI {
  setScreenCaptureExcluded(enabled: boolean): Promise<boolean>;
  hideOverlayWindow(): Promise<void>;
  autoHideOnFocusLoss(): Promise<void>;
}

class ElectronStealthBridge implements ElectronStealthAPI {
  async setScreenCaptureExcluded(_enabled: boolean): Promise<boolean> {
    return false;
  }

  async hideOverlayWindow(): Promise<void> {}

  async autoHideOnFocusLoss(): Promise<void> {}
}

export const stealthBridge = new ElectronStealthBridge();
