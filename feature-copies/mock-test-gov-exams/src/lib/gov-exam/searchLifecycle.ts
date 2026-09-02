/**
 * Government exam search request lifecycle.
 *
 * Profile/auth failures must not own the search spinner. Every in-flight
 * search either settles (results / empty / typed error) or is aborted in
 * favour of a newer query — never "Searching…" forever.
 */

import {
  GOV_SEARCH_TIMEOUT_MS,
  mapGovSearchError,
  searchGovExams,
  type GovExamSearchResult,
} from "@/lib/gov-exam/api";

export { GOV_SEARCH_TIMEOUT_MS };

/** UI watchdog slightly above the network budget so a hung fetch still clears. */
export const GOV_SEARCH_WATCHDOG_MS =
  import.meta.env.MODE === "test" ? 200 : GOV_SEARCH_TIMEOUT_MS + 3_000;
/** Coalesce identical q+family callers so Abort storms do not burn quota. */
export const IDENTICAL_INFLIGHT_WINDOW_MS = 800;
export const SEARCH_CACHE_TTL_MS = 60_000;
export const RATE_LIMIT_COOLDOWN_MS = 8_000;

export type GovSearchErrorCode =
  | "RATE_LIMITED"
  | "INVALID_QUERY"
  | "SEARCH_UNAVAILABLE"
  | "SEARCH_FAILED"
  | "SEARCH_TIMEOUT"
  | "AUTH_REQUIRED";

export type GovSearchUiState = "idle" | "loading" | "empty" | "error";

export type GovSearchFailureAction =
  | { action: "ignore" }
  | { action: "idle" }
  | { action: "error"; code: GovSearchErrorCode; message: string; retryable: boolean };

export function isAbortLike(err: unknown): boolean {
  if (!err) return false;
  if (typeof err === "object" && "name" in err) {
    const name = String((err as { name?: unknown }).name ?? "");
    if (name === "AbortError" || name === "TimeoutError") return true;
  }
  const msg = err instanceof Error ? err.message : String(err);
  return /cancelled|aborted|aborterror/i.test(msg);
}

export function isTimeoutLike(err: unknown): boolean {
  if (!err) return false;
  const code = String((err as { code?: unknown } | null)?.code ?? "").toUpperCase();
  if (code === "SEARCH_TIMEOUT" || code === "TIMEOUT") return true;
  const msg = err instanceof Error ? err.message : String(err);
  return /timed out|timeout/i.test(msg);
}

export function isAuthRequiredLike(err: unknown): boolean {
  const status = (err as { status?: number } | null)?.status;
  const code = String((err as { code?: unknown } | null)?.code ?? "").toUpperCase();
  return (
    status === 401 ||
    code === "AUTH_REQUIRED" ||
    code === "AUTH_EXPIRED" ||
    code === "AUTH_INVALID" ||
    code === "UNAUTHORIZED"
  );
}

/**
 * Decide how search UI should settle after a failed/aborted request.
 * A superseded request never touches the spinner — the newer request owns it.
 * Timeouts always become a retryable error (never leave Searching…).
 */
export function classifyGovSearchFailure(input: {
  err?: unknown;
  superseded: boolean;
  currentAborted: boolean;
  timedOut?: boolean;
}): GovSearchFailureAction {
  if (input.superseded) return { action: "ignore" };

  if (input.timedOut || isTimeoutLike(input.err)) {
    return {
      action: "error",
      code: "SEARCH_TIMEOUT",
      message: "Search timed out. Please try again.",
      retryable: true,
    };
  }

  if (input.currentAborted || isAbortLike(input.err)) {
    return { action: "idle" };
  }

  const mapped = mapGovSearchError(input.err);
  return {
    action: "error",
    code: mapped.code,
    message: mapped.message,
    retryable: mapped.code !== "INVALID_QUERY",
  };
}

export function searchUiStateFromResults(results: GovExamSearchResult[]): Exclude<
  GovSearchUiState,
  "loading" | "error"
> {
  return results.length === 0 ? "empty" : "idle";
}

type SearchCacheEntry = {
  q: string;
  family: string;
  results: GovExamSearchResult[];
  at: number;
};

type InFlightEntry = {
  promise: Promise<{ results: GovExamSearchResult[] }>;
  controller: AbortController;
  waiters: number;
  at: number;
};

let searchResultCache: SearchCacheEntry | null = null;
const inFlightSearches = new Map<string, InFlightEntry>();
let rateLimitUntil = 0;

export function inflightKeyFor(q: string, family: string | undefined): string {
  return `${q}::${family || ""}`;
}

export function readSearchCache(
  q: string,
  family: string | undefined,
): GovExamSearchResult[] | null {
  const entry = searchResultCache;
  if (!entry) return null;
  if (Date.now() - entry.at > SEARCH_CACHE_TTL_MS) return null;
  if (entry.q !== q || entry.family !== (family || "")) return null;
  return entry.results;
}

export function writeSearchCache(
  q: string,
  family: string | undefined,
  results: GovExamSearchResult[],
): void {
  searchResultCache = { q, family: family || "", results, at: Date.now() };
}

export function isSearchRateLimited(now = Date.now()): boolean {
  return now < rateLimitUntil;
}

export function markSearchRateLimited(now = Date.now()): void {
  rateLimitUntil = now + RATE_LIMIT_COOLDOWN_MS;
}

function attachWaiter(entry: InFlightEntry, signal?: AbortSignal): void {
  entry.waiters += 1;
  if (!signal) return;
  const onAbort = () => {
    entry.waiters = Math.max(0, entry.waiters - 1);
    if (entry.waiters === 0 && !entry.controller.signal.aborted) {
      entry.controller.abort();
    }
  };
  if (signal.aborted) {
    onAbort();
    return;
  }
  signal.addEventListener("abort", onAbort, { once: true });
}

/**
 * Deduplicate concurrent identical searches. Aborting a waiter only cancels
 * the shared request when no other waiter remains — so a remount / nonce
 * retry can join an in-flight browse without Abort storms.
 */
export function shareInFlightSearch(
  key: string,
  signal: AbortSignal | undefined,
  start: (signal: AbortSignal) => Promise<{ results: GovExamSearchResult[] }>,
): Promise<{ results: GovExamSearchResult[] }> {
  const existing = inFlightSearches.get(key);
  if (
    existing &&
    Date.now() - existing.at < IDENTICAL_INFLIGHT_WINDOW_MS &&
    !existing.controller.signal.aborted
  ) {
    attachWaiter(existing, signal);
    return existing.promise;
  }

  const controller = new AbortController();
  const promise = start(controller.signal).finally(() => {
    const cur = inFlightSearches.get(key);
    if (cur?.promise === promise) inFlightSearches.delete(key);
  });
  const entry: InFlightEntry = {
    promise,
    controller,
    waiters: 0,
    at: Date.now(),
  };
  inFlightSearches.set(key, entry);
  attachWaiter(entry, signal);
  return promise;
}

export async function runSharedGovSearch(
  params: { q: string; family?: string },
  options?: { signal?: AbortSignal },
): Promise<{ results: GovExamSearchResult[] }> {
  const key = inflightKeyFor(params.q, params.family);
  return shareInFlightSearch(key, options?.signal, (signal) =>
    searchGovExams(params, { signal }),
  );
}

export function resetGovSearchLifecycleForTests(): void {
  searchResultCache = null;
  inFlightSearches.clear();
  rateLimitUntil = 0;
}
