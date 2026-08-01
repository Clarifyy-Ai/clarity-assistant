import type { DetectedOs } from "@/lib/platform/detectOs";

/** Optional direct installer URL (all platforms). */
export const DESKTOP_DOWNLOAD_URL =
  (typeof import.meta !== "undefined" &&
    (import.meta.env.VITE_DESKTOP_DOWNLOAD_URL as string | undefined)?.trim()) ||
  "";

const DESKTOP_DOWNLOAD_URL_WIN =
  (import.meta.env.VITE_DESKTOP_DOWNLOAD_URL_WIN as string | undefined)?.trim() || "";

const DESKTOP_DOWNLOAD_URL_MAC =
  (import.meta.env.VITE_DESKTOP_DOWNLOAD_URL_MAC as string | undefined)?.trim() || "";

const DESKTOP_DOWNLOAD_URL_LINUX =
  (import.meta.env.VITE_DESKTOP_DOWNLOAD_URL_LINUX as string | undefined)?.trim() || "";

/**
 * GitHub repo for auto-resolving latest release asset (owner/repo).
 * Only queried when explicitly configured — the default org/repo is often
 * private or empty, which spams 404s in the browser console.
 */
export const GITHUB_RELEASE_REPO =
  (import.meta.env.VITE_GITHUB_RELEASE_REPO as string | undefined)?.trim() || "";

/** In-app guide with desktop install steps (see docs/ELECTRON_RELEASE.md). */
export const DESKTOP_INSTALL_GUIDE_PATH = "/app/guide/practice-coach";

const ASSET_PATTERNS: Record<DetectedOs, RegExp[]> = {
  windows: [/Clarify.*Setup.*\.exe$/i, /\.exe$/i, /setup.*win/i, /windows/i],
  mac: [/Clarify.*\.dmg$/i, /\.dmg$/i, /mac/i],
  linux: [/Clarify.*\.appimage$/i, /\.appimage$/i, /linux/i],
  other: [/\.exe$/i, /\.dmg$/i, /\.appimage$/i],
};

export function getPlatformDownloadUrlFromEnv(os: DetectedOs): string {
  switch (os) {
    case "windows":
      return DESKTOP_DOWNLOAD_URL_WIN || DESKTOP_DOWNLOAD_URL;
    case "mac":
      return DESKTOP_DOWNLOAD_URL_MAC || DESKTOP_DOWNLOAD_URL;
    case "linux":
      return DESKTOP_DOWNLOAD_URL_LINUX || DESKTOP_DOWNLOAD_URL;
    default:
      return DESKTOP_DOWNLOAD_URL;
  }
}

export function isDesktopDownloadExternal(os?: DetectedOs): boolean {
  if (os) {
    return Boolean(getPlatformDownloadUrlFromEnv(os) || GITHUB_RELEASE_REPO);
  }
  return Boolean(
    DESKTOP_DOWNLOAD_URL ||
      DESKTOP_DOWNLOAD_URL_WIN ||
      DESKTOP_DOWNLOAD_URL_MAC ||
      DESKTOP_DOWNLOAD_URL_LINUX ||
      GITHUB_RELEASE_REPO,
  );
}

/** @deprecated Use getPlatformDownloadHref(os) */
export function getDesktopDownloadHref(os: DetectedOs = "windows"): string {
  const envUrl = getPlatformDownloadUrlFromEnv(os);
  if (envUrl) return envUrl;
  return DESKTOP_INSTALL_GUIDE_PATH;
}

export function pickReleaseAssetUrl(
  assets: { name: string; browser_download_url: string }[],
  os: DetectedOs,
): string | null {
  for (const pattern of ASSET_PATTERNS[os]) {
    const match = assets.find((a) => pattern.test(a.name));
    if (match) return match.browser_download_url;
  }
  return assets[0]?.browser_download_url ?? null;
}

/** Fetch latest GitHub release installer URL for the user's OS. */
export async function fetchLatestGitHubReleaseUrl(os: DetectedOs): Promise<string | null> {
  if (!GITHUB_RELEASE_REPO || GITHUB_RELEASE_REPO.includes("your-org")) return null;

  const headers = { Accept: "application/vnd.github+json" };
  const base = `https://api.github.com/repos/${GITHUB_RELEASE_REPO}`;

  async function pickFromReleaseList(releases: { assets?: { name: string; browser_download_url: string }[] }[]) {
    for (const release of releases) {
      if (!release.assets?.length) continue;
      const url = pickReleaseAssetUrl(release.assets, os);
      if (url) return url;
    }
    return null;
  }

  try {
    const latestRes = await fetch(`${base}/releases/latest`, { headers });
    if (latestRes.ok) {
      const data = (await latestRes.json()) as {
        assets?: { name: string; browser_download_url: string }[];
      };
      if (data.assets?.length) {
        return pickReleaseAssetUrl(data.assets, os);
      }
    }

    const listRes = await fetch(`${base}/releases?per_page=10`, { headers });
    if (!listRes.ok) return null;

    const releases = (await listRes.json()) as {
      assets?: { name: string; browser_download_url: string }[];
    }[];
    return pickFromReleaseList(Array.isArray(releases) ? releases : []);
  } catch {
    return null;
  }
}

const CACHE_KEY = "clarify-desktop-download-url";

export function readCachedDownloadUrl(os: DetectedOs): string | null {
  try {
    const raw = sessionStorage.getItem(`${CACHE_KEY}:${os}`);
    return raw || null;
  } catch {
    return null;
  }
}

export function writeCachedDownloadUrl(os: DetectedOs, url: string): void {
  try {
    sessionStorage.setItem(`${CACHE_KEY}:${os}`, url);
  } catch {
    /* ignore */
  }
}

/** Resolve best download URL: env → GitHub latest → null */
export async function resolveDesktopDownloadUrl(os: DetectedOs): Promise<string | null> {
  const envUrl = getPlatformDownloadUrlFromEnv(os);
  if (envUrl) return envUrl;

  const cached = readCachedDownloadUrl(os);
  if (cached) return cached;

  const githubUrl = await fetchLatestGitHubReleaseUrl(os);
  if (githubUrl) writeCachedDownloadUrl(os, githubUrl);
  return githubUrl;
}
