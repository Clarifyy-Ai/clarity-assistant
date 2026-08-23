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
      const trimmed = q.trim();
      if (trimmed.length === 1) {
        setState("idle");
        onResultsChange?.([], { state: "idle", error: null, query: trimmed });
        return;
      }
      if (!browseWhenEmpty && !trimmed) {
        setResults([]);
        setState("idle");
        onResultsChange?.([], { state: "idle", error: null, query: "" });
        return;
      }
      setState("loading");
      setError(null);
      onResultsChange?.([], { state: "loading", error: null, query: trimmed });
      try {
        const data = await searchGovExams(
          { q: trimmed.length >= 2 ? trimmed : "", family: family || undefined },
          { signal: ac.signal },
        );
        if (reqId !== reqIdRef.current) return;
        setResults(data.results);
        const nextState = data.results.length === 0 ? "empty" : "idle";
        setState(nextState);
        setActiveIndex(data.results.length > 0 ? 0 : -1);
        onResultsChange?.(data.results, {
          state: nextState,
          error: null,
          query: trimmed,
        });
      } catch (err) {
        if (ac.signal.aborted) return;
        if (reqId !== reqIdRef.current) return;
        // Never keep a stale / fake list after a search failure (e.g. 503).
        setResults([]);
        const mapped = mapGovSearchError(err);
        setState("error");
        setError(mapped.message);
        onResultsChange?.([], {
          state: "error",
          error: mapped.message,
          query: trimmed,
        });
      }
    },
    [browseWhenEmpty, family, onResultsChange],
  );

  useEffect(() => {
    const t = window.setTimeout(() => {
      void runSearch(query);
    }, DEBOUNCE_MS);
    return () => window.clearTimeout(t);
  }, [query, runSearch]);

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
          placeholder={placeholder}
          className="w-full rounded-xl border border-border bg-background pl-10 pr-4 py-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          onChange={(e) => {
            setQuery(e.target.value);
            setOpen(true);
            if (value && onClear) {
              setPicked(null);
              onClear();
            }
          }}
          onFocus={() => {
            setOpen(true);
            void runSearch(query);
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
              <InlineErrorRetry
                message={error}
                onRetry={() => void runSearch(query)}
              />
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
