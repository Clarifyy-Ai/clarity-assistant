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

export function toTitleCase(str: string): string {
  return str.replace(
    /\w\S*/g,
    (word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase()
  );
}

export function toCamelCase(str: string): string {
  return str
    .replace(/[-_\s]+(.)/g, (_, char) => char.toUpperCase())
    .replace(/^./, (char) => char.toLowerCase());
}

export function toKebabCase(str: string): string {
  return str
    .replace(/([a-z])([A-Z])/g, "$1-$2")
    .replace(/[\s_]+/g, "-")
    .toLowerCase();
}

export function toSnakeCase(str: string): string {
  return toKebabCase(str).replace(/-/g, "_");
}

export function capitalize(str: string): string {
  if (!str) return "";
  return str.charAt(0).toUpperCase() + str.slice(1);
}

// ─── Aliases for barrel compatibility ─────────────────────────────────────────
export const titleCase = toTitleCase;

// ─── Slug ─────────────────────────────────────────────────────────────────────

export function slugify(str: string): string {
  return str
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9\s-]/g, "")
    .replace(/[\s]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
}

// ─── Initials ─────────────────────────────────────────────────────────────────

export function getInitials(name: string | null | undefined): string {
  if (!name) return "?";
  return name
    .split(/\s+/)
    .filter(Boolean)
    .map((w) => w[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);
}

// ─── Sanitization ─────────────────────────────────────────────────────────────

export function stripHTML(str: string): string {
  return str.replace(/<[^>]*>/g, "");
}

export function escapeHTML(str: string): string {
  const map: Record<string, string> = {
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#039;",
  };
  return str.replace(/[&<>"']/g, (c) => map[c] ?? c);
}

export function alphanumericOnly(str: string): string {
  return str.replace(/[^a-zA-Z0-9]/g, "");
}

export function normalizeWhitespace(str: string): string {
  return str.replace(/\s+/g, " ").trim();
}

// ─── Casing helpers (additional) ──────────────────────────────────────────────

export function camelToTitle(str: string): string {
  return str
    .replace(/([A-Z])/g, " $1")
    .replace(/^./, (c) => c.toUpperCase())
    .trim();
}

export function snakeToTitle(str: string): string {
  return str
    .split("_")
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

// ─── Filler Words ─────────────────────────────────────────────────────────────

export const FILLER_WORDS = [
  "um", "uh", "er", "ah", "like", "you know", "basically",
  "actually", "literally", "right", "so", "well", "I mean",
  "sort of", "kind of",
];

export function removeFillers(text: string): string {
  let result = text;
  for (const filler of FILLER_WORDS) {
    const regex = new RegExp(`\\b${filler}\\b`, "gi");
    result = result.replace(regex, "");
  }
  return normalizeWhitespace(result);
}

export function countFillers(text: string): Record<string, number> {
  const counts: Record<string, number> = {};
  const lower = text.toLowerCase();
  for (const filler of FILLER_WORDS) {
    const regex = new RegExp(`\\b${filler}\\b`, "gi");
    const matches = lower.match(regex);
    if (matches) counts[filler] = matches.length;
  }
  return counts;
}

export function totalFillerCount(text: string): number {
  return Object.values(countFillers(text)).reduce((sum, c) => sum + c, 0);
}

// ─── Text Metrics ─────────────────────────────────────────────────────────────

export function wordCount(str: string): number {
  if (!str.trim()) return 0;
  return str.trim().split(/\s+/).length;
}

export function sentenceCount(str: string): number {
  if (!str.trim()) return 0;
  return str.split(/[.!?]+/).filter((s) => s.trim().length > 0).length;
}

export function charCount(str: string): number {
  return str.length;
}

export function averageWordLength(str: string): number {
  const words = str.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return 0;
  return words.reduce((sum, w) => sum + w.length, 0) / words.length;
}

export function estimateReadingTime(str: string, wpm = 200): number {
  return Math.ceil(wordCount(str) / wpm);
}

export function estimateSpeakingTime(str: string, wpm = 130): number {
  return Math.ceil(wordCount(str) / wpm);
}

// ─── Search & Match ───────────────────────────────────────────────────────────

export function fuzzyMatch(text: string, query: string): boolean {
  const lower = text.toLowerCase();
  const q = query.toLowerCase();
  let qi = 0;
  for (let i = 0; i < lower.length && qi < q.length; i++) {
    if (lower[i] === q[qi]) qi++;
  }
  return qi === q.length;
}

export function matchScore(text: string, query: string): number {
  if (!query) return 0;
  const lower = text.toLowerCase();
  const q = query.toLowerCase();
  if (lower === q) return 1;
  if (lower.startsWith(q)) return 0.9;
  if (lower.includes(q)) return 0.7;
  if (fuzzyMatch(text, query)) return 0.4;
  return 0;
}

export function highlight(text: string, query: string): string {
  if (!query) return text;
  const escaped = query.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return text.replace(new RegExp(`(${escaped})`, "gi"), "<mark>$1</mark>");
}

export function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

// ─── Extraction ───────────────────────────────────────────────────────────────

export function extractEmails(text: string): string[] {
  return text.match(/[\w.+-]+@[\w-]+\.[\w.]+/g) ?? [];
}

export function extractURLs(text: string): string[] {
  return text.match(/https?:\/\/[^\s<>"]+/g) ?? [];
}

export function extractHashtags(text: string): string[] {
  return (text.match(/#[\w]+/g) ?? []).map((t) => t.slice(1));
}

export function parseTags(input: string): string[] {
  return input
    .split(/[,;]+/)
    .map((t) => t.trim())
    .filter(Boolean);
}

// ─── ID Generation ────────────────────────────────────────────────────────────

export function generateUUID(): string {
  return crypto.randomUUID();
}

export function generateShortId(length = 8): string {
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
  const arr = new Uint8Array(length);
  crypto.getRandomValues(arr);
  return Array.from(arr, (b) => chars[b % chars.length]).join("");
}

// ─── Pluralise ────────────────────────────────────────────────────────────────

export function pluralise(count: number, singular: string, plural?: string): string {
  return count === 1 ? singular : (plural ?? `${singular}s`);
}

export function ordinal(n: number): string {
  const s = ["th", "st", "nd", "rd"];
  const v = n % 100;
  return n + (s[(v - 20) % 10] || s[v] || s[0]);
}
