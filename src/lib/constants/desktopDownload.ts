import type { DetectedOs } from "@/lib/platform/detectOs";

function sanitizeProductionUrl(raw: string | undefined): string {
  const trimmed = raw?.trim() ?? "";
  if (!trimmed) return "";
  if (
    import.meta.env.PROD &&
    /^(https?:\/\/)?(localhost|127\.0\.0\.1|0\.0\.0\.0)(:\d+)?/i.test(trimmed)
  ) {
    return "";
  }
  return trimmed;
}

/** Optional direct installer URL (all platforms). */
export const DESKTOP_DOWNLOAD_URL = sanitizeProductionUrl(
  typeof import.meta !== "undefined"
    ? (import.meta.env.VITE_DESKTOP_DOWNLOAD_URL as string | undefined)
    : undefined,
);

export const DESKTOP_RELEASES_BUCKET = "desktop-releases";
export const DESKTOP_INSTALLER_WIN_OBJECT = "Career-Pilot-Setup.exe";
/** Same-origin path — browser never navigates to GitHub. */
export const SAME_ORIGIN_WINDOWS_INSTALLER_PATH = "/download/Career-Pilot-Setup.exe";
/** Direct PHP proxy (Hostinger) — used when pretty-path rewrite is not yet live. */
export const SAME_ORIGIN_WINDOWS_INSTALLER_PROXY = "/download-windows.php";
export const PUBLIC_WINDOWS_INSTALLER_URL = SAME_ORIGIN_WINDOWS_INSTALLER_PATH;

/** Public installer hosted on the project's Supabase Storage bucket. */
export function publicDesktopInstallerUrl(filename: string): string {
  const base = sanitizeProductionUrl(
    typeof import.meta !== "undefined"
      ? (import.meta.env.VITE_SUPABASE_URL as string | undefined)
      : undefined,
  );
  if (!base) return PUBLIC_WINDOWS_INSTALLER_URL;
  return `${base.replace(/\/+$/, "")}/storage/v1/object/public/${DESKTOP_RELEASES_BUCKET}/${filename}`;
}

const DESKTOP_DOWNLOAD_URL_WIN =
  sanitizeProductionUrl(import.meta.env.VITE_DESKTOP_DOWNLOAD_URL_WIN as string | undefined) ||
  PUBLIC_WINDOWS_INSTALLER_URL;

const DESKTOP_DOWNLOAD_URL_MAC = sanitizeProductionUrl(
  import.meta.env.VITE_DESKTOP_DOWNLOAD_URL_MAC as string | undefined,
);

const DESKTOP_DOWNLOAD_URL_LINUX = sanitizeProductionUrl(
  import.meta.env.VITE_DESKTOP_DOWNLOAD_URL_LINUX as string | undefined,
);

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
  windows: [/Career.?Pilot.*Setup.*\.exe$/i, /Clarify.*Setup.*\.exe$/i, /\.exe$/i, /setup.*win/i, /windows/i],
  mac: [/Career.?Pilot.*\.dmg$/i, /Clarify.*\.dmg$/i, /\.dmg$/i, /mac/i],
  linux: [/Career.?Pilot.*\.appimage$/i, /Clarify.*\.appimage$/i, /\.appimage$/i, /linux/i],
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

export function isGitHubDownloadHost(url: string): boolean {
  try {
    const parsed = new URL(url, "https://trycareerpilot.com");
    const host = parsed.hostname.toLowerCase();
    return (
      host === "github.com" ||
      host.endsWith(".github.com") ||
      host === "githubusercontent.com" ||
      host.endsWith(".githubusercontent.com")
    );
  } catch {
    return false;
  }
}

/** Force installer downloads through this site so GitHub is not shown. */
export function sameOriginInstallerHref(url: string, os: DetectedOs = "windows"): string {
  if (!url) return os === "windows" ? SAME_ORIGIN_WINDOWS_INSTALLER_PATH : url;
  if (url.startsWith("/")) return url;
  if (os === "windows" && isGitHubDownloadHost(url)) {
    return SAME_ORIGIN_WINDOWS_INSTALLER_PATH;
  }
  return url;
}

/** Minimum installer size (bytes) — rejects HTML/JSON error bodies. */
export const DESKTOP_INSTALLER_MIN_BYTES = 1_000_000;

export type DesktopInstallerProbeResult = {
  ok: boolean;
  status: number;
  contentType: string | null;
  contentLength: number | null;
  reason?: string;
};

function parseContentLength(header: string | null): number | null {
  if (!header) return null;
  const n = Number.parseInt(header, 10);
  return Number.isFinite(n) && n >= 0 ? n : null;
}

/** Prefer Content-Range total (bytes 0-0/85178534) over partial Content-Length. */
function resolveInstallerByteLength(headers: Headers): number | null {
  const range = headers.get("content-range");
  const total = range?.match(/\/(\d+)\s*$/)?.[1];
  if (total) {
    const n = Number.parseInt(total, 10);
    if (Number.isFinite(n) && n >= 0) return n;
  }
  return parseContentLength(headers.get("content-length"));
}

function contentTypeLooksLikeInstaller(contentType: string | null): boolean {
  if (!contentType) return true; // some hosts omit type on HEAD
  const t = contentType.toLowerCase();
  if (t.includes("text/html") || t.includes("text/plain") || t.includes("application/json")) {
    return false;
  }
  return (
    t.includes("application/octet-stream") ||
    t.includes("application/x-msdownload") ||
    t.includes("application/vnd.microsoft.portable-executable") ||
    t.includes("binary") ||
    t.includes("exe")
  );
}

/**
 * HEAD (then Range GET fallback) to confirm the installer URL serves a real binary.
 * Fail-closed: 404/HTML/tiny bodies are not available.
 */
