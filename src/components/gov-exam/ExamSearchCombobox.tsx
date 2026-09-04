import { useCallback, useEffect, useId, useRef, useState } from "react";
import { Loader2, Search } from "lucide-react";
import {
  mapGovSearchError,
  type GovExamSearchResult,
} from "@/lib/gov-exam/api";
import {
  GOV_SEARCH_WATCHDOG_MS,
  classifyGovSearchFailure,
  inflightKeyFor,
  isSearchRateLimited,
  markSearchRateLimited,
  readSearchCache,
  resetGovSearchLifecycleForTests,
  runSharedGovSearch,
  searchUiStateFromResults,
  writeSearchCache,
} from "@/lib/gov-exam/searchLifecycle";
import { formatBankCoverage } from "@/lib/gov-exam/bankReadiness";
import { Button } from "@/components/ui/Button";
import { InlineErrorRetry } from "@/components/common/InlineErrorRetry";
import { debugLog161d95 } from "@/lib/debug/debugLog161d95";

const DEBOUNCE_MS = 280;
const MAX_QUERY_LENGTH = 120;

export { resetGovSearchLifecycleForTests };

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
  /** Increment to force a re-search for the current query (e.g. hub retry). */
  searchNonce?: number;
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

function examAliasesLabel(exam: GovExamSearchResult): string | null {
  const aliases = (exam.aliases ?? [])
    .map((alias) => alias.trim())
    .filter(
      (alias) =>
        alias &&
        alias.toLowerCase() !== exam.name.trim().toLowerCase() &&
        alias.toLowerCase() !== exam.shortName?.trim().toLowerCase(),
    );
  return aliases.length ? aliases.slice(0, 4).join(", ") : null;
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
  searchNonce = 0,
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
  const inflightKeyRef = useRef<string | null>(null);
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
      const ac = new AbortController();
      const reqId = ++reqIdRef.current;
      const trimmed = q.trim().slice(0, MAX_QUERY_LENGTH);
      const notify = onResultsChangeRef.current;
      if (trimmed.length === 1) {
        abortRef.current?.abort();
        abortRef.current = ac;
        inflightKeyRef.current = null;
        setResults([]);
        setState("idle");
        setError(null);
        setActiveIndex(-1);
        notify?.([], { state: "idle", error: null, query: trimmed });
        return;
      }
      if (!browseWhenEmpty && !trimmed) {
        abortRef.current?.abort();
        abortRef.current = ac;
        inflightKeyRef.current = null;
        setResults([]);
        setState("idle");
        notify?.([], { state: "idle", error: null, query: "" });
        return;
      }
      const cacheKey = trimmed.length >= 2 ? trimmed : "";
      const nextKey = inflightKeyFor(cacheKey, familyRef.current);
      // Abort stale queries only. Reusing the same q+family must not cancel
      // the shared in-flight request (identical-key remount / nonce retry).
      if (inflightKeyRef.current !== nextKey) {
        abortRef.current?.abort();
      }
      abortRef.current = ac;
      inflightKeyRef.current = nextKey;
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

      if (isSearchRateLimited()) {
        const mapped = mapGovSearchError({ code: "RATE_LIMITED", status: 429 });
        setResults([]);
        setState("error");
        setError(mapped.message);
        notify?.([], { state: "error", error: mapped.message, query: trimmed });
        return;
      }

      let timedOut = false;
      const applyTimeoutUi = () => {
        setResults([]);
        setState("error");
        setError("Search timed out. Please try again.");
        notify?.([], {
          state: "error",
          error: "Search timed out. Please try again.",
          query: trimmed,
        });
      };
      const watchdog = window.setTimeout(() => {
        if (reqId !== reqIdRef.current) return;
        timedOut = true;
        if (!ac.signal.aborted) ac.abort();
        // Settle immediately — a hung fetch/auth probe may never reject.
        applyTimeoutUi();
      }, GOV_SEARCH_WATCHDOG_MS);

      try {
        const data = await runSharedGovSearch(
          {
            q: trimmed.length >= 2 ? trimmed : "",
            family: familyRef.current || undefined,
          },
          { signal: ac.signal },
        );
        if (reqId !== reqIdRef.current || timedOut) {
          return;
        }
        if (ac.signal.aborted) {
          const settled = classifyGovSearchFailure({
            err: new Error("aborted"),
            superseded: false,
            currentAborted: true,
            timedOut,
          });
          if (settled.action === "error") {
            setResults([]);
            setState("error");
            setError(settled.message);
            notify?.([], { state: "error", error: settled.message, query: trimmed });
          } else if (settled.action === "idle") {
            setState("idle");
            setError(null);
            notify?.(resultsRef.current, {
              state: "idle",
              error: null,
              query: trimmed,
            });
          }
          return;
        }
        writeSearchCache(cacheKey, familyRef.current, data.results);
        setResults(data.results);
        const nextState = searchUiStateFromResults(data.results);
        // #region agent log
        debugLog161d95({
          hypothesisId: "H1",
          location: "ExamSearchCombobox.tsx:runSearch:ok",
          message: "gov_search_terminal",
          data: { query: trimmed.slice(0, 80), resultCount: data.results.length, nextState },
        });
        // #endregion
        setState(nextState);
        setActiveIndex(data.results.length > 0 ? 0 : -1);
        notify?.(data.results, {
          state: nextState,
          error: null,
          query: trimmed,
        });
        // Parent renders actionable result rows — keep listbox from covering View/Generate/Full sim Links.
        if (onResultsChangeRef.current && (nextState as string) === "success") {
          setOpen(false);
          setActiveIndex(-1);
        }
      } catch (err) {
        const superseded = reqId !== reqIdRef.current;
        const aborted = ac.signal.aborted;
        const settled = classifyGovSearchFailure({
          err,
          superseded: superseded || timedOut,
          currentAborted: aborted,
          timedOut,
        });
        // Newer request owns UI state — do not clear its loading spinner.
        if (settled.action === "ignore") return;
        // Abort/cancel of the *current* request must not leave Searching… (DEF-001).
        if (settled.action === "idle") {
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
        if (settled.code === "RATE_LIMITED") {
          markSearchRateLimited();
        }
        setState("error");
        setError(settled.message);
        // #region agent log
        debugLog161d95({
          hypothesisId: "H1",
          location: "ExamSearchCombobox.tsx:runSearch:error",
          message: "gov_search_error",
          data: {
            query: trimmed.slice(0, 80),
            code: settled.code,
            status: (err as { status?: number })?.status ?? null,
            message: settled.message.slice(0, 160),
          },
        });
        // #endregion
        notify?.([], {
          state: "error",
          error: settled.message,
          query: trimmed,
        });
      } finally {
        window.clearTimeout(watchdog);
      }
    },
    [browseWhenEmpty],
  );

  useEffect(() => {
    if (searchNonce <= 0) return;
    void runSearch(typeof syncQuery === "string" ? syncQuery : query);
  }, [searchNonce, syncQuery, query, runSearch]);

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
    inputRef.current?.blur();
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
          className="absolute z-30 mt-1 w-full max-h-72 overflow-auto rounded-xl border border-border bg-popover shadow-md"
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
              const aliases = examAliasesLabel(exam);
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
                  {aliases && (
                    <p className="text-xs text-muted-foreground truncate">
                      Also known as: {aliases}
                    </p>
                  )}
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
