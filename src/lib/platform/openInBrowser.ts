import { ENV } from "@/lib/env";
import { resolvePublicAppOrigin } from "@/lib/auth/redirectUrl";
import { isElectronApp } from "@/lib/platform/isElectron";

type ElectronOpenExternal = {
  openExternal?: (url: string) => void | Promise<void>;
};

/**
 * Canonical web-app origin for deep links from the desktop shell.
 * Never honor a localhost VITE_APP_URL in production (billing "open in browser"
 * must not hand users a dead localhost resource URL).
 */
export function getWebAppUrl(path = ""): string {
  const base = resolvePublicAppOrigin({
    configuredAppUrl: ENV.APP_URL,
    appEnv: ENV.APP_ENV,
    windowOrigin:
      typeof window !== "undefined" ? window.location.origin : null,
  });

  if (!path) return base;

  const normalizedPath = path.startsWith("/") ? path : `/${path}`;
  return `${base}${normalizedPath}`;
}

/** Open a web-app path in the system browser (desktop) or a new tab (web). */
export function openInBrowser(path = "/app/dashboard"): void {
  const url = getWebAppUrl(path);
  const api = (window as Window & { electronAPI?: ElectronOpenExternal }).electronAPI;

  if (isElectronApp() && api?.openExternal) {
    void api.openExternal(url);
    return;
  }

  window.open(url, "_blank", "noopener,noreferrer");
}
