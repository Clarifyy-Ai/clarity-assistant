/** Optional direct installer URL (GitHub Releases, CDN, etc.). */
export const DESKTOP_DOWNLOAD_URL =
  (typeof import.meta !== "undefined" &&
    (import.meta.env.VITE_DESKTOP_DOWNLOAD_URL as string | undefined)?.trim()) ||
  "";

/** In-app guide with desktop install steps (see docs/ELECTRON_RELEASE.md). */
export const DESKTOP_INSTALL_GUIDE_PATH = "/app/guide/practice-coach";

export function getDesktopDownloadHref(): string {
  return DESKTOP_DOWNLOAD_URL || DESKTOP_INSTALL_GUIDE_PATH;
}

export function isDesktopDownloadExternal(): boolean {
  return Boolean(DESKTOP_DOWNLOAD_URL);
}
