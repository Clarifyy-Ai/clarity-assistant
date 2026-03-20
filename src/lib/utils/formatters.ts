// ─────────────────────────────────────────────────────────────────────────────
// formatters.ts — Display formatters for numbers, currency, duration,
// file sizes, scores, WPM, credits, and percentages.
// ─────────────────────────────────────────────────────────────────────────────

// ─── Numbers ──────────────────────────────────────────────────────────────────

/**
 * Format a number with locale-aware thousand separators.
 * @example formatNumber(12345) → "12,345"
 */
export function formatNumber(
  value: number,
  options?: Intl.NumberFormatOptions
): string {
  return new Intl.NumberFormat("en-US", options).format(value);
}

/**
 * Format to a fixed decimal without trailing zeros.
 * @example formatDecimal(1.500) → "1.5"
 * @example formatDecimal(1.005, 2) → "1.01"
 */
export function formatDecimal(value: number, maxDecimals = 2): string {
  return parseFloat(value.toFixed(maxDecimals)).toString();
}

/**
 * Format a percentage value.
 * @example formatPercent(0.823) → "82.3%"
 * @example formatPercent(82.3, false) → "82.3%"
 */
export function formatPercent(
  value: number,
  isDecimal = true,
  decimals = 1
): string {
  const pct = isDecimal ? value * 100 : value;
  return `${formatDecimal(pct, decimals)}%`;
}

/**
 * Clamp a number between min and max.
 */
export function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

/**
 * Format a score (1–10) with optional label.
 * @example formatScore(8.5) → "8.5 / 10"
 */
export function formatScore(
  score: number,
  outOf = 10,
  decimals = 1
): string {
  return `${formatDecimal(score, decimals)} / ${outOf}`;
}

/**
 * Format a score as a percentage (1–10 → 0–100%).
 * @example formatScorePercent(7) → "70%"
 */
export function formatScorePercent(score: number, outOf = 10): string {
  return formatPercent(score / outOf, true, 0);
}

// ─── Currency ─────────────────────────────────────────────────────────────────

/**
 * Format USD cents to a display string.
 * @example formatCents(1999) → "$19.99"
 * @example formatCents(2000, true) → "$20"
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
 * Format a price per month with interval label.
 * @example formatMonthlyPrice(3900) → "$39/mo"
 */
export function formatMonthlyPrice(cents: number): string {
  if (cents === 0) return "Free";
  return `${formatCents(cents, true)}/mo`;
}

/**
 * Format a Date or ISO string for display.
 * @example formatDate("2025-03-15T10:30:00Z") → "Mar 15, 2025"
 */
export function formatDate(
  date: Date | string,
  options?: Intl.DateTimeFormatOptions
): string {
  const d = typeof date === "string" ? new Date(date) : date;
  return d.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    ...options,
  });
}

/**
 * Format seconds as mm:ss.
 * @example formatDurationSec(90) → "1:30"
 */
export function formatDurationSec(seconds: number): string {
  return formatDurationMs(seconds * 1000);
}

// ─── Duration & Time ──────────────────────────────────────────────────────────

/**
 * Format milliseconds as mm:ss.
 * @example formatDurationMs(90000)  → "1:30"
 * @example formatDurationMs(3661000) → "1:01:01"
 */
export function formatDurationMs(ms: number): string {
  if (ms < 0) return "0:00";
  const totalSeconds = Math.floor(ms / 1000);
  const hours   = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  const mm = String(minutes).padStart(2, "0");
  const ss = String(seconds).padStart(2, "0");

  return hours > 0 ? `${hours}:${mm}:${ss}` : `${minutes}:${ss}`;
}

/**
 * Format seconds as mm:ss.
 * @example formatDurationSeconds(90) → "1:30"
 */
export function formatDurationSeconds(seconds: number): string {
  return formatDurationMs(seconds * 1000);
}

/**
 * Format duration in a human-readable prose form.
 * @example formatDurationProse(90061) → "1h 1m 1s"
 */
export function formatDurationProse(ms: number): string {
  const totalSeconds = Math.floor(ms / 1000);
  const h = Math.floor(totalSeconds / 3600);
  const m = Math.floor((totalSeconds % 3600) / 60);
  const s = totalSeconds % 60;

  const parts: string[] = [];
  if (h > 0) parts.push(`${h}h`);
  if (m > 0) parts.push(`${m}m`);
  if (s > 0 || parts.length === 0) parts.push(`${s}s`);
  return parts.join(" ");
}

