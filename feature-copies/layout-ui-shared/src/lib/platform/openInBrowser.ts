import { ENV } from "@/lib/env";
import {
  PRODUCTION_APP_URL,
  isLocalhostUrl,
} from "@/lib/auth/redirectUrl";
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
  const configured = (ENV.APP_URL ?? "").replace(/\/$/, "");
  const isProduction = (ENV.APP_ENV ?? "").toLowerCase() === "production";
  const windowOrigin =
    typeof window !== "undefined" ? window.location.origin.replace(/\/$/, "") : "";

  let base = configured;
  if (!base || (isProduction && isLocalhostUrl(base))) {
    base = isProduction
      ? PRODUCTION_APP_URL
      : windowOrigin || PRODUCTION_APP_URL;
  }

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
