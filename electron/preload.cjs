// electron/preload.cjs
const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("electronAPI", {
  show:   ()     => ipcRenderer.send("show-overlay"),
  quit:   ()     => ipcRenderer.send("quit-app"),
  resize: (w, h) => ipcRenderer.send("resize-overlay", { width: w, height: h }),

  // Offline / Private mode
  setOfflineMode: (enabled) => ipcRenderer.send("set-offline-mode", enabled),
  isOffline: () => ipcRenderer.sendSync("get-offline-mode"),

  onGlobalShortcut: (callback) => {
    ipcRenderer.on("global-shortcut", (_, action) => callback(action));
  },
  removeGlobalShortcutListener: () => {
    ipcRenderer.removeAllListeners("global-shortcut");
  },

  // Update & conflict notifications
  onAppUpdate: (callback) => {
    ipcRenderer.on("app-update", (_, info) => callback(info));
  },
  onHotkeyConflict: (callback) => {
    ipcRenderer.on("hotkey-conflict", (_, info) => callback(info));
  },
  removeHotkeyConflictListener: () => {
    ipcRenderer.removeAllListeners("hotkey-conflict");
  },
  onOfflineModeChanged: (callback) => {
    ipcRenderer.on("offline-mode-changed", (_, enabled) => callback(enabled));
  },

  platform: process.platform,
  isElectron: true,
});
