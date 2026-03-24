import { app, BrowserWindow, ipcMain } from "electron";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const isDev = process.env.NODE_ENV === "development";

let overlayWindow = null;

function createOverlay() {
  overlayWindow = new BrowserWindow({
    width:           420,
    height:          600,
    transparent:     true,
    frame:           false,
    alwaysOnTop:     true,
    skipTaskbar:     true,
    hasShadow:       false,
    resizable:       true,
    type:            "panel",        // ← macOS: won't show in screen share
    webPreferences: {
      preload:        path.join(__dirname, "preload.js"),
      nodeIntegration: false,
      contextIsolation: true,
    },
  });

  // ★ Screen share protection — must be BEFORE show()
  overlayWindow.setContentProtection(true);
  overlayWindow.setVisibleOnAllWorkspaces(true, {
    visibleOnFullScreen: true,
  });

  // Load your React app
  if (isDev) {
    overlayWindow.loadURL("http://localhost:5173");
  } else {
    overlayWindow.loadFile(path.join(__dirname, "../dist/index.html"));
  }

  overlayWindow.show();

  // ★ Don't let overlay close kill the app
  overlayWindow.on("close", (e) => {
    e.preventDefault();
    overlayWindow.hide();
  });
}

app.whenReady().then(() => {
  createOverlay();
});

// ★ Never quit when windows close
app.on("window-all-closed", (e) => {
  e.preventDefault();
});

// IPC — toggle visibility from React
ipcMain.on("toggle-overlay", () => {
  if (overlayWindow.isVisible()) {
    overlayWindow.hide();
  } else {
    overlayWindow.show();
  }
});

ipcMain.on("quit-app", () => {
  overlayWindow.destroy();
  app.quit();
});