export async function probeDesktopInstaller(
  url: string,
  fetchImpl: typeof fetch = fetch,
): Promise<DesktopInstallerProbeResult> {
  if (!url) {
    return { ok: false, status: 0, contentType: null, contentLength: null, reason: "missing_url" };
  }

  const absolute =
    url.startsWith("http://") || url.startsWith("https://")
      ? url
      : typeof window !== "undefined"
        ? new URL(url, window.location.origin).href
        : url;

  async function inspect(res: Response): Promise<DesktopInstallerProbeResult> {
    const contentType = res.headers.get("content-type");
    const contentLength = resolveInstallerByteLength(res.headers);
    if (!(res.ok || res.status === 206)) {
      return {
        ok: false,
        status: res.status,
        contentType,
        contentLength,
        reason: `http_${res.status}`,
      };
    }
    if (!contentTypeLooksLikeInstaller(contentType)) {
      return {
        ok: false,
        status: res.status,
        contentType,
        contentLength,
        reason: "bad_content_type",
      };
    }
    // Fail closed: missing length can be PHP source / empty proxy served as octet-stream.
    if (contentLength == null) {
      return {
        ok: false,
        status: res.status,
        contentType,
        contentLength,
        reason: "missing_length",
      };
    }
    if (contentLength < DESKTOP_INSTALLER_MIN_BYTES) {
      return {
        ok: false,
        status: res.status,
        contentType,
        contentLength,
        reason: "too_small",
      };
    }
    return { ok: true, status: res.status, contentType, contentLength };
  }

  try {
    let headResult: DesktopInstallerProbeResult | null = null;
    try {
      const head = await fetchImpl(absolute, {
        method: "HEAD",
        redirect: "follow",
        cache: "no-store",
      });
      if (head.status !== 405 && head.status !== 501) {
        headResult = await inspect(head);
        if (headResult.ok) return headResult;
        // Definitive failures — do not keep probing.
        if (
          head.status === 404 ||
          head.status === 403 ||
          head.status === 502 ||
          head.status === 503 ||
          headResult.reason === "bad_content_type" ||
          headResult.reason === "too_small"
        ) {
          return headResult;
        }
        // missing_length / ambiguous → try Range GET for Content-Range total
      }
    } catch {
      headResult = null;
    }

    const range = await fetchImpl(absolute, {
      method: "GET",
      headers: { Range: "bytes=0-0" },
      redirect: "follow",
      cache: "no-store",
    });
    try {
      await range.body?.cancel();
    } catch {
      /* ignore */
    }
    return inspect(range);
  } catch {
    return {
      ok: false,
      status: 0,
      contentType: null,
      contentLength: null,
      reason: "network_error",
    };
  }
}

/** Trigger a file download without opening an upstream tab. */
export function startSameOriginInstallerDownload(
  href: string,
  filename = DESKTOP_INSTALLER_WIN_OBJECT,
): void {
  const a = document.createElement("a");
  a.href = href;
  a.download = filename;
  a.rel = "noopener";
  a.style.display = "none";
  document.body.appendChild(a);
  a.click();
  a.remove();
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

const CACHE_KEY = "career-pilot-desktop-download-url";
const LEGACY_CACHE_KEY = "clarify-desktop-download-url";

export function readCachedDownloadUrl(os: DetectedOs): string | null {
  try {
    const raw =
      sessionStorage.getItem(`${CACHE_KEY}:${os}`) ||
      sessionStorage.getItem(`${LEGACY_CACHE_KEY}:${os}`);
    return raw || null;
  } catch {
    return null;
  }
}

export function writeCachedDownloadUrl(os: DetectedOs, url: string): void {
  try {
    sessionStorage.setItem(`${CACHE_KEY}:${os}`, url);
    sessionStorage.removeItem(`${LEGACY_CACHE_KEY}:${os}`);
  } catch {
    /* ignore */
  }
}

/** Resolve best download URL: env → GitHub latest → null */
export async function resolveDesktopDownloadUrl(os: DetectedOs): Promise<string | null> {
  const envUrl = getPlatformDownloadUrlFromEnv(os);
  if (envUrl) return sameOriginInstallerHref(envUrl, os);

  const cached = readCachedDownloadUrl(os);
  if (cached) return sameOriginInstallerHref(cached, os);

  const githubUrl = await fetchLatestGitHubReleaseUrl(os);
  if (githubUrl) {
    const href = sameOriginInstallerHref(githubUrl, os);
    writeCachedDownloadUrl(os, href);
    return href;
  }
  return null;
}

/**
 * Probe the canonical pretty path first, then the PHP proxy path.
 * Returns the first same-origin href that serves a real installer binary.
 */
export async function resolveAvailableWindowsInstallerHref(
  preferredHref?: string | null,
  fetchImpl: typeof fetch = fetch,
): Promise<string | null> {
  const storageUrl = publicDesktopInstallerUrl(DESKTOP_INSTALLER_WIN_OBJECT);
  const candidates = [
    preferredHref,
    SAME_ORIGIN_WINDOWS_INSTALLER_PATH,
    SAME_ORIGIN_WINDOWS_INSTALLER_PROXY,
    storageUrl.startsWith("http") ? storageUrl : null,
  ].filter((u, i, arr): u is string => Boolean(u) && arr.indexOf(u) === i);

  for (const href of candidates) {
    const probe = await probeDesktopInstaller(href, fetchImpl);
    if (probe.ok) {
      // External storage is a valid fallback when Hostinger rewrite/PHP proxy is broken.
      if (href.startsWith("http")) return href;
      return href.startsWith("/") || href.startsWith("http")
        ? sameOriginInstallerHref(href, "windows")
        : href;
    }
  }
  return null;
}
