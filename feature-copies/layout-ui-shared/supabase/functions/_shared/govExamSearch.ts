/**
 * Search contract for `search-exams`.
 *
 * Kept separate from the handler so the family allowlist, pagination bounds,
 * and error codes are unit-testable without a Deno runtime.
 */

/** Families the registry supports. Anything else is a client bug, not an empty result. */
export const GOV_EXAM_FAMILIES = [
  "ssc",
  "railways",
  "banking",
  "upsc",
  "state_psc",
  "defence",
  "teaching",
  "other",
] as const;

export type GovExamFamily = (typeof GOV_EXAM_FAMILIES)[number];

/** Distinguishes "unavailable" from "no matches" for the client. */
export const SEARCH_SERVICE_UNAVAILABLE = "SEARCH_SERVICE_UNAVAILABLE";
/** Canonical infra-failure code preferred by the public search contract. */
export const SERVICE_UNAVAILABLE = "SERVICE_UNAVAILABLE";
export const SEARCH_SERVICE_UNAVAILABLE_MESSAGE =
  "Exam search is temporarily unavailable.";
export const SERVICE_UNAVAILABLE_MESSAGE =
  "Exam search is temporarily unavailable.";

/** Generic search failure (DB/query path) — not the same as empty results. */
export const SEARCH_FAILED = "SEARCH_FAILED";
export const SEARCH_FAILED_MESSAGE =
  "Exam search failed. Please try again.";

/** Client sent an unusable query. */
export const INVALID_QUERY = "INVALID_QUERY";
export const INVALID_QUERY_MESSAGE =
  "That search query isn't valid. Try a shorter keyword.";

export const DEFAULT_PAGE = 1;
export const DEFAULT_PAGE_SIZE = 20;
export const MAX_PAGE_SIZE = 40;
/** Prevent unsafe PostgREST ranges / numeric overflow from untrusted input. */
export const MAX_PAGE = 10_000;
export const MIN_QUERY_LENGTH = 2;
export const MAX_QUERY_LENGTH = 120;

export type FamilyResolution =
  | { ok: true; family: GovExamFamily | null }
  | { ok: false; message: string };

/** Empty / missing family means "all families", not an error. */
export function resolveFamily(
  raw: unknown,
  allowedFamilies: readonly string[] = GOV_EXAM_FAMILIES,
): FamilyResolution {
  if (raw === undefined || raw === null) return { ok: true, family: null };
  if (typeof raw !== "string") {
    return { ok: false, message: "Family must be a string." };
  }
  const value = raw.trim().toLowerCase();
  if (!value) return { ok: true, family: null };
  if (allowedFamilies.includes(value)) {
    return { ok: true, family: value as GovExamFamily };
  }
  return { ok: false, message: "Unknown exam family." };
}

export type PageRequest = {
  page: number;
  pageSize: number;
  /** Inclusive PostgREST range start. */
  from: number;
  /** Inclusive PostgREST range end. */
  to: number;
};

function positiveInt(raw: unknown, fallback: number, max = Number.MAX_SAFE_INTEGER): number {
  const n = Number(raw);
  if (!Number.isSafeInteger(n) || n < 1) return fallback;
  return Math.min(n, max);
}

/** Clamps page/pageSize so a client cannot ask for the whole registry. */
export function resolvePagination(input: {
  page?: unknown;
  pageSize?: unknown;
}): PageRequest {
  const page = positiveInt(input.page, DEFAULT_PAGE, MAX_PAGE);
  const pageSize = Math.min(
    MAX_PAGE_SIZE,
    positiveInt(input.pageSize, DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE),
  );
  const from = (page - 1) * pageSize;
  return { page, pageSize, from, to: from + pageSize - 1 };
}

export type PaginationPayload = {
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
  hasMore: boolean;
  /** Opaque cursor for the next page; null when hasMore is false. */
  nextCursor: string | null;
};

export function encodeSearchCursor(page: number): string {
  return `p${Math.min(MAX_PAGE, positiveInt(page, DEFAULT_PAGE, MAX_PAGE))}`;
}

export function decodeSearchCursor(raw: unknown): number | null {
  if (typeof raw !== "string") return null;
  const m = /^p(\d+)$/i.exec(raw.trim());
  if (!m) return null;
  const page = Number(m[1]);
  return Number.isSafeInteger(page) && page >= 1
    ? Math.min(page, MAX_PAGE)
    : null;
}

export function buildPagination(
  request: Pick<PageRequest, "page" | "pageSize">,
  total: number,
): PaginationPayload {
  const page = positiveInt(request.page, DEFAULT_PAGE, MAX_PAGE);
  const pageSize = positiveInt(request.pageSize, DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE);
  const safeTotal = Number.isFinite(total) && total > 0 ? Math.floor(total) : 0;
  const totalPages = safeTotal === 0 ? 0 : Math.ceil(safeTotal / pageSize);
  const hasMore = page < totalPages;
  return {
    page,
    pageSize,
    total: safeTotal,
    totalPages,
    hasMore,
    nextCursor: hasMore ? encodeSearchCursor(page + 1) : null,
  };
}

/** Escapes PostgREST `or=` reserved characters in a user query. */
export function escapeIlikePattern(query: string): string {
  return query.replace(/[%_,()\\]/g, (match) => `\\${match}`);
}

/**
 * Double-quotes a PostgREST filter value so spaces / commas inside ilike
 * patterns do not split the `or=` grammar (e.g. `%SSC CGL%`).
 */
export function quotePostgrestValue(value: string): string {
  return `"${value.replace(/"/g, '\\"')}"`;
}

/** `%escaped%` ready for embedding in a PostgREST `.or()` / `.ilike.` clause. */
export function ilikeFilterValue(query: string): string {
  return quotePostgrestValue(`%${escapeIlikePattern(query)}%`);
}

