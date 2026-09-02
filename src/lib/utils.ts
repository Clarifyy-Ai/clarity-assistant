import { ENV } from "@/lib/env";
import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";
import { format, formatDistanceToNow, parseISO, isValid } from "date-fns";

// ─────────────────────────────────────────────────────────────────
// Tailwind class merging
// ─────────────────────────────────────────────────────────────────

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

// ─────────────────────────────────────────────────────────────────
// Score helpers
// ─────────────────────────────────────────────────────────────────

export function getScoreLabel(score: number): "high" | "mid" | "low" {
  if (score >= 70) return "high";
  if (score >= 45) return "mid";
  return "low";
}

export { getScoreColor } from "@/lib/constants/colors";

export function getScoreBgClass(score: number): string {
  if (score >= 70) return "score-pill-high";
  if (score >= 45) return "score-pill-mid";
  return "score-pill-low";
}

// ─────────────────────────────────────────────────────────────────
// Date / Time helpers
// ─────────────────────────────────────────────────────────────────

export function formatDate(dateStr: string, fmt = "MMM d, yyyy"): string {
  try {
    const d = parseISO(dateStr);
    if (!isValid(d)) return "—";
    return format(d, fmt);
  } catch {
    return "—";
  }
}

export function formatDateTime(dateStr: string): string {
  return formatDate(dateStr, "MMM d, yyyy 'at' h:mm a");
}

export function timeAgo(dateStr: string): string {
  try {
    const d = parseISO(dateStr);
    if (!isValid(d)) return "—";
    return formatDistanceToNow(d, { addSuffix: true });
  } catch {
    return "—";
  }
}

export function formatDuration(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  if (m === 0) return `${s}s`;
  return s === 0 ? `${m}m` : `${m}m ${s}s`;
}

export function formatMinutes(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = String(seconds % 60).padStart(2, "0");
  return `${m}:${s}`;
}

// ─────────────────────────────────────────────────────────────────
// String helpers
// ─────────────────────────────────────────────────────────────────

export function truncate(str: string, maxLength: number): string {
  if (str.length <= maxLength) return str;
  return str.slice(0, maxLength - 3) + "…";
}

export function capitalize(str: string): string {
  if (!str) return "";
  return str.charAt(0).toUpperCase() + str.slice(1).toLowerCase();
}

export function titleCase(str: string): string {
  return str
    .split(/[\s_-]+/)
    .map(capitalize)
    .join(" ");
}

export function slugify(str: string): string {
  return str
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

export function initials(name: string | null): string {
  if (!name) return "?";
  return name
    .split(" ")
    .map((w) => w[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);
}

// ─────────────────────────────────────────────────────────────────
// Number helpers
// ─────────────────────────────────────────────────────────────────

export function formatCredits(n: number): string {
  return n === 1 ? "1 credit" : `${n} credits`;
}

export function formatWPM(wpm: number): string {
  return `${Math.round(wpm)} WPM`;
}

export function formatPercent(value: number, decimals = 0): string {
  return `${value.toFixed(decimals)}%`;
}

export function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

export function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

export function roundTo(value: number, decimals: number): number {
  const factor = Math.pow(10, decimals);
  return Math.round(value * factor) / factor;
}

// ─────────────────────────────────────────────────────────────────
// File helpers
// ─────────────────────────────────────────────────────────────────

export function formatFileSize(bytes: number): string {
  if (bytes < 1024)         return `${bytes} B`;
  if (bytes < 1024 * 1024)  return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function getFileExtension(filename: string): string {
  return filename.split(".").pop()?.toLowerCase() ?? "";
}

export function isValidResumeFile(file: File): boolean {
  const allowedTypes = [
    "application/pdf",
    "application/msword",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    "text/plain",
  ];
  const maxSizeMB = Number(import.meta.env.VITE_MAX_RESUME_SIZE_MB ?? 5);
  return (
    allowedTypes.includes(file.type) &&
    file.size <= maxSizeMB * 1024 * 1024
  );
}

// ─────────────────────────────────────────────────────────────────
// Array helpers
// ─────────────────────────────────────────────────────────────────

export function uniqueBy<T>(arr: T[], key: keyof T): T[] {
  const seen = new Set();
  return arr.filter((item) => {
    const k = item[key];
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
}

export function groupBy<T>(arr: T[], key: keyof T): Record<string, T[]> {
  return arr.reduce((acc, item) => {
    const k = String(item[key]);
    if (!acc[k]) acc[k] = [];
    acc[k].push(item);
    return acc;
  }, {} as Record<string, T[]>);
}

export function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// ─────────────────────────────────────────────────────────────────
// ID generation
// ─────────────────────────────────────────────────────────────────

export function generateId(): string {
  return crypto.randomUUID();
}

export function generateShareToken(): string {
  const arr = new Uint8Array(16);
  crypto.getRandomValues(arr);
  return Array.from(arr, (b) => b.toString(16).padStart(2, "0")).join("");
}

// ─────────────────────────────────────────────────────────────────
// URL helpers
// ─────────────────────────────────────────────────────────────────

export function buildShareUrl(token: string): string {
  const base =
    ENV.APP_URL ||
    (typeof window !== "undefined" ? window.location.origin : "");
  return `${base}/share/${token}`;
}

export function isValidUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") return false;
    const host = parsed.hostname.toLowerCase();
    if (!host) return false;
    if (host === "localhost") return true;
    // Reject single-label nonsense like "uuojj" after https:// prefixing.
    if (!host.includes(".")) return false;
    if (/^\d+\.\d+\.\d+\.\d+$/.test(host)) return true;
    // Require a real TLD segment (letters, 2+ chars).
    const parts = host.split(".");
    const tld = parts[parts.length - 1];
    if (!tld || tld.length < 2 || !/^[a-z]+$/i.test(tld)) return false;
    return parts.every((p) => p.length > 0);
  } catch {
    return false;
  }
}

// ─────────────────────────────────────────────────────────────────
// Async helpers
// ─────────────────────────────────────────────────────────────────

export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function retry<T>(
  fn: () => Promise<T>,
  maxAttempts: number = 3,
  delayMs: number = 500
): Promise<T> {
  let lastError: unknown;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastError = err;
      if (attempt < maxAttempts) await sleep(delayMs * attempt);
    }
  }
  throw lastError;
}

// ─────────────────────────────────────────────────────────────────
// Debounce / Throttle
// ─────────────────────────────────────────────────────────────────

export function debounce<T extends (...args: unknown[]) => void>(
  fn: T,
  ms: number
): (...args: Parameters<T>) => void {
  let timer: ReturnType<typeof setTimeout>;
  return (...args) => {
    clearTimeout(timer);
    timer = setTimeout(() => fn(...args), ms);
  };
}

export function throttle<T extends (...args: unknown[]) => void>(
  fn: T,
  ms: number
): (...args: Parameters<T>) => void {
  let last = 0;
  return (...args) => {
    const now = Date.now();
    if (now - last >= ms) {
      last = now;
      fn(...args);
    }
  };
}
