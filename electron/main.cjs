// electron/main.cjs
// Standard, visible desktop shell for Clarify AI.
// NO screen-capture evasion. NO content protection. NO skipTaskbar.
// See .lovable/plan.md for scope and guardrails.

const { app, BrowserWindow, shell, session } = require("electron");
const path = require("path");
const url = require("url");
const { loadWindowState, trackWindow } = require("./window-state.cjs");
const { buildMenu } = require("./menu.cjs");

const isDev = process.env.ELECTRON_DEV === "1" || !app.isPackaged;
const DEV_URL = process.env.ELECTRON_DEV_URL || "http://localhost:8080";

// Single-instance lock — focus existing window on second launch.
const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
  return;
}

let mainWindow = null;

const CSP = [
  "default-src 'self'",
  "script-src 'self'" + (isDev ? " 'unsafe-eval'" : ""),
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob: https:",
  "font-src 'self' data:",
  "connect-src 'self' http://localhost:* ws://localhost:* https://*.supabase.co wss://*.supabase.co https://api.deepgram.com wss://api.deepgram.com https://api.stripe.com https://checkout.stripe.com",
  "frame-src https://checkout.stripe.com",
  "media-src 'self' blob:",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
].join("; ");

function isInternalUrl(target) {
  try {
    const u = new URL(target);
    if (isDev && u.origin === new URL(DEV_URL).origin) return true;
    return u.protocol === "file:";
  } catch {
    return false;
  }
}

function createMainWindow() {
  const state = loadWindowState({
    defaultWidth: 1440,
    defaultHeight: 900,
    minWidth: 1024,
    minHeight: 720,
  });

  mainWindow = new BrowserWindow({
    width: state.width,
    height: state.height,
    x: state.x,
    y: state.y,
    minWidth: 1024,
    minHeight: 720,
    show: false,
    backgroundColor: "#0F172A",
    title: "Clarify AI",
    autoHideMenuBar: false,
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

  mainWindow.once("ready-to-show", () => mainWindow.show());

  if (isDev) {
    mainWindow.loadURL(DEV_URL);
  } else {
    mainWindow.loadURL(
      url.format({
        pathname: path.join(__dirname, "..", "dist", "index.html"),
        protocol: "file:",
        slashes: true,
      })
    );
  }
}

app.on("second-instance", () => {
  if (mainWindow) {
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.focus();
  }
});

app.whenReady().then(() => {
  buildMenu({ isDev });
  createMainWindow();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createMainWindow();
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});

// Defense in depth: deny new web contents being attached.
app.on("web-contents-created", (_e, contents) => {
  contents.on("will-attach-webview", (e) => e.preventDefault());
});
