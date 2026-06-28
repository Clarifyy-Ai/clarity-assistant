type DesktopBridge = {
  isDesktop?: boolean;
  isElectron?: boolean;
  platform?: string;
};

type ElectronWindow = Window & {
  desktop?: DesktopBridge;
  electronAPI?: DesktopBridge;
};

/** True when running inside the Clarify AI Electron desktop shell. */
export function isElectronApp(): boolean {
  if (typeof window === "undefined") return false;

  const win = window as ElectronWindow;
  if (win.electronAPI?.isElectron === true || win.desktop?.isDesktop === true) {
    return true;
  }

  // Packaged builds always include the Electron user agent.
  return typeof navigator !== "undefined" && /Electron/i.test(navigator.userAgent);
}
