// electron/main.cjs
// Desktop shell for Practice Coach overlay sessions only.
// Dashboard, prep, billing, and mock interviews run in the web browser.
const { app, BrowserWindow, shell, session, dialog, ipcMain, globalShortcut } = require("electron");
const path = require("path");
const fs = require("fs");
const url = require("url");
const { loadWindowState, trackWindow } = require("./window-state.cjs");
const { buildMenu } = require("./menu.cjs");

const isDev = process.env.ELECTRON_DEV === "1" || !app.isPackaged;
const DEV_URL = process.env.ELECTRON_DEV_URL || "http://localhost:5173";

const connectSrc = [
  "'self'",
  "https://*.supabase.co",
  "wss://*.supabase.co",
  "https://api.deepgram.com",
  "wss://api.deepgram.com",
  "https://agent.deepgram.com",
  "wss://agent.deepgram.com",
  "https://api.stripe.com",
  "https://checkout.stripe.com",
  "https://api.github.com",
  "https://api.openai.com",
  "https://api.anthropic.com",
  "https://generativelanguage.googleapis.com",
  "https://*.sentry.io",
  "https://*.ingest.sentry.io",
  "https://app.posthog.com",
  "https://us.i.posthog.com",
  "https://eu.i.posthog.com",
  // FastAPI scraper / Python worker (VITE_SCRAPER_URL / PYTHON_SERVICE_URL)
  "https://clarity-assistant-az05.onrender.com",
  "https://*.onrender.com",
  ...(isDev ? ["http://localhost:*", "ws://localhost:*"] : []),
].join(" ");

const CSP = [
  "default-src 'self'",
  // Vite production bundles are static; unsafe-inline retained only for style
  // attributes used by the UI toolkit. Scripts: no unsafe-eval outside Electron DEV.
  "script-src 'self'" + (isDev ? " 'unsafe-inline' 'unsafe-eval'" : ""),
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob: https:",
  "font-src 'self' data:",
  `connect-src ${connectSrc}`,
  "frame-src https://checkout.stripe.com",
  "frame-ancestors 'none'",
  "media-src 'self' blob: data:",
  "worker-src 'self' blob:",
  "object-src 'none'",
  "base-uri 'none'",
  "form-action 'self'",
].join("; ");

// Single-instance lock — focus existing window on second launch.
const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
  return;
}

let mainWindow = null;

function isSafeExternalUrl(target) {
  try {
    const u = new URL(target);
    return u.protocol === "http:" || u.protocol === "https:";
  } catch {
    return false;
  }
}

function isInternalUrl(target) {
  try {
    const u = new URL(target);
    if (isDev && u.origin === new URL(DEV_URL).origin) return true;
    return u.protocol === "file:";
  } catch {
    return false;
  }
}

function resolveIndexHtmlPath() {
  // Packaged: app.asar/dist/index.html. Unpackaged: <repo>/dist/index.html.
  // Prefer app.getAppPath(); fall back next to electron/ for local package runs.
  const candidates = [
    path.join(app.getAppPath(), "dist", "index.html"),
    path.join(__dirname, "..", "dist", "index.html"),
  ];
  for (const candidate of candidates) {
    try {
      if (fs.existsSync(candidate)) return candidate;
    } catch {
      /* ignore */
    }
  }
  return candidates[0];
}

function showMainWindow() {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  if (!mainWindow.isVisible()) mainWindow.show();
  mainWindow.focus();
}

function reportLoadFailure(title, detail) {
  console.error(`[Career Pilot] ${title}:`, detail);
  showMainWindow();
  dialog.showErrorBox(title, detail);
}

