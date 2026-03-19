// ─────────────────────────────────────────────────────────────────────────────
// stringUtils.ts — String manipulation: truncation, casing, sanitization,
// slug generation, highlight, filler detection, and template interpolation.
// ─────────────────────────────────────────────────────────────────────────────

// ─── Truncation ───────────────────────────────────────────────────────────────

/**
 * Truncate a string to a maximum length with an ellipsis.
 * @example truncate("Hello World", 8) → "Hello..."
 */
export function truncate(
  str: string,
  maxLength: number,
  ellipsis = "..."
): string {
  if (!str || str.length <= maxLength) return str ?? "";
  return str.slice(0, maxLength - ellipsis.length).trimEnd() + ellipsis;
}

/**
 * Truncate at a word boundary — never cuts mid-word.
 * @example truncateWords("Hello beautiful world", 14) → "Hello beautiful..."
 */
export function truncateWords(str: string, maxLength: number, ellipsis = "..."): string {
  if (!str || str.length <= maxLength) return str ?? "";
  const truncated = str.slice(0, maxLength);
  const lastSpace = truncated.lastIndexOf(" ");
  return (lastSpace > 0 ? truncated.slice(0, lastSpace) : truncated).trimEnd() + ellipsis;
}

/**
 * Truncate the middle of a string, keeping start and end.
 * @example truncateMiddle("very-long-file-name.pdf", 15) → "very-lon...pdf"
 */
export function truncateMiddle(str: string, maxLength: number): string {
  if (!str || str.length <= maxLength) return str ?? "";
  const halfLen = Math.floor((maxLength - 3) / 2);
  return `${str.slice(0, halfLen)}...${str.slice(-halfLen)}`;
}

// ─── Casing ───────────────────────────────────────────────────────────────────

/**
 * Convert string to Title Case.
 * @example toTitleCase("hello world") → "Hello World"
 */
