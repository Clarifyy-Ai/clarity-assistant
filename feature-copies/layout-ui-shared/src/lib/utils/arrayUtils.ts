// ─────────────────────────────────────────────────────────────────────────────
// arrayUtils.ts — Array manipulation, grouping, sorting, deduplication,
// pagination, and statistical helpers used across the app.
// ─────────────────────────────────────────────────────────────────────────────

// ─── Deduplication ───────────────────────────────────────────────────────────

/**
 * Remove duplicate primitives from an array.
 */
export function unique<T>(arr: T[]): T[] {
  return [...new Set(arr)];
}

/**
 * Remove duplicates by a key selector.
 * @example uniqueBy(users, u => u.id)
 */
export function uniqueBy<T>(arr: T[], keyFn: (item: T) => unknown): T[] {
  const seen = new Set();
  return arr.filter((item) => {
    const key = keyFn(item);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

// ─── Grouping ─────────────────────────────────────────────────────────────────

/**
 * Group array items by a key selector.
 * @example groupBy(sessions, s => s.status)
 */
export function groupBy<T>(
  arr: T[],
  keyFn: (item: T) => string
): Record<string, T[]> {
  return arr.reduce<Record<string, T[]>>((acc, item) => {
    const key = keyFn(item);
    (acc[key] ??= []).push(item);
    return acc;
  }, {});
}

/**
 * Group and count items by key.
 * @example countBy(answers, a => a.model) → { "gpt-4o": 12, "claude": 7 }
 */
export function countBy<T>(
  arr: T[],
  keyFn: (item: T) => string
): Record<string, number> {
  return arr.reduce<Record<string, number>>((acc, item) => {
    const key = keyFn(item);
    acc[key]  = (acc[key] ?? 0) + 1;
    return acc;
  }, {});
}

// ─── Sorting ──────────────────────────────────────────────────────────────────

/**
 * Sort by a key, ascending or descending.
 * @example sortBy(sessions, s => s.createdAt, "desc")
 */
export function sortBy<T>(
  arr: T[],
  keyFn: (item: T) => string | number | Date,
  direction: "asc" | "desc" = "asc"
): T[] {
  return [...arr].sort((a, b) => {
    const va = keyFn(a);
    const vb = keyFn(b);
    const av = va instanceof Date ? va.getTime() : va;
    const bv = vb instanceof Date ? vb.getTime() : vb;
    return direction === "asc"
      ? av < bv ? -1 : av > bv ? 1 : 0
      : av > bv ? -1 : av < bv ? 1 : 0;
  });
}

/**
 * Multi-key sort.
 * @example sortByMultiple(items, [s => s.status, s => s.createdAt])
 */
export function sortByMultiple<T>(
  arr: T[],
  keyFns: Array<(item: T) => string | number>,
  directions: Array<"asc" | "desc"> = []
): T[] {
  return [...arr].sort((a, b) => {
    for (let i = 0; i < keyFns.length; i++) {
      const va  = keyFns[i](a);
      const vb  = keyFns[i](b);
      const dir = directions[i] ?? "asc";
      if (va < vb) return dir === "asc" ? -1 :  1;
      if (va > vb) return dir === "asc" ?  1 : -1;
    }
    return 0;
  });
}

// ─── Chunking ─────────────────────────────────────────────────────────────────

/**
 * Split an array into chunks of a given size.
 * @example chunk(, 2) → [,,]
 */
export function chunk<T>(arr: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < arr.length; i += size) {
    chunks.push(arr.slice(i, i + size));
  }
  return chunks;
}

// ─── Pagination ───────────────────────────────────────────────────────────────

export interface PaginatedResult<T> {
  items:      T[];
  total:      number;
  page:       number;
  pageSize:   number;
  totalPages: number;
  hasNext:    boolean;
  hasPrev:    boolean;
}

/**
 * Paginate an array in memory.
 */
export function paginate<T>(
  arr: T[],
  page: number,
  pageSize: number
): PaginatedResult<T> {
  const total      = arr.length;
  const totalPages = Math.ceil(total / pageSize);
  const clamped    = Math.max(1, Math.min(page, totalPages));
  const start      = (clamped - 1) * pageSize;
  const items      = arr.slice(start, start + pageSize);

  return {
    items,
    total,
    page:       clamped,
    pageSize,
    totalPages,
    hasNext:    clamped < totalPages,
    hasPrev:    clamped > 1,
  };
}

// ─── Search / Filter ──────────────────────────────────────────────────────────

/**
 * Filter and sort an array by a search query against multiple fields.
 */
export function searchFilter<T>(
  arr: T[],
  query: string,
  fields: Array<(item: T) => string>
): T[] {
  const q = query.toLowerCase().trim();
  if (!q) return arr;

  return arr
    .map((item) => {
      const score = Math.max(
        ...fields.map((fn) => {
          const val = fn(item).toLowerCase();
          if (val === q)          return 100;
          if (val.startsWith(q))  return 80;
          if (val.includes(q))    return 60;
          return 0;
        })
      );
      return { item, score };
    })
    .filter(({ score }) => score > 0)
    .sort((a, b) => b.score - a.score)
    .map(({ item }) => item);
}

// ─── Set Operations ───────────────────────────────────────────────────────────

export function intersection<T>(a: T[], b: T[]): T[] {
  const setB = new Set(b);
  return a.filter((item) => setB.has(item));
}

export function difference<T>(a: T[], b: T[]): T[] {
  const setB = new Set(b);
  return a.filter((item) => !setB.has(item));
}

export function union<T>(...arrays: T[][]): T[] {
  return unique(arrays.flat());
}

// ─── Statistics ───────────────────────────────────────────────────────────────

export function sum(arr: number[]): number {
  return arr.reduce((a, b) => a + b, 0);
}

export function average(arr: number[]): number {
  if (arr.length === 0) return 0;
  return sum(arr) / arr.length;
}

export function median(arr: number[]): number {
  if (arr.length === 0) return 0;
  const sorted = [...arr].sort((a, b) => a - b);
  const mid    = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? (sorted[mid - 1] + sorted[mid]) / 2
    : sorted[mid];
}

export function minMax(arr: number[]): { min: number; max: number } {
  if (arr.length === 0) return { min: 0, max: 0 };
  return { min: Math.min(...arr), max: Math.max(...arr) };
}

export function standardDeviation(arr: number[]): number {
  if (arr.length < 2) return 0;
  const avg  = average(arr);
  const variance = average(arr.map((n) => Math.pow(n - avg, 2)));
  return Math.sqrt(variance);
}

// ─── Misc ─────────────────────────────────────────────────────────────────────

/**
 * Pick a random item from an array.
 */
export function sample<T>(arr: T[]): T | undefined {
  return arr[Math.floor(Math.random() * arr.length)];
}
