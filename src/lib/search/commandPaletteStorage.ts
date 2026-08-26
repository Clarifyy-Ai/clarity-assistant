const STORAGE_KEY = "Clarify AI-command-palette-recent-v1";
const MAX_RECENT = 5;

function readRecent(): string[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
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
    localStorage.setItem(STORAGE_KEY, JSON.stringify(searches.slice(0, MAX_RECENT)));
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
  } catch {
    /* best-effort */
  }
}

export const PALETTE_GROUPS_DEFAULT = ["Navigate", "Sessions", "Prep", "Account", "Admin"] as const;
export const PALETTE_GROUPS_PREP_FIRST = ["Prep", "Navigate", "Sessions", "Account", "Admin"] as const;

/** Rank Prep Lab / STAR / Rephraser above later sections when the query mentions prep. */
export function paletteGroupOrder(query: string): readonly string[] {
  return query.toLowerCase().includes("prep")
    ? PALETTE_GROUPS_PREP_FIRST
    : PALETTE_GROUPS_DEFAULT;
}
