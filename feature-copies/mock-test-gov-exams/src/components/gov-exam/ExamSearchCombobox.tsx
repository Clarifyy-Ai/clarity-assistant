import { useCallback, useEffect, useId, useRef, useState } from "react";
import { Loader2, Search } from "lucide-react";
import {
  mapGovSearchError,
  searchGovExams,
  type GovExamSearchResult,
} from "@/lib/gov-exam/api";
import { formatBankCoverage } from "@/lib/gov-exam/bankReadiness";
import { Button } from "@/components/ui/Button";
import { InlineErrorRetry } from "@/components/common/InlineErrorRetry";

const DEBOUNCE_MS = 280;
const SEARCH_CACHE_TTL_MS = 60_000;
const MAX_QUERY_LENGTH = 120;
const IDENTICAL_INFLIGHT_WINDOW_MS = 800;
const RATE_LIMIT_COOLDOWN_MS = 8_000;

type SearchCacheEntry = {
  q: string;
  family: string;
  results: GovExamSearchResult[];
  at: number;
};

type InFlightEntry = {
  promise: Promise<{ results: GovExamSearchResult[] }>;
  at: number;
};

/** Survives remounts so browse/search does not flash Searching… after a good hit. */
let searchResultCache: SearchCacheEntry | null = null;
/** Coalesce identical q+family requests so Abort storms do not burn rate-limit quota. */
const inFlightSearches = new Map<string, InFlightEntry>();
let rateLimitUntil = 0;

function readSearchCache(q: string, family: string | undefined): GovExamSearchResult[] | null {
  const entry = searchResultCache;
  if (!entry) return null;
  if (Date.now() - entry.at > SEARCH_CACHE_TTL_MS) return null;
  if (entry.q !== q || entry.family !== (family || "")) return null;
  return entry.results;
}

function writeSearchCache(q: string, family: string | undefined, results: GovExamSearchResult[]) {
  searchResultCache = { q, family: family || "", results, at: Date.now() };
}

export type ExamSearchComboboxProps = {
  value: string;
  onSelect: (exam: GovExamSearchResult) => void;
  onClear?: () => void;
  family?: string;
  placeholder?: string;
  disabled?: boolean;
  onRequestExam?: (query: string) => void;
  /** Fired whenever the live result list changes (for parent result panels). */
  onResultsChange?: (results: GovExamSearchResult[], meta: {
    state: "idle" | "loading" | "empty" | "error";
    error: string | null;
    query: string;
  }) => void;
  className?: string;
  /** When true, empty query still loads the published registry list. */
  browseWhenEmpty?: boolean;
  initialQuery?: string;
  /** When this changes, the input query is replaced (e.g. recent chips). */
  syncQuery?: string;
};

function examOptionId(listId: string, examId: string): string {
  return `${listId}-opt-${examId}`;
}

function examDisplayName(exam: GovExamSearchResult): string {
  return exam.shortName?.trim() || exam.name;
}

function examCategoryLabel(exam: GovExamSearchResult): string | null {
  const state = exam.stateCode?.trim();
  if (state) return state;
  const jurisdiction = exam.jurisdiction?.trim();
  if (jurisdiction) return jurisdiction;
  const family = exam.family?.trim();
  return family || null;
}

function examVerificationLabel(exam: GovExamSearchResult): string | null {
  const raw = exam.verifiedAt ?? exam.lastVerified;
  if (!raw) return null;
  const iso = String(raw).slice(0, 10);
  return iso || null;
}

function examStageLabel(exam: GovExamSearchResult): string | null {
  if (exam.stage?.name) return exam.stage.name;
  if (exam.stages?.length === 1) return exam.stages[0].name;
  if (exam.stages?.length) return `${exam.stages.length} stage(s)`;
  return null;
}

