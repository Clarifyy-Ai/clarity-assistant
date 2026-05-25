// electron/preload.ts
// P0-2: Stealth IPC (capture exclusion, panic hide) is not exposed — compliance.

import { contextBridge } from "electron";

/** Inert API so renderer imports do not break; all methods are no-ops. */
const electronStealth = {
  setScreenCaptureExcluded(_enabled: boolean): Promise<boolean> {
    return Promise.resolve(false);
  },
  hideOverlayWindow(): Promise<void> {
    return Promise.resolve();
  },
  autoHideOnFocusLoss(): Promise<void> {
    return Promise.resolve();
  },
} as const;

contextBridge.exposeInMainWorld("electronStealth", electronStealth);

if (process.env.NODE_ENV === "development") {
  console.log("[preload] electronStealth API exposed (capture evasion disabled)");
}
