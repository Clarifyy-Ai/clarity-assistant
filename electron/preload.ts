// electron/preload.ts

import { contextBridge, ipcRenderer } from "electron";

// Optional: type-safe channel names
const STEALTH_CHANNELS = {
  setScreenCaptureExcluded: "stealth:setScreenCaptureExcluded",
  hideOverlayWindow: "stealth:hideOverlayWindow",
  autoHideOnFocusLoss: "stealth:autoHideOnFocusLoss",
} as const;

type StealthChannelKey = keyof typeof STEALTH_CHANNELS;

/**
 * Stealth API exposed to the renderer as window.electronStealth
 * (used by src/lib/stealth/electronBridge.ts).
 */
const electronStealth = {
  /**
   * Enable / disable OS-level screen capture exclusion.
   * Main process must handle this IPC and call:
   *   - Windows: SetWindowDisplayAffinity(WDA_EXCLUDEFROMCAPTURE)
   *   - macOS:   setWindowLevel(NSWindowLevel / kCGShieldingWindowLevelKey)
   */
  setScreenCaptureExcluded(enabled: boolean): Promise<boolean> {
    return ipcRenderer.invoke(
      STEALTH_CHANNELS.setScreenCaptureExcluded,
      enabled,
    );
  },

  /**
   * Hide/minimize the overlay window immediately (panic button).
   */
  hideOverlayWindow(): Promise<void> {
    return ipcRenderer.invoke(STEALTH_CHANNELS.hideOverlayWindow);
  },

  /**
   * Called from renderer when the browser window loses focus,
   * so the desktop overlay can auto-hide per manual spec.
   */
  autoHideOnFocusLoss(): Promise<void> {
    return ipcRenderer.invoke(STEALTH_CHANNELS.autoHideOnFocusLoss);
  },
} as const;

// You can expose other existing APIs here too (if you already have them):
// contextBridge.exposeInMainWorld("electronAPI", { ... });

contextBridge.exposeInMainWorld("electronStealth", electronStealth);

// Optional: debug helper in dev builds
if (process.env.NODE_ENV === "development") {
  console.log("[preload] electronStealth API exposed");
}
