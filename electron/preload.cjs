// electron/preload.cjs
// Minimal bridge exposed to the renderer.
const { contextBridge, ipcRenderer } = require("electron");

const desktopBridge = {
  platform: process.platform,
  versions: {
    electron: process.versions.electron,
    chrome: process.versions.chrome,
    node: process.versions.node,
  },
  isDesktop: true,
  isElectron: true,
  openExternal: (targetUrl) => ipcRenderer.invoke("shell:openExternal", targetUrl),
  setContentProtection: (enabled) => ipcRenderer.invoke("set-content-protection", enabled),
  // Overlay window management (names match ElectronWindowAPI interface)
  setAlwaysOnTop: (flag, level) => ipcRenderer.invoke("overlay:set-always-on-top", flag, level ?? "floating"),
  resize: (width, height) => ipcRenderer.invoke("overlay:resize", width, height),
  showInactive: () => ipcRenderer.invoke("overlay:show-inactive"),
  hide: () => ipcRenderer.invoke("overlay:hide"),
  syncGlobalShortcuts: (bindings) =>
    ipcRenderer.invoke("overlay:sync-global-shortcuts", bindings),
  onGlobalShortcut: (callback) => {
    const handler = (_event, action) => callback(action);
    ipcRenderer.on("global-shortcut", handler);
    return () => ipcRenderer.removeListener("global-shortcut", handler);
  },
  removeGlobalShortcutListener: () => {
    ipcRenderer.removeAllListeners("global-shortcut");
  },
  onHotkeyConflict: (callback) => {
    const handler = (_event, info) => callback(info);
    ipcRenderer.on("hotkey-conflict", handler);
    return () => ipcRenderer.removeListener("hotkey-conflict", handler);
  },
  removeHotkeyConflictListener: () => {
    ipcRenderer.removeAllListeners("hotkey-conflict");
  },
  // Update events
  onUpdateAvailable: (callback) => ipcRenderer.on("update-available", callback),
  onUpdateDownloaded: (callback) => ipcRenderer.on("update-downloaded", callback),
};

contextBridge.exposeInMainWorld("desktop", desktopBridge);
contextBridge.exposeInMainWorld("electronAPI", desktopBridge);