/**
 * Format seconds-remaining countdown as "mm:ss".
 */
export function formatCountdown(secondsRemaining: number): string {
  return formatDurationSeconds(Math.max(0, secondsRemaining));
}

// ─── File Size ────────────────────────────────────────────────────────────────

const FILE_UNITS = ["B", "KB", "MB", "GB", "TB"] as const;

/**
 * Format bytes into a human-readable file size.
 * @example formatFileSize(1536) → "1.5 KB"
 * @example formatFileSize(1048576) → "1.0 MB"
 */
export function formatFileSize(bytes: number, decimals = 1): string {
  if (bytes <= 0) return "0 B";
  const i = Math.floor(Math.log(bytes) / Math.log(1024));
  const unit = FILE_UNITS[Math.min(i, FILE_UNITS.length - 1)];
  const value = bytes / Math.pow(1024, i);
  return `${formatDecimal(value, decimals)} ${unit}`;
}

// ─── Speech Metrics ───────────────────────────────────────────────────────────

/**
 * Format words-per-minute reading.
 * @example formatWPM(143) → "143 WPM"
 */
export function formatWPM(wpm: number): string {
  return `${Math.round(wpm)} WPM`;
}

/**
 * Format an RMS amplitude (0–1) as a percentage display.
 * @example formatVolume(0.42) → "42%"
 */
export function formatVolume(rms: number): string {
  return `${Math.round(clamp(rms, 0, 1) * 100)}%`;
}

/**
 * Format a filler word count with rate.
 * @example formatFillerStat(5, 2.3) → "5 fillers (2.3/min)"
 */
export function formatFillerStat(count: number, perMinute: number): string {
  return `${count} filler${count === 1 ? "" : "s"} (${formatDecimal(perMinute, 1)}/min)`;
}

// ─── Credits ──────────────────────────────────────────────────────────────────

/**
 * Format a credit count with unit label.
 * @example formatCredits(1) → "1 credit"
 * @example formatCredits(50) → "50 credits"
 * @example formatCredits(-1) → "Unlimited"
 */
export function formatCredits(credits: number): string {
  if (credits === -1) return "Unlimited";
  return `${formatNumber(credits)} credit${credits === 1 ? "" : "s"}`;
}

/**
 * Format remaining credits with a low-balance warning threshold.
 */
export function formatCreditsRemaining(
  remaining: number,
  lowThreshold = 10
): { display: string; isLow: boolean; isEmpty: boolean } {
  return {
    display:  formatCredits(remaining),
    isLow:    remaining > 0 && remaining <= lowThreshold,
    isEmpty:  remaining <= 0,
  };
}

// ─── Lists ────────────────────────────────────────────────────────────────────

/**
 * Format an array of strings as a natural language list.
 * @example formatList(["React", "TypeScript", "Supabase"]) → "React, TypeScript, and Supabase"
 */
export function formatList(
  items: string[],
  conjunction = "and"
): string {
  if (items.length === 0) return "";
  if (items.length === 1) return items[0];
  if (items.length === 2) return `${items[0]} ${conjunction} ${items[1]}`;
  const last = items[items.length - 1];
  const rest = items.slice(0, -1).join(", ");
  return `${rest}, ${conjunction} ${last}`;
}

/**
 * Format a count with a singular/plural label.
 * @example formatCount(1, "session") → "1 session"
 * @example formatCount(3, "session") → "3 sessions"
 */
export function formatCount(count: number, singular: string, plural?: string): string {
  const label = count === 1 ? singular : (plural ?? `${singular}s`);
  return `${formatNumber(count)} ${label}`;
}

// ─── Ordinals ─────────────────────────────────────────────────────────────────

/**
 * Format a number as an ordinal string.
 * @example formatOrdinal(1) → "1st"
 * @example formatOrdinal(23) → "23rd"
 */
export function formatOrdinal(n: number): string {
  const s = ["th", "st", "nd", "rd"];
  const v = n % 100;
  return `${n}${s[(v - 20) % 10] ?? s[v] ?? s[0]}`;
}