function createMainWindow() {
  const state = loadWindowState({
    defaultWidth: 480,
    defaultHeight: 640,
  });

  mainWindow = new BrowserWindow({
    width: state.width,
    height: state.height,
    x: state.x,
    y: state.y,
    minWidth: 360,
    minHeight: 320,
    show: false,
    backgroundColor: "#0B1220",
    title: "Career Pilot",
    autoHideMenuBar: true,
    // Always-on-top is opt-in via overlay:set-always-on-top (privacy default).
    alwaysOnTop: false,
    icon: path.join(__dirname, "..", "public", "brand", "app-icon-512.png"),
    webPreferences: {
      preload: path.join(__dirname, "preload.cjs"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webSecurity: true,
      spellcheck: true,
    },
  });

  if (state.isMaximized) mainWindow.maximize();
  trackWindow(mainWindow);

  // CSP header on all renderer responses
  session.defaultSession.webRequest.onHeadersReceived((details, cb) => {
    cb({
      responseHeaders: {
        ...details.responseHeaders,
        "Content-Security-Policy": [CSP],
      },
    });
  });

  // Block navigation away from app origin; open externally instead.
  mainWindow.webContents.on("will-navigate", (event, target) => {
    if (!isInternalUrl(target)) {
      event.preventDefault();
      shell.openExternal(target);
    }
  });

  // window.open and target=_blank → OS browser.
  mainWindow.webContents.setWindowOpenHandler(({ url: target }) => {
    if (!isInternalUrl(target) && /^https?:/.test(target)) {
      shell.openExternal(target);
    }
    return { action: "deny" };
  });

  mainWindow.webContents.on("did-fail-load", (_event, errorCode, errorDescription, validatedURL) => {
    reportLoadFailure(
      "Career Pilot failed to load",
      `Could not load the app shell (${errorCode}: ${errorDescription}).\n\nURL: ${validatedURL}`,
    );
  });

  mainWindow.webContents.on("render-process-gone", (_event, details) => {
    reportLoadFailure(
      "Career Pilot crashed",
      `The app window stopped unexpectedly (${details.reason}). Please restart Career Pilot.`,
    );
  });

  mainWindow.once("ready-to-show", () => {
    // Content protection is OPT-IN (stealth). Default: visible on screen share.
    mainWindow.setContentProtection(false);
    showMainWindow();
  });

  // Fallback: never leave the app running with a hidden window.
  const showFallbackTimer = setTimeout(() => {
    if (mainWindow && !mainWindow.isDestroyed() && !mainWindow.isVisible()) {
      console.warn("[Career Pilot] ready-to-show timeout — forcing window visible");
      showMainWindow();
    }
  }, 3000);
  mainWindow.once("ready-to-show", () => clearTimeout(showFallbackTimer));
  mainWindow.on("closed", () => clearTimeout(showFallbackTimer));

  // HashRouter (IS_ELECTRON) expects #/app/live/overlay — keep hash identical in
  // both paths so production loadFile and vite-dev loadURL land on LiveOverlay.
  if (isDev) {
    mainWindow.loadURL(`${DEV_URL}#/app/live/overlay`);
    mainWindow.webContents.openDevTools({ mode: "detach" });
  } else {
    const indexPath = resolveIndexHtmlPath();
    mainWindow.loadFile(indexPath, { hash: "/app/live/overlay" });
  }
  // Show window as soon as HTML is parsed (boot splash), not only after React paints.
  mainWindow.webContents.once("did-finish-load", () => {
    if (mainWindow && !mainWindow.isDestroyed() && !mainWindow.isVisible()) {
      showMainWindow();
    }
  });
}

app.on("second-instance", () => {
  showMainWindow();
});

function isSafeAccelerator(accelerator) {
  if (typeof accelerator !== "string" || accelerator.length < 3 || accelerator.length > 80) {
    return false;
  }
  // Tokens + single key only — no paths, quotes, or shell metacharacters.
  return /^(?:CommandOrControl|Command|Control|Ctrl|Alt|Option|Shift|Super|Meta|\+|Plus|[A-Za-z0-9])+$/i.test(
    accelerator,
  );
}

function registerGlobalShortcuts(bindings) {
  globalShortcut.unregisterAll();

  const allowedActions = new Set(["toggle-overlay", "request-ai-answer", "panic-calm"]);
  const list = Array.isArray(bindings) && bindings.length
    ? bindings
    : [
        { accelerator: "CommandOrControl+Shift+U", action: "toggle-overlay" },
        { accelerator: "CommandOrControl+Shift+X", action: "toggle-overlay" },
        { accelerator: "CommandOrControl+Shift+K", action: "toggle-overlay" },
        { accelerator: "CommandOrControl+Shift+P", action: "panic-calm" },
        { accelerator: "CommandOrControl+Shift+A", action: "request-ai-answer" },
      ];
  for (const item of list) {
    const accelerator = item?.accelerator;
    const action = item?.action;
    if (!isSafeAccelerator(accelerator) || !allowedActions.has(action)) {
      console.warn("[Career Pilot] Rejected shortcut binding", item);
      continue;
    }
    try {
      const ok = globalShortcut.register(accelerator, () => {
        if (!mainWindow || mainWindow.isDestroyed()) return;
        mainWindow.webContents.send("global-shortcut", action);
      });
      if (!ok) {
        console.warn(`[Career Pilot] Failed to register ${accelerator}`);
        if (mainWindow && !mainWindow.isDestroyed()) {
          mainWindow.webContents.send("hotkey-conflict", { key: accelerator });
        }
      }
    } catch (err) {
      console.warn(`[Career Pilot] Shortcut error ${accelerator}:`, err);
    }
  }
}

app.on("will-quit", () => {
  globalShortcut.unregisterAll();
});

app.whenReady().then(() => {
  ipcMain.handle("shell:openExternal", (_event, targetUrl) => {
    if (typeof targetUrl === "string" && isSafeExternalUrl(targetUrl)) {
      return shell.openExternal(targetUrl);
    }
    return false;
  });

  ipcMain.handle("set-content-protection", (_event, enabled) => {
    // Opt-in presentation-safe content protection only. Default remains visible.
    // Does not claim universal invisibility across all capture / share paths.
    mainWindow?.setContentProtection(Boolean(enabled));
  });

  // Overlay window controls — always-on-top, resize, show/hide
  ipcMain.handle("overlay:set-always-on-top", (_event, flag, level) => {
    if (!mainWindow || mainWindow.isDestroyed()) return;
    const safeLevel = ["normal", "floating", "torn-off-menu", "modal-panel", "main-menu",
      "status", "pop-up-menu", "screen-saver"].includes(level) ? level : "floating";
    mainWindow.setAlwaysOnTop(Boolean(flag), safeLevel);
  });

  ipcMain.handle("overlay:resize", (_event, width, height) => {
    if (!mainWindow || mainWindow.isDestroyed()) return;
    const w = Math.max(320, Math.min(1200, Number(width) || 480));
    const h = Math.max(200, Math.min(900,  Number(height) || 600));
    mainWindow.setSize(w, h);
  });

  ipcMain.handle("overlay:show-inactive", () => {
    if (!mainWindow || mainWindow.isDestroyed()) return;
    mainWindow.showInactive();
  });

  ipcMain.handle("overlay:hide", () => {
    if (!mainWindow || mainWindow.isDestroyed()) return;
    mainWindow.hide();
  });

  ipcMain.handle("overlay:sync-global-shortcuts", (_event, bindings) => {
    try {
      registerGlobalShortcuts(bindings);
      return { ok: true };
    } catch (err) {
      console.warn("[Career Pilot] sync-global-shortcuts failed:", err);
      return { ok: false };
    }
  });

  buildMenu({ isDev });
  createMainWindow();
  registerGlobalShortcuts();

  if (app.isPackaged) {
    const { autoUpdater } = require("electron-updater");
    autoUpdater.checkForUpdatesAndNotify();
    autoUpdater.on("update-available", () => {
      mainWindow?.webContents.send("update-available");
    });
    autoUpdater.on("update-downloaded", () => {
      mainWindow?.webContents.send("update-downloaded");
    });
  }

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createMainWindow();
    else showMainWindow();
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});

// Defense in depth: deny new web contents being attached.
app.on("web-contents-created", (_e, contents) => {
  contents.on("will-attach-webview", (e) => e.preventDefault());
});
