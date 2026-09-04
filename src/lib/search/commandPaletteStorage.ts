import {
  localStorageGetWithLegacy,
  localStorageSetBrand,
} from "@/lib/constants/brandStorage";

const STORAGE_KEY = "career-pilot-command-palette-recent-v1";
const LEGACY_KEYS = ["Clarify AI-command-palette-recent-v1"] as const;
const MAX_RECENT = 5;

function readRecent(): string[] {
  try {
    const raw = localStorageGetWithLegacy(STORAGE_KEY, LEGACY_KEYS);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((s): s is string => typeof s === "string" && s.trim().length > 0);
  } catch {
    return [];
  }
}

function writeRecent(searches: string[]): void {
  try {
    localStorageSetBrand(
      STORAGE_KEY,
      JSON.stringify(searches.slice(0, MAX_RECENT)),
      LEGACY_KEYS,
    );
  } catch {
    /* best-effort */
  }
}

export function getRecentSearches(): string[] {
  return readRecent();
}

export function addRecentSearch(query: string): void {
  const trimmed = query.trim();
  if (trimmed.length < 2) return;
  const next = [trimmed, ...readRecent().filter((s) => s !== trimmed)].slice(0, MAX_RECENT);
  writeRecent(next);
}

export function clearRecentSearches(): void {
  try {
    localStorage.removeItem(STORAGE_KEY);
    for (const legacy of LEGACY_KEYS) localStorage.removeItem(legacy);
  } catch {
    /* best-effort */
  }
}

export const PALETTE_GROUPS_DEFAULT = ["Navigate", "Sessions", "Prep", "Account"] as const;
export const PALETTE_GROUPS_PREP_FIRST = ["Prep", "Navigate", "Sessions", "Account"] as const;

/** Rank Prep Lab / STAR / Rephraser above later sections when the query mentions prep. */
export function paletteGroupOrder(query: string): readonly string[] {
  return query.toLowerCase().includes("prep")
    ? PALETTE_GROUPS_PREP_FIRST
    : PALETTE_GROUPS_DEFAULT;
}
