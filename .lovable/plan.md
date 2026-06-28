# Electron Desktop App — Shell + Window Management

Wrap the existing Vite/React app as a normal, visible desktop application. No screen-capture evasion (locked out by project constraints).

## Guardrails

- Do NOT modify any existing web app feature, route, hook, or component.
- Do NOT add `setContentProtection`, `selfBrowserSurface:"exclude"`, `skipTaskbar`, `panel`/`toolbar` window types, panic-kill, or focus-loss auto-hide.
- All Electron files live under `/electron/`. The only repo-root changes: `package.json` (scripts + `main` field + devDeps) and `vite.config.ts` (`base: './'`).

## Scope

### 1. Electron shell
- `electron/main.cjs` — CommonJS main process. Creates a single `BrowserWindow` that loads `dist/index.html` via `file://` in production, or `http://localhost:8080` in dev (`ELECTRON_DEV=1`).
- Security: `contextIsolation: true`, `nodeIntegration: false`, `sandbox: true`, `webSecurity: true`. No preload bridge needed yet.
- `electron/preload.cjs` — minimal stub exposing `window.desktop = { platform, version }` only.
- `vite.config.ts` — set `base: './'` so `file://` asset paths resolve.
- `package.json` — add `"main": "electron/main.cjs"`, scripts `electron:dev`, `electron:build`, `electron:package:{linux,mac,win}`. Add devDeps `electron`, `@electron/packager`.

### 2. Window management (standard, user-visible)
- Min size 1024x720, default 1440x900, centered on first launch.
- Persist window bounds (x/y/w/h) + maximized state to `app.getPath('userData')/window-state.json`; restore on next launch, clamp to current display work area.
- Single-instance lock via `app.requestSingleInstanceLock()`; focus existing window on second launch.
- Native app menu (File / Edit / View / Window / Help) with standard roles + Cmd/Ctrl+Q quit, Cmd/Ctrl+R reload, F11 fullscreen, Cmd/Ctrl+Shift+I devtools (dev only).
- External links (`http(s)://` outside our origin) open in the OS default browser via `setWindowOpenHandler` + `will-navigate` guard.
- macOS: re-create window on `activate` when dock icon clicked; quit on all-windows-closed for win/linux only.
- Graceful shutdown: save window state on `close`.

### 3. Packaging
- `@electron/packager` (not electron-builder — sandbox-incompatible).
- Output to `electron-release/`, ignore `src`, `public`, `electron-release`, `node_modules/.cache`.
- Provide three scripts for linux/mac/win cross-compile from this sandbox.

## File diff

```text
package.json            (edit: scripts, main, devDeps)
vite.config.ts          (edit: base: './')
electron/main.cjs       (new)
electron/preload.cjs    (new)
electron/window-state.cjs (new)
electron/menu.cjs       (new)
electron/.gitignore     (new — ignore electron-release/)
```

## Out of scope (explicit)

- Auto-update, code signing, notarization, tray icon, deep links, IPC bridge, native notifications, system audio routing changes, any stealth/anti-capture behavior.

## Verification

- `npm run build` succeeds with new vite base.
- `npm run electron:dev` opens a normal window pointing at the dev server.
- `npm run electron:package:linux` produces `electron-release/Clarify-linux-x64/` and a `.tar.gz` under `/mnt/documents/`.
