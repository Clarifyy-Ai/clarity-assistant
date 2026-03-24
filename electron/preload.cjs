// electron/preload.cjs
const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("electronAPI", {
  // Window controls
  hide:          ()      => ipcRenderer.send("hide-overlay"),
  show:          ()      => ipcRenderer.send("show-overlay"),
  quit:          ()      => ipcRenderer.send("quit-app"),
  setAlwaysOnTop:(value) => ipcRenderer.send("set-always-on-top", value),
  resize:        (w, h)  => ipcRenderer.send("resize-overlay", { width: w, height: h }),

  // Platform info
  platform: process.platform,
  isElectron: true,
});
