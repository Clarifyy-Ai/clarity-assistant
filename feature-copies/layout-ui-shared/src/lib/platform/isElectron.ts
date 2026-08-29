type DesktopBridge = {
  isDesktop?: boolean;
  isElectron?: boolean;
  platform?: string;
};

type ElectronWindow = Window & {
  desktop?: DesktopBridge;
  electronAPI?: DesktopBridge;
};

/**
 * True when running inside the Clarify AI Electron desktop shell.
 *
 * Do not sniff navigator.userAgent for "Electron". Cursor, VS Code, and other
 * Chromium shells also include that token, which would treat a local Vite
 * preview as the desktop overlay app (hash router + /app/live/overlay).
 * Packaged Clarify sets window.electronAPI / window.desktop from preload.cjs.
 */
export function isElectronApp(): boolean {
  if (typeof window === "undefined") return false;

  const win = window as ElectronWindow;
  return win.electronAPI?.isElectron === true || win.desktop?.isDesktop === true;
}