/**
 * Unicode NFC, trim, collapse whitespace. Empty string means "browse all".
 */
export function normalizeSearchQuery(raw: unknown): string {
  if (raw === undefined || raw === null) return "";
  if (typeof raw !== "string") return "";
  return raw
    .normalize("NFC")
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

export type QueryValidation =
  | { ok: true; query: string }
  | { ok: false; code: typeof INVALID_QUERY; message: string };

/**
 * Validates a normalized search query.
 * Empty query is allowed (browse/list). Non-empty must be 2–120 meaningful chars.
 */
export function validateSearchQuery(raw: unknown): QueryValidation {
  if (raw !== undefined && raw !== null && typeof raw !== "string") {
    return { ok: false, code: INVALID_QUERY, message: INVALID_QUERY_MESSAGE };
  }
  const query = normalizeSearchQuery(raw);
  if (!query) return { ok: true, query: "" };

  if (/[<>]|javascript:|data:text\/html/i.test(query)) {
    return { ok: false, code: INVALID_QUERY, message: INVALID_QUERY_MESSAGE };
  }
  if (query.includes("\0")) {
    return { ok: false, code: INVALID_QUERY, message: INVALID_QUERY_MESSAGE };
  }
  // Meaningful chars = letters/numbers across scripts (no punctuation-only).
  const meaningful = query.replace(/[^\p{L}\p{N}]+/gu, "");
  if (meaningful.length < MIN_QUERY_LENGTH) {
    return {
      ok: false,
      code: INVALID_QUERY,
      message: "Enter at least 2 letters or numbers to search.",
    };
  }
  if (query.length > MAX_QUERY_LENGTH) {
    return { ok: false, code: INVALID_QUERY, message: INVALID_QUERY_MESSAGE };
  }
  return { ok: true, query };
}

/** PostgREST `or` filter for searchable gov_exams columns (+ recruiting body via filter). */
export function buildExamOrFilter(query: string): string {
  const pattern = ilikeFilterValue(query);
  return [
    `short_name.ilike.${pattern}`,
    `name.ilike.${pattern}`,
    `code.ilike.${pattern}`,
    `description.ilike.${pattern}`,
    `legacy_exam_type.ilike.${pattern}`,
    `state_code.ilike.${pattern}`,
    `jurisdiction.ilike.${pattern}`,
    `region.ilike.${pattern}`,
    `family.ilike.${pattern}`,
  ].join(",");
}

export type RankableExam = {
  code?: string | null;
  shortName?: string | null;
  name?: string | null;
  aliases?: string[] | null;
  recruitingBody?: { name?: string | null; code?: string | null } | null;
  family?: string | null;
  jurisdiction?: string | null;
  stateCode?: string | null;
};

function norm(s: string | null | undefined): string {
  return (s ?? "").normalize("NFC").trim().toLowerCase();
}

/**
 * Lower score = better match.
 * Order: exact short name/code → exact name → alias → prefix → recruiting body → full text → fuzzy.
 * `code` maps to short-name rank (exact code is treated like exact short name).
 */
export function examSearchRankScore(exam: RankableExam, query: string): number {
  const q = norm(query);
  if (!q) return 1000;
  const code = norm(exam.code);
  const shortName = norm(exam.shortName) || norm(exam.code?.replace(/_/g, " "));
  const name = norm(exam.name);
  const aliases = (exam.aliases ?? []).map(norm).filter(Boolean);
  const bodyName = norm(exam.recruitingBody?.name);
  const bodyCode = norm(exam.recruitingBody?.code);
  const family = norm(exam.family);
  const jurisdiction = norm(exam.jurisdiction);
  const stateCode = norm(exam.stateCode);

  // 0 — exact short name (code counts as short name)
  if (shortName === q || code === q || code.replace(/_/g, " ") === q) return 0;
  // 1 — exact name
  if (name === q) return 1;
  // 2 — exact alias
  if (aliases.some((a) => a === q)) return 2;
  // 3 — prefix
  if (
    shortName.startsWith(q) ||
    code.startsWith(q) ||
    name.startsWith(q) ||
    aliases.some((a) => a.startsWith(q))
  ) {
    return 3;
  }
  // 4 — recruiting body
  if (bodyName === q || bodyCode === q || bodyName.startsWith(q) || bodyName.includes(q)) {
    return 4;
  }
  // 5 — category / jurisdiction / full-text contains
  if (
    family === q ||
    jurisdiction === q ||
    stateCode === q ||
    name.includes(q) ||
    shortName.includes(q) ||
    code.includes(q) ||
    aliases.some((a) => a.includes(q)) ||
    family.includes(q) ||
    jurisdiction.includes(q) ||
    stateCode.includes(q)
  ) {
    return 5;
  }
  // 6+ — cheap trigram-ish fuzzy
  const hay = `${name} ${shortName} ${code} ${aliases.join(" ")} ${bodyName} ${family}`;
  let shared = 0;
  const seen = new Set<string>();
  for (const ch of q) {
    if (seen.has(ch)) continue;
    seen.add(ch);
    if (hay.includes(ch)) shared += 1;
  }
  const overlap = q.length === 0 ? 0 : shared / q.length;
  return 6 + (1 - overlap);
}

export function rankExamResults<T extends RankableExam>(
  exams: T[],
  query: string,
): T[] {
  const q = normalizeSearchQuery(query);
  if (!q) {
    return [...exams].sort((a, b) =>
      norm(a.name).localeCompare(norm(b.name)),
    );
  }
  return [...exams].sort((a, b) => {
    const diff = examSearchRankScore(a, q) - examSearchRankScore(b, q);
    if (diff !== 0) return diff;
    return norm(a.name).localeCompare(norm(b.name));
  });
}