export function toTitleCase(str: string): string {
  return str.replace(
    /\w\S*/g,
    (word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase()
  );
}

/**
 * Convert string to camelCase.
 * @example toCamelCase("hello-world_foo") → "helloWorldFoo"
 */
export function toCamelCase(str: string): string {
  return str
    .replace(/[-_\s]+(.)/g, (_, char) => char.toUpperCase())
    .replace(/^./, (char) => char.toLowerCase());
}

/**
 * Convert string to kebab-case.
 * @example toKebabCase("HelloWorldFoo") → "hello-world-foo"
 */
export function toKebabCase(str: string): string {
  return str
    .replace(/([a-z])([A-Z])/g, "$1-$2")
    .replace(/[\s_]+/g, "-")
    .toLowerCase();
}

/**
 * Convert string to snake_case.
 * @example toSnakeCase("HelloWorldFoo") → "hello_world_foo"
 */
export function toSnakeCase(str: string): string {
  return toKebabCase(str).replace(/-/g, "_");
}

/**
 * Capitalize only the first character.
 * @example capitalize("hello world") → "Hello world"
 */
export function capitalize(str: string): string {
  if (!str) return "";
  return str.charAt(0).toUpperCase() + str.slice(1);
}

// ─── Slug ─────────────────────────────────────────────────────────────────────

/**
 * Generate a URL-safe slug from any string.
 * @example slugify("Software Engineer @ FAANG!") → "software-engineer-faang"
 */
export function slugify(str: string): string {
  return str
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")   // remove diacritics
    .replace(/[^a-z0-9\s-]/g, "")      ## `src/lib/utils/` — 9 Missing Files

---

### 1. `src/lib/utils/formatters.ts`

```typescript
// ─────────────────────────────────────────────────────────────────────────────
// formatters.ts — Display formatting for numbers, currency, duration,
// file sizes, scores, WPM, and all other UI-facing data transformations.
// ─────────────────────────────────────────────────────────────────────────────

// ─── Numbers ──────────────────────────────────────────────────────────────────

/**
 * Format a number with locale-aware thousand separators.
 * @example formatNumber(12500) → "12,500"
 */
export function formatNumber(n: number, decimals = 0): string {
  return new Intl.NumberFormat("en-US", {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  }).format(n);
}

/**
 * Format a number as a compact abbreviation.
 * @example formatCompact(1500) → "1.5K"
 */
export function formatCompact(n: number): string {
  return new Intl.NumberFormat("en-US", {
    notation: "compact",
    maximumFractionDigits: 1,
  }).format(n);
}

/**
 * Format a ratio (0–1) as a percentage string.
 * @example formatPercent(0.875) → "87.5%"
 */
export function formatPercent(ratio: number, decimals = 0): string {
  return `${(ratio * 100).toFixed(decimals)}%`;
}

/**
 * Format a score (0–100 or 0–10) with a label suffix.
 * @example formatScore(8.5, 10) → "8.5/10"
 */
export function formatScore(score: number, max = 10): string {
  return `${score % 1 === 0 ? score : score.toFixed(1)}/${max}`;
}

/**
 * Clamp a number between min and max.
 */
export function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

/**
 * Round to a specific number of decimal places.
 */
export function roundTo(value: number, decimals: number): number {
  const factor = Math.pow(10, decimals);
  return Math.round(value * factor) / factor;
}

// ─── Currency ─────────────────────────────────────────────────────────────────

/**
 * Format USD cents to a currency display string.
 * @example formatCents(1999) → "$19.99"
 * @example formatCents(1999, true) → "$20"
 */
export function formatCents(
  cents: number,
  hideDecimals = false,
  currency = "USD"
): string {
  if (cents === 0) return "Free";
  return new Intl.NumberFormat("en-US", {
    style:                 "currency",
    currency,
    minimumFractionDigits: hideDecimals ? 0 : 2,
    maximumFractionDigits: hideDecimals ? 0 : 2,
  }).format(cents / 100);
}

/**
 * Format a yearly saving as "Save X%".
 */
export function formatYearlySaving(monthlyPrice: number, yearlyPrice: number): string {
  if (monthlyPrice === 0) return "";
  const saving = Math.round(((monthlyPrice - yearlyPrice) / monthlyPrice) * 100);
  return saving > 0 ? `Save ${saving}%` : "";
}

// ─── Duration ─────────────────────────────────────────────────────────────────

/**
 * Format milliseconds to mm:ss display.
 * @example formatDurationMs(125400) → "2:05"
 */
export function formatDurationMs(ms: number): string {
  const totalSeconds = Math.floor(ms / 1000);
  const minutes      = Math.floor(totalSeconds / 60);
  const seconds      = totalSeconds % 60;
  return `${minutes}:${String(seconds).padStart(2, "0")}`;
}

/**
 * Format seconds to mm:ss display.
 * @example formatDurationSec(90) → "1:30"
 */
export function formatDurationSec(seconds: number): string {
  return formatDurationMs(seconds * 1000);
}

/**
 * Format milliseconds to a human-readable string.
 * @example formatDurationHuman(3700000) → "1h 1m"
 * @example formatDurationHuman(125000)  → "2m 5s"
 */
export function formatDurationHuman(ms: number): string {
  const totalSeconds = Math.floor(ms / 1000);
  const hours   = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  if (hours > 0)   return `${hours}h ${minutes}m`;
  if (minutes > 0) return `${minutes}m ${seconds}s`;
  return `${seconds}s`;
}

/**
 * Format a session duration in minutes to a short label.
 * @example formatSessionLength(90) → "1h 30m"
 */
export function formatSessionLength(totalMinutes: number): string {
  const h = Math.floor(totalMinutes / 60);
  const m = totalMinutes % 60;
  if (h === 0) return `${m}m`;
  if (m === 0) return `${h}h`;
  return `${h}h ${m}m`;
}

// ─── File Size ────────────────────────────────────────────────────────────────

/**
 * Format bytes to a human-readable file size.
 * @example formatFileSize(1536000) → "1.5 MB"
 */
export function formatFileSize(bytes: number): string {
  if (bytes === 0) return "0 B";

  const units = ["B", "KB", "MB", "GB", "TB"];
  const i     = Math.floor(Math.log(bytes) / Math.log(1024));
  const size  = bytes / Math.pow(1024, i);

  return `${size % 1 === 0 ? size : size.toFixed(1)} ${units[i]}`;
}

// ─── Audio / Speech ───────────────────────────────────────────────────────────

/**
 * Format words per minute with label.
 * @example formatWPM(145) → "145 WPM"
 */
export function formatWPM(wpm: number): string {
  return `${Math.round(wpm)} WPM`;
}

/**
 * Format an RMS amplitude (0–1) as a percentage bar label.
 * @example formatRMS(0.312) → "31%"
 */
export function formatRMS(rms: number): string {
  return `${Math.round(clamp(rms, 0, 1) * 100)}%`;
}

/**
 * Format a filler word count with rate.
 * @example formatFillerCount(12, 180) → "12 fillers (4/min)"
 */
export function formatFillerCount(count: number, durationSeconds: number): string {
  const perMin = durationSeconds > 0
    ? Math.round((count / durationSeconds) * 60)
    : 0;
  return `${count} filler${count === 1 ? "" : "s"} (${perMin}/min)`;
}

// ─── Credits ─────────────────────────────────────────────────────────────────

/**
 * Format a credit count with unit.
 * @example formatCredits(1) → "1 credit"
 * @example formatCredits(50) → "50 credits"
 */
export function formatCredits(count: number): string {
  if (count === -1) return "Unlimited credits";
  return `${formatNumber(count)} credit${count === 1 ? "" : "s"}`;
}

/**
 * Format a credit balance with "low" warning.
 */
export function formatCreditBalance(balance: number, lowThreshold = 10): {
  text: string;
  isLow: boolean;
} {
  return {
    text:  formatCredits(balance),
    isLow: balance >= 0 && balance <= lowThreshold,
  };
}

// ─── Text ─────────────────────────────────────────────────────────────────────

/**
 * Truncate text with ellipsis at a given character limit.
 * @example truncate("Hello World", 8) → "Hello..."
 */
export function truncate(text: string, limit: number, suffix = "…"): string {
  if (text.length <= limit) return text;
  return text.slice(0, limit - suffix.length) + suffix;
}

/**
 * Truncate to a word boundary instead of a character boundary.
 */
export function truncateWords(text: string, maxWords: number): string {
  const words = text.trim().split(/\s+/);
  if (words.length <= maxWords) return text;
  return words.slice(0, maxWords).join(" ") + "…";
}

/**
 * Format a plain name into initials.
 * @example getInitials("John Smith") → "JS"
 */
export function getInitials(name: string, max = 2): string {
  return name
    .trim()
    .split(/\s+/)
    .map((w) => w?.toUpperCase() ?? "")
    .filter(Boolean)
    .slice(0, max)
    .join("");
}

/**
 * Ordinal suffix for a number.
 * @example ordinal(1) → "1st"
 * @example ordinal(23) → "23rd"
 */
export function ordinal(n: number): string {
  const s = ["th", "st", "nd", "rd"];
  const v = n % 100;
  return n + (s[(v - 20) % 10] ?? s[v] ?? s);
}

/**
 * Pluralise a word based on count.
 * @example pluralise(1, "session") → "1 session"
 * @example pluralise(3, "session") → "3 sessions"
 */
export function pluralise(count: number, singular: string, plural?: string): string {
  return `${formatNumber(count)} ${count === 1 ? singular : (plural ?? `${singular}s`)}`;
}
