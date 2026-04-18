// electron/main.cjs
const { app, BrowserWindow, ipcMain, Tray, Menu, nativeImage } = require("electron");
const path = require("path");

const isDev = process.env.NODE_ENV === "development";

let overlayWindow = null;
let tray          = null;

// ── Create the overlay window ─────────────────────────────────────

function createOverlay() {
  overlayWindow = new BrowserWindow({
    width:           440,
    height:          680,
    minWidth:        320,
    minHeight:       400,
    transparent:     true,
    frame:           false,
    alwaysOnTop:     true,
    skipTaskbar:     true,
    hasShadow:       false,
    resizable:       true,
    // ★ "panel" on macOS = excluded from screen capture
    type:            process.platform === "darwin" ? "panel" : "toolbar",
    webPreferences: {
      preload:          path.join(__dirname, "preload.cjs"),
      nodeIntegration:  false,
      contextIsolation: true,
      // ★ Sandbox enabled: Chromium's renderer sandbox prevents OS-level escape
      //   if the renderer is ever compromised (XSS / V8 RCE). Safe with
      //   contextIsolation: true — IPC bridge in preload.cjs continues to work.
      sandbox:          true,
    },
  });

  // ★ Screen share protection — MUST be before show()
  overlayWindow.setContentProtection(true);

  // ★ Visible on all desktops/fullscreen apps
  overlayWindow.setVisibleOnAllWorkspaces(true, {
    visibleOnFullScreen: true,
  });

  // Load app
  if (isDev) {
    overlayWindow.loadURL("http://localhost:5173");
    // overlayWindow.webContents.openDevTools({ mode: "detach" });
  } else {
    overlayWindow.loadFile(path.join(__dirname, "../dist/index.html"));
  }

  overlayWindow.once("ready-to-show", () => {
    overlayWindow.show();
  });

  // ★ Hide instead of close — keeps app alive
  overlayWindow.on("close", (e) => {
    if (!app.isQuitting) {
      e.preventDefault();
      overlayWindow.hide();
    }
  });
}

// ── System tray ───────────────────────────────────────────────────

function createTray() {
  // Use a 16x16 blank image if no icon yet
  const icon = nativeImage.createEmpty();
  tray = new Tray(icon);

  const menu = Menu.buildFromTemplate([
    {
      label: "Show ClarifyAI",
      click: () => {
        overlayWindow.show();
        overlayWindow.focus();
      },
    },
    {
      label: "Hide",
      click: () => overlayWindow.hide(),
    },
    { type: "separator" },
    {
      label: "Quit",
      click: () => {
        app.isQuitting = true;
        app.quit();
      },
    },
  ]);

  tray.setToolTip("ClarifyAI");
  tray.setContextMenu(menu);

  tray.on("click", () => {
    overlayWindow.isVisible() ? overlayWindow.hide() : overlayWindow.show();
  });
}

// ── App lifecycle ─────────────────────────────────────────────────

app.whenReady().then(() => {
  createOverlay();
  createTray();
});

// ★ Never quit automatically
app.on("window-all-closed", (e) => {
  e.preventDefault();
});

app.on("before-quit", () => {
  app.isQuitting = true;
});

// ── IPC handlers ──────────────────────────────────────────────────

ipcMain.on("hide-overlay", () => {
  overlayWindow?.hide();
});

ipcMain.on("show-overlay", () => {
  overlayWindow?.show();
  overlayWindow?.focus();
});

ipcMain.on("quit-app", () => {
  app.isQuitting = true;
  app.quit();
});

ipcMain.on("set-always-on-top", (_, value) => {
  overlayWindow?.setAlwaysOnTop(value, "screen-saver");
});

ipcMain.on("resize-overlay", (_, { width, height }) => {
  overlayWindow?.setSize(width, height, true);
});