export function ExamSearchCombobox({
  value,
  onSelect,
  onClear,
  family,
  placeholder = "Search exam, alias, recruiting body…",
  disabled,
  onRequestExam,
  onResultsChange,
  className,
  browseWhenEmpty = true,
  initialQuery = "",
  syncQuery,
}: ExamSearchComboboxProps): React.ReactElement {
  const listId = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const [query, setQuery] = useState(initialQuery);
  const [open, setOpen] = useState(false);
  const [results, setResults] = useState<GovExamSearchResult[]>([]);
  const [state, setState] = useState<"idle" | "loading" | "empty" | "error">("idle");
  const [error, setError] = useState<string | null>(null);
  const [activeIndex, setActiveIndex] = useState(-1);
  const [picked, setPicked] = useState<GovExamSearchResult | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const reqIdRef = useRef(0);
  const resultsRef = useRef<GovExamSearchResult[]>([]);
  resultsRef.current = results;
  // Keep parent callbacks / family out of runSearch deps — inline onResultsChange
  // (e.g. MockTestHub setState) would otherwise recreate runSearch every render,
  // re-debounce, abort the in-flight request, and spin forever.
  const onResultsChangeRef = useRef(onResultsChange);
  onResultsChangeRef.current = onResultsChange;
  const familyRef = useRef(family);
  familyRef.current = family;


  // Hydrate from remount-safe cache so empty browse does not blank the list.
  useEffect(() => {
    const cached = readSearchCache(query.trim().length >= 2 ? query.trim() : "", family);
    if (cached && cached.length > 0 && results.length === 0) {
      setResults(cached);
      setState("idle");
      onResultsChangeRef.current?.(cached, {
        state: "idle",
        error: null,
        query: query.trim(),
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const selected =
    (value && picked?.examId === value ? picked : null) ??
    results.find((r) => r.examId === value) ??
    null;

  useEffect(() => {
    if (typeof syncQuery === "string" && syncQuery !== query) {
      setQuery(syncQuery);
      setOpen(true);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [syncQuery]);

  const runSearch = useCallback(
    async (q: string) => {
      abortRef.current?.abort();
      const ac = new AbortController();
      abortRef.current = ac;
      const reqId = ++reqIdRef.current;
      const trimmed = q.trim().slice(0, MAX_QUERY_LENGTH);
      const notify = onResultsChangeRef.current;
      if (trimmed.length === 1) {
        setResults([]);
        setState("idle");
        setError(null);
        setActiveIndex(-1);
        notify?.([], { state: "idle", error: null, query: trimmed });
        return;
      }
      if (!browseWhenEmpty && !trimmed) {
        setResults([]);
        setState("idle");
        notify?.([], { state: "idle", error: null, query: "" });
        return;
      }
      const cacheKey = trimmed.length >= 2 ? trimmed : "";
      const familyKey = familyRef.current || "";
      const inflightKey = `${cacheKey}::${familyKey}`;
      // Only soft-refresh from a cache entry for THIS query — never reuse
      // resultsRef from a different search (that caused stuck spinners / stale cards).
      const cached = readSearchCache(cacheKey, familyRef.current);
      const softRefresh = Boolean(cached && cached.length > 0);
      if (!softRefresh) {
        setState("loading");
        setError(null);
        notify?.([], { state: "loading", error: null, query: trimmed });
      } else {
        // Keep matching cached hits visible while refreshing (remount / focus).
        setError(null);
        if (resultsRef.current.length === 0 && cached) {
          setResults(cached);
          setState("idle");
        }
      }

      if (Date.now() < rateLimitUntil) {
        const mapped = mapGovSearchError({ code: "RATE_LIMITED", status: 429 });
        setResults([]);
        setState("error");
        setError(mapped.message);
        notify?.([], { state: "error", error: mapped.message, query: trimmed });
        return;
      }

      try {
        let data: { results: GovExamSearchResult[] };
        const existing = inFlightSearches.get(inflightKey);
        if (existing && Date.now() - existing.at < IDENTICAL_INFLIGHT_WINDOW_MS) {
          data = await existing.promise;
        } else {
          const promise = searchGovExams(
            {
              q: trimmed.length >= 2 ? trimmed : "",
              family: familyRef.current || undefined,
            },
            { signal: ac.signal },
          ).finally(() => {
            const cur = inFlightSearches.get(inflightKey);
            if (cur?.promise === promise) inFlightSearches.delete(inflightKey);
          });
          inFlightSearches.set(inflightKey, { promise, at: Date.now() });
          data = await promise;
        }
        if (reqId !== reqIdRef.current) {
          return;
        }
        if (ac.signal.aborted) {
          setState("idle");
          setError(null);
          notify?.(resultsRef.current, {
            state: "idle",
            error: null,
            query: trimmed,
          });
          return;
        }
        writeSearchCache(cacheKey, familyRef.current, data.results);
        setResults(data.results);
        const nextState = data.results.length === 0 ? "empty" : "idle";
        setState(nextState);
        setActiveIndex(data.results.length > 0 ? 0 : -1);
        notify?.(data.results, {
          state: nextState,
          error: null,
          query: trimmed,
        });
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err ?? "");
        const superseded = reqId !== reqIdRef.current;
        const aborted = ac.signal.aborted;
        const cancelMsg = /cancelled|aborted/i.test(msg);
        // Newer request owns UI state — do not clear its loading spinner.
        if (superseded) return;
        // Abort/cancel of the *current* request must not leave Searching… (DEF-001).
        if (aborted || cancelMsg) {
          setState("idle");
          setError(null);
          notify?.(resultsRef.current, {
            state: "idle",
            error: null,
            query: trimmed,
          });
          return;
        }
        // Never keep a stale / fake list after a search failure (e.g. 503).
        setResults([]);
        const mapped = mapGovSearchError(err);
        if (mapped.code === "RATE_LIMITED") {
          rateLimitUntil = Date.now() + RATE_LIMIT_COOLDOWN_MS;
        }
        setState("error");
        setError(mapped.message);
        notify?.([], {
          state: "error",
          error: mapped.message,
          query: trimmed,
        });
      }
    },
    [browseWhenEmpty],
  );

  useEffect(() => {
    const t = window.setTimeout(() => {
      void runSearch(query);
    }, DEBOUNCE_MS);
    return () => window.clearTimeout(t);
  }, [query, family, runSearch]);

  useEffect(() => {
    return () => abortRef.current?.abort();
  }, []);

  function selectAt(index: number) {
    const exam = results[index];
    if (!exam) return;
    setPicked(exam);
    onSelect(exam);
    setQuery(examDisplayName(exam));
    setOpen(false);
    setActiveIndex(-1);
    inputRef.current?.focus();
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      if (!open) {
        setOpen(true);
        void runSearch(query);
        return;
      }
      if (results.length === 0) return;
      setActiveIndex((i) => (i + 1) % results.length);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      if (!open || results.length === 0) return;
      setActiveIndex((i) => (i <= 0 ? results.length - 1 : i - 1));
    } else if (e.key === "Enter") {
      if (open && activeIndex >= 0) {
        e.preventDefault();
        selectAt(activeIndex);
      }
    } else if (e.key === "Escape") {
      if (open) {
        e.preventDefault();
        setOpen(false);
        setActiveIndex(-1);
      }
    } else if (e.key === "Home" && open && results.length) {
      e.preventDefault();
      setActiveIndex(0);
    } else if (e.key === "End" && open && results.length) {
      e.preventDefault();
      setActiveIndex(results.length - 1);
    }
  }

  const activeId =
    open && activeIndex >= 0 && results[activeIndex]
      ? examOptionId(listId, results[activeIndex].examId)
      : undefined;

  return (
    <div className={className ?? "relative space-y-2"}>
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
        <input
          ref={inputRef}
          type="text"
          role="combobox"
          aria-expanded={open}
          aria-controls={listId}
          aria-autocomplete="list"
          aria-activedescendant={activeId}
          aria-haspopup="listbox"
          aria-label="Search government exams"
          disabled={disabled}
          value={query}
          maxLength={MAX_QUERY_LENGTH}
          placeholder={placeholder}
          className="w-full rounded-xl border border-border bg-background pl-10 pr-4 py-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          onChange={(e) => {
            setQuery(e.target.value.slice(0, MAX_QUERY_LENGTH));
            setOpen(true);
            if (value && onClear) {
              setPicked(null);
              onClear();
            }
          }}
          onFocus={() => {
            setOpen(true);
          }}
          onKeyDown={onKeyDown}
          onBlur={() => {
            // Delay so option click can fire first.
            window.setTimeout(() => setOpen(false), 150);
          }}
        />
        {state === "loading" && (
          <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 animate-spin text-muted-foreground" />
        )}
      </div>

      {selected && !open && (
        <p className="text-xs text-muted-foreground" aria-live="polite">
          Selected: {examDisplayName(selected)} ({selected.code})
          {selected.recruitingBody?.name ? ` · ${selected.recruitingBody.name}` : ""}
        </p>
      )}

      {open && (
        <div
          id={listId}
          role="listbox"
          aria-label="Government exam results"
          className="absolute z-40 mt-1 w-full max-h-72 overflow-auto rounded-xl border border-border bg-popover shadow-md"
        >
          {state === "loading" && results.length === 0 && (
            <p className="px-3 py-3 text-sm text-muted-foreground">Searching…</p>
          )}
          {state === "error" && error && (
            <div className="p-3">
              {/* When parent owns onResultsChange, it renders the primary banner —
                  keep a compact message here to avoid stacked duplicate retries. */}
              {onResultsChange ? (
                <p className="text-sm text-destructive" role="alert">
                  {error}
                </p>
              ) : (
                <InlineErrorRetry
                  message={error}
                  onRetry={() => void runSearch(query)}
                />
              )}
            </div>
          )}
          {state === "empty" && (
            <div className="p-3 space-y-2">
              <p className="text-sm text-muted-foreground">No exams found.</p>
              {onRequestExam && (
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => onRequestExam(query.trim() || "unknown")}
                >
                  Request this exam
                </Button>
              )}
            </div>
          )}
          {state !== "error" &&
            results.map((exam, index) => {
              const bank = exam.bankReadiness;
              const active = index === activeIndex;
              const category = examCategoryLabel(exam);
              const stage = examStageLabel(exam);
              const verified = examVerificationLabel(exam);
              const approved = bank?.approvedPublicCount;
              return (
                <button
                  key={exam.examId}
                  type="button"
                  id={examOptionId(listId, exam.examId)}
                  role="option"
                  aria-selected={exam.examId === value || active}
                  className={`w-full text-left px-3 py-2.5 border-b border-border/40 last:border-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring ${
                    active ? "bg-secondary/70" : "hover:bg-secondary/40"
                  }`}
                  onMouseDown={(e) => e.preventDefault()}
                  onMouseEnter={() => setActiveIndex(index)}
                  onClick={() => selectAt(index)}
                >
                  <p className="text-sm font-medium text-foreground truncate">
                    {examDisplayName(exam)}
                    {exam.shortName && exam.shortName !== exam.name ? (
                      <span className="font-normal text-muted-foreground"> · {exam.name}</span>
                    ) : null}
                  </p>
                  <p className="text-xs text-muted-foreground truncate">
                    {exam.code}
                    {exam.recruitingBody?.name ? ` · ${exam.recruitingBody.name}` : ""}
                    {category ? ` · ${category}` : ""}
                    {stage ? ` · ${stage}` : ""}
                    {exam.languages?.length ? ` · ${exam.languages.join("/")}` : ""}
                  </p>
                  <p className="text-xs mt-0.5 text-muted-foreground">
                    {typeof approved === "number"
                      ? bank
                        ? `Bank ${formatBankCoverage(approved, bank.requiredQuestions)}`
                        : `${approved} approved`
                      : null}
                    {typeof approved === "number" && verified ? " · " : null}
                    {verified ? `verified ${verified}` : null}
                    {typeof approved !== "number" && !verified && bank
                      ? `Bank ${formatBankCoverage(bank.approvedPublicCount, bank.requiredQuestions)}`
                      : null}
                  </p>
                </button>
              );
            })}
        </div>
      )}

      <span className="sr-only" aria-live="polite">
        {open && activeIndex >= 0 && results[activeIndex]
          ? `${examDisplayName(results[activeIndex])}, ${results[activeIndex].code}`
          : state === "empty"
            ? "No exams found"
            : state === "error"
              ? error ?? "Search error"
              : ""}
      </span>
    </div>
  );
}
