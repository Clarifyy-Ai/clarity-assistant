// pseudo-code – this is what we’ll add when we modify preload:
contextBridge.exposeInMainWorld("electronStealth", {
  setScreenCaptureExcluded: (enabled: boolean) =>
    ipcRenderer.invoke("stealth:setScreenCaptureExcluded", enabled),
  hideOverlayWindow: () => ipcRenderer.invoke("stealth:hideOverlayWindow"),
  autoHideOnFocusLoss: () => ipcRenderer.invoke("stealth:autoHideOnFocusLoss"),
});
