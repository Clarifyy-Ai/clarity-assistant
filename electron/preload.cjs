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
  onUpdateAvailable: (callback) => ipcRenderer.on("update-available", callback),
  onUpdateDownloaded: (callback) => ipcRenderer.on("update-downloaded", callback),
};

contextBridge.exposeInMainWorld("desktop", desktopBridge);
contextBridge.exposeInMainWorld("electronAPI", desktopBridge);
