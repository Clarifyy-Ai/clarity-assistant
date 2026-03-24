import { contextBridge, ipcRenderer } from "electron";

contextBridge.exposeInMainWorld("electronAPI", {
  toggleOverlay: () => ipcRenderer.send("toggle-overlay"),
  quitApp:       () => ipcRenderer.send("quit-app"),
  platform:      process.platform,
});
