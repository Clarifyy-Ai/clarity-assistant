// ─────────────────────────────────────────────────────────────────────────────
// urlUtils.ts — URL parsing, query string building/parsing, route helpers,
// and deep-link construction for the app.
// ─────────────────────────────────────────────────────────────────────────────
import { SUPABASE_URL, ENV } from "@/lib/env";

// ─── Query String ─────────────────────────────────────────────────────────────

export type QueryParams = Record<string, string | number | boolean | null | undefined>;

/**
 * Build a query string from an object, omitting null/undefined values.
 * @example buildQueryString({ page: 1, q: "react" }) → "page=1&q=react"
 */
export function buildQueryString(params: QueryParams): string {
  const entries = Object.entries(params)
    .filter(([, v]) => v !== null && v !== undefined)
    .map(([k, v]) => [encodeURIComponent(k), encodeURIComponent(String(v))]);

  return entries.map(([k, v]) => `${k}=${v}`).join("&");
}

/**
 * Append a query string to a URL (handles existing ? and &).
 * @example appendQuery("/sessions", { page: 2 }) → "/sessions?page=2"
 */
export function appendQuery(url: string, params: QueryParams): string {
  const qs = buildQueryString(params);
  if (!qs) return url;
  return url.includes("?") ? `${url}&${qs}` : `${url}?${qs}`;
}

/**
 * Parse a query string into a typed object.
 * @example parseQueryString("?page=2&q=react") → { page: "2", q: "react" }
 */
export function parseQueryString(search: string): Record<string, string> {
  const params = new URLSearchParams(search.startsWith("?") ? search.slice(1) : search);
  const result: Record<string, string> = {};
  params.forEach((v, k) => { result[k] = v; });
  return result;
}

/**
 * Get a single query param from the current browser URL.
 */
export function getQueryParam(key: string): string | null {
  if (typeof window === "undefined") return null;
  return new URLSearchParams(window.location.search).get(key);
}

/**
 * Get all query params from the current browser URL.
 */
export function getAllQueryParams(): Record<string, string> {
  if (typeof window === "undefined") return {};
  return parseQueryString(window.location.search);
}

/**
 * Update a query param without reloading the page (replaceState).
 */
export function setQueryParam(key: string, value: string | null): void {
  if (typeof window === "undefined") return;
  const url    = new URL(window.location.href);
  if (value === null) url.searchParams.delete(key);
  else                url.searchParams.set(key, value);
  window.history.replaceState({}, "", url.toString());
}

// ─── URL Parsing ──────────────────────────────────────────────────────────────

/**
 * Safely parse a URL, returning null on failure.
 */
export function parseURL(url: string): URL | null {
  try {
    return new URL(url.startsWith("http") ? url : `https://${url}`);
  } catch {
    return null;
  }
}

/**
 * Extract the hostname from a URL.
 * @example getDomain("https://www.github.com/user") → "github.com"
 */
export function getDomain(url: string): string | null {
  const parsed = parseURL(url);
  if (!parsed) return null;
  return parsed.hostname.replace(/^www\./, "");
}

/**
 * Check if a URL is external (different origin from the app).
 */
export function isExternalURL(url: string): boolean {
  if (typeof window === "undefined") return false;
  const parsed = parseURL(url);
  return parsed !== null && parsed.origin !== window.location.origin;
}

/**
 * Check if a URL is a valid http/https URL.
 */
export function isValidURL(url: string): boolean {
  const parsed = parseURL(url);
  return parsed !== null && ["http:", "https:"].includes(parsed.protocol);
}

/**
 * Normalise a URL: trim, lowercase hostname, strip trailing slash.
 */
export function normalizeURL(url: string): string {
  const parsed = parseURL(url);
  if (!parsed) return url.trim();

  parsed.hostname = parsed.hostname.toLowerCase();
  let result = parsed.toString();
  if (result.endsWith("/") && parsed.pathname === "/") {
    result = result.slice(0, -1);
  }
  return result;
}

// ─── Path Helpers ─────────────────────────────────────────────────────────────

/**
 * Join URL path segments safely.
 * @example joinPaths("/api", "sessions", "123") → "/api/sessions/123"
 */
export function joinPaths(...segments: string[]): string {
  return "/" + segments
    .map((s) => s.replace(/^\/+|\/+$/g, ""))
    .filter(Boolean)
    .join("/");
}

/**
 * Get the file extension from a URL or path.
 * @example getExtension("/files/resume.pdf") → "pdf"
 */
export function getExtension(url: string): string {
  return url.split(".").pop()?.split("?")[0]?.toLowerCase() ?? "";
}

/**
 * Get the filename from a URL or path.
 * @example getFilename("/uploads/my-resume.pdf") → "my-resume.pdf"
 */
export function getFilename(url: string): string {
  return url.split("/").pop()?.split("?")[0] ?? "";
}

/**
 * Get the base path without extension.
 * @example getBasename("/uploads/my-resume.pdf") → "my-resume"
 */
export function getBasename(url: string): string {
  const filename = getFilename(url);
  const dotIndex = filename.lastIndexOf(".");
  return dotIndex > 0 ? filename.slice(0, dotIndex) : filename;
}

// ─── Deep Links ───────────────────────────────────────────────────────────────

/**
 * Build an app deep-link URL for sharing.
 * @example buildDeepLink("/session/abc123") → "https://trycareerpilot.com/session/abc123"
 */
export function buildDeepLink(path: string, params?: QueryParams): string {
  const base = typeof window !== "undefined"
    ? window.location.origin
    : ENV.APP_URL;

  const url = `${base}${path.startsWith("/") ? "" : "/"}${path}`;
  return params ? appendQuery(url, params) : url;
}

/**
 * Build a Supabase storage public URL.
 */
export function buildStorageURL(bucket: string, path: string): string {
  const base = SUPABASE_URL ?? "";
  return `${base}/storage/v1/object/public/${bucket}/${path}`;
}

// ─── Clipboard ────────────────────────────────────────────────────────────────

/**
 * Copy text to clipboard. Returns true on success.
 */
export async function copyToClipboard(text: string): Promise<boolean> {
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return true;
    }
    // Fallback for older browsers
    const ta = document.createElement("textarea");
    ta.value = text;
    ta.style.position = "fixed";
    ta.style.opacity  = "0";
    document.body.appendChild(ta);
    ta.select();
    const ok = document.execCommand("copy");
    document.body.removeChild(ta);
    return ok;
  } catch {
    return false;
  }
}

/**
 * Read text from clipboard.
 */
export async function readFromClipboard(): Promise<string | null> {
  try {
    return await navigator.clipboard.readText();
  } catch {
    return null;
  }
}
