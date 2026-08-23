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
export const MIN_QUERY_LENGTH = 2;
export const MAX_QUERY_LENGTH = 120;

export type FamilyResolution =
  | { ok: true; family: GovExamFamily | null }
  | { ok: false; message: string };

/** Empty / missing family means "all families", not an error. */
export function resolveFamily(raw: unknown): FamilyResolution {
  if (raw === undefined || raw === null) return { ok: true, family: null };
  if (typeof raw !== "string") {
    return { ok: false, message: "Family must be a string." };
  }
  const value = raw.trim().toLowerCase();
  if (!value) return { ok: true, family: null };
  if ((GOV_EXAM_FAMILIES as readonly string[]).includes(value)) {
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

function positiveInt(raw: unknown, fallback: number): number {
  const n = Number(raw);
  if (!Number.isFinite(n)) return fallback;
  const floored = Math.floor(n);
  return floored >= 1 ? floored : fallback;
}

/** Clamps page/pageSize so a client cannot ask for the whole registry. */
export function resolvePagination(input: {
  page?: unknown;
  pageSize?: unknown;
}): PageRequest {
  const page = positiveInt(input.page, DEFAULT_PAGE);
  const pageSize = Math.min(
    MAX_PAGE_SIZE,
    positiveInt(input.pageSize, DEFAULT_PAGE_SIZE),
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
  return `p${Math.max(1, Math.floor(page))}`;
}

export function decodeSearchCursor(raw: unknown): number | null {
  if (typeof raw !== "string") return null;
  const m = /^p(\d+)$/i.exec(raw.trim());
  if (!m) return null;
  const page = Number(m[1]);
  return Number.isFinite(page) && page >= 1 ? Math.floor(page) : null;
}

export function buildPagination(
  request: Pick<PageRequest, "page" | "pageSize">,
  total: number,
): PaginationPayload {
  const safeTotal = Number.isFinite(total) && total > 0 ? Math.floor(total) : 0;
  const totalPages = safeTotal === 0 ? 0 : Math.ceil(safeTotal / request.pageSize);
  const hasMore = request.page < totalPages;
  return {
    page: request.page,
    pageSize: request.pageSize,
    total: safeTotal,
    totalPages,
    hasMore,
    nextCursor: hasMore ? encodeSearchCursor(request.page + 1) : null,
  };
}

/** Escapes PostgREST `or=` reserved characters in a user query. */
export function escapeIlikePattern(query: string): string {
  return query.replace(/[%_,()\\]/g, (match) => `\\${match}`);
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
    .trim()
    .slice(0, MAX_QUERY_LENGTH);
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
  const pattern = `%${escapeIlikePattern(query)}%`;
  return [
    `name.ilike.${pattern}`,
    `code.ilike.${pattern}`,
    `description.ilike.${pattern}`,
    `legacy_exam_type.ilike.${pattern}`,
  ].join(",");
}

export type RankableExam = {
  code?: string | null;
  name?: string | null;
  aliases?: string[] | null;
  recruitingBody?: { name?: string | null; code?: string | null } | null;
  family?: string | null;
};

function norm(s: string | null | undefined): string {
  return (s ?? "").normalize("NFC").trim().toLowerCase();
}

/** Lower score = better match. Used to re-order a page of results. */
export function examSearchRankScore(exam: RankableExam, query: string): number {
  const q = norm(query);
  if (!q) return 1000;
  const code = norm(exam.code);
  const name = norm(exam.name);
  const aliases = (exam.aliases ?? []).map(norm).filter(Boolean);
  const bodyName = norm(exam.recruitingBody?.name);
  const bodyCode = norm(exam.recruitingBody?.code);

  if (code === q) return 0;
  if (name === q) return 1;
  if (aliases.some((a) => a === q)) return 2;
  if (code.startsWith(q) || name.startsWith(q)) return 3;
  if (aliases.some((a) => a.startsWith(q))) return 4;
  if (bodyName === q || bodyCode === q) return 5;
  if (bodyName.startsWith(q) || bodyName.includes(q)) return 6;
  if (name.includes(q) || code.includes(q) || aliases.some((a) => a.includes(q))) {
    return 7;
  }
  // Cheap trigram-ish: shared character overlap ratio
  const hay = `${name} ${code} ${aliases.join(" ")} ${bodyName}`;
  let shared = 0;
  const seen = new Set<string>();
  for (const ch of q) {
    if (seen.has(ch)) continue;
    seen.add(ch);
    if (hay.includes(ch)) shared += 1;
  }
  const overlap = q.length === 0 ? 0 : shared / q.length;
  return 8 + (1 - overlap);
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
