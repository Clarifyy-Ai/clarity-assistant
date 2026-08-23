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
export const SEARCH_SERVICE_UNAVAILABLE_MESSAGE =
  "Exam search is temporarily unavailable. Please try again.";

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
};

export function buildPagination(
  request: Pick<PageRequest, "page" | "pageSize">,
  total: number,
): PaginationPayload {
  const safeTotal = Number.isFinite(total) && total > 0 ? Math.floor(total) : 0;
  const totalPages = safeTotal === 0 ? 0 : Math.ceil(safeTotal / request.pageSize);
  return {
    page: request.page,
    pageSize: request.pageSize,
    total: safeTotal,
    totalPages,
    hasMore: request.page < totalPages,
  };
}

/** Escapes PostgREST `or=` reserved characters in a user query. */
export function escapeIlikePattern(query: string): string {
  return query.replace(/[%_,()\\]/g, (match) => `\\${match}`);
}

/** PostgREST `or` filter for the searchable gov_exams columns. */
export function buildExamOrFilter(query: string): string {
  const pattern = `%${escapeIlikePattern(query)}%`;
  return [
    `name.ilike.${pattern}`,
    `code.ilike.${pattern}`,
    `description.ilike.${pattern}`,
  ].join(",");
}
