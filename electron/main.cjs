// electron/main.cjs
const { app, BrowserWindow, ipcMain, Tray, Menu, nativeImage, session, globalShortcut } = require("electron");
const path = require("path");

// ── Strict Content Security Policy for the renderer ───────────────
// Defends against XSS in markdown renderers and prevents the app from
// loading scripts/styles from unexpected origins. Connect-src whitelist
// covers Supabase (REST + Realtime WSS), Deepgram WSS, and Stripe checkout.
const CSP_DIRECTIVES = [
  "default-src 'self'",
  "script-src 'self'",
  "style-src 'self' 'unsafe-inline'", // shadcn/Tailwind requires inline styles
  "img-src 'self' data: blob: https:",
  "font-src 'self' data:",
  "connect-src 'self' https://*.supabase.co wss://*.supabase.co " +
    "https://api.deepgram.com wss://api.deepgram.com " +
    "https://api.stripe.com https://checkout.stripe.com",
  "frame-src https://checkout.stripe.com",
  "media-src 'self' blob:",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
].join("; ");

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
    // Per production audit (P0-2): overlay must behave as a normal floating
    // window. Do NOT hide it from screen capture, taskbar, or OS UI.
    skipTaskbar:     false,
    hasShadow:       true,
    resizable:       true,
    webPreferences: {
      preload:          path.join(__dirname, "preload.cjs"),
      nodeIntegration:  false,
      contextIsolation: true,
      sandbox:          true,
    },
  });

  // NOTE: setContentProtection(true) and "panel"/"toolbar" window types were
  // removed in P0-2 — they hid the overlay from screen sharing / recording,
  // which enabled covert interview assistance. Overlay must be visible in
  // any Zoom / Meet / Teams "share screen" so candidates cannot conceal it.

  // Visible on all desktops/fullscreen apps — legitimate UX, not stealth.
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
  // Inject strict CSP header into every renderer response.
  // Must run before createOverlay() so the first page load is covered.
  session.defaultSession.webRequest.onHeadersReceived((details, callback) => {
    callback({
      responseHeaders: {
        ...details.responseHeaders,
        "Content-Security-Policy": [CSP_DIRECTIVES],
      },
    });
  });

  createOverlay();
  createTray();
  registerGlobalShortcuts();
});

// ── Global shortcuts (system-wide, work even when app is not focused) ──
function registerGlobalShortcuts() {
  // Toggle overlay visibility — primary stealth hotkey
  globalShortcut.register("CommandOrControl+Shift+H", () => {
    if (!overlayWindow) return;
    if (overlayWindow.isVisible()) overlayWindow.hide();
    else { overlayWindow.show(); overlayWindow.focus(); }
  });
  // Panic — instantly hide overlay
  globalShortcut.register("CommandOrControl+Shift+P", () => {
    overlayWindow?.hide();
  });
  // Forward Ctrl+Shift+A to renderer (request AI answer)
  globalShortcut.register("CommandOrControl+Shift+A", () => {
    overlayWindow?.webContents.send("global-shortcut", "request-ai-answer");
  });
}

app.on("will-quit", () => {
  globalShortcut.unregisterAll();
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
