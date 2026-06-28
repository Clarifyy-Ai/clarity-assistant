import { ENV } from "@/lib/env";
import { isElectronApp } from "@/lib/platform/isElectron";

type ElectronOpenExternal = {
  openExternal?: (url: string) => void | Promise<void>;
};

/** Canonical web-app origin for deep links from the desktop shell. */
export function getWebAppUrl(path = ""): string {
  const base =
    ENV.APP_URL?.replace(/\/$/, "") ||
    (typeof window !== "undefined" ? window.location.origin : "");

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
