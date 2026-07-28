// electron/window-state.cjs
// Persist and restore window bounds + maximized state.
const { app, screen } = require("electron");
const fs = require("fs");
const path = require("path");

const FILE = path.join(app.getPath("userData"), "window-state.json");

function readFile() {
  try {
    return JSON.parse(fs.readFileSync(FILE, "utf-8"));
  } catch {
    return null;
  }
}

function writeFile(data) {
  try {
    fs.mkdirSync(path.dirname(FILE), { recursive: true });
    fs.writeFileSync(FILE, JSON.stringify(data));
  } catch {
    /* best effort */
  }
}

function normalizeBounds(bounds, defaultWidth, defaultHeight) {
  const display = screen.getPrimaryDisplay();
  const wa = display.workArea;

  const width = Number.isFinite(bounds?.width) ? bounds.width : defaultWidth;
  const height = Number.isFinite(bounds?.height) ? bounds.height : defaultHeight;
  const safeWidth = Math.min(Math.max(width, 360), wa.width);
  const safeHeight = Math.min(Math.max(height, 320), wa.height);

  let x = bounds?.x;
  let y = bounds?.y;
  if (!Number.isFinite(x) || !Number.isFinite(y)) {
    x = wa.x + Math.round((wa.width - safeWidth) / 2);
    y = wa.y + Math.round((wa.height - safeHeight) / 2);
  }

  return { x, y, width: safeWidth, height: safeHeight };
}

function clampToDisplay(bounds, defaultWidth, defaultHeight) {
  const normalized = normalizeBounds(bounds, defaultWidth, defaultHeight);
  const display =
    screen.getDisplayMatching(normalized) || screen.getPrimaryDisplay();
  const wa = display.workArea;

  const width = Math.min(Math.max(normalized.width, 360), wa.width);
  const height = Math.min(Math.max(normalized.height, 320), wa.height);
  let x = normalized.x;
  let y = normalized.y;

  if (x < wa.x || x + width > wa.x + wa.width) {
    x = wa.x + Math.round((wa.width - width) / 2);
  }
  if (y < wa.y || y + height > wa.y + wa.height) {
    y = wa.y + Math.round((wa.height - height) / 2);
  }

  return { x, y, width, height };
}

function loadWindowState({ defaultWidth, defaultHeight }) {
  const saved = readFile();
  const base =
    saved && saved.bounds
      ? saved.bounds
      : { width: defaultWidth, height: defaultHeight };
  const bounds = clampToDisplay(base, defaultWidth, defaultHeight);
  return { ...bounds, isMaximized: !!(saved && saved.isMaximized) };
}

function trackWindow(win) {
  const persist = () => {
    if (!win || win.isDestroyed()) return;
    const isMaximized = win.isMaximized();
    const bounds = isMaximized ? win.getNormalBounds() : win.getBounds();
    writeFile({ bounds, isMaximized });
  };
  let timer = null;
  const debounced = () => {
    clearTimeout(timer);
    timer = setTimeout(persist, 250);
  };
  win.on("resize", debounced);
  win.on("move", debounced);
  win.on("maximize", persist);
  win.on("unmaximize", persist);
  win.on("close", persist);
}

module.exports = { loadWindowState, trackWindow };
