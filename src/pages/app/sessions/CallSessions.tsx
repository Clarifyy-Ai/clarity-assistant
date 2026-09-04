import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { useAuthStore } from "@/store/userStore";
import { sessionsDB } from "@/lib/supabase/database";
import { toast } from "sonner";
import { PageHeader } from "@/components/layout/PageHeader";
import { EmptyState } from "@/components/common/EmptyState";
import { InlineErrorRetry } from "@/components/common/InlineErrorRetry";
import { ConfirmDialog } from "@/components/common/ConfirmDialog";
import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { Input } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";
import { SkeletonCard } from "@/components/ui/SkeletonLoader";
import { usePageMeta } from "@/hooks/usePageMeta";
import { cn } from "@/lib/utils";
import {
  Mic,
  Search,
  Plus,
  Clock,
  Eye,
  Trash2,
  BookOpen,
  Code2,
  GraduationCap,
  Video,
  Sparkles,
  FileText,
} from "lucide-react";
import { PRODUCT_NAMES } from "@/lib/constants/productNames";
import { formatDistanceToNow } from "date-fns";
import {
  SESSIONS_CHANGED_EVENT,
  LEGACY_SESSIONS_CHANGED_EVENT,
  notifySessionsChanged,
} from "@/lib/session/sessionReuse";
import { subscribeFocusRecovery } from "@/lib/focusRecovery";
import { formatSessionDuration } from "@/lib/session/sessionDisplay";
import {
  fetchSessionHistory,
  SessionHistoryApiError,
} from "@/lib/session/sessionHistoryApi";
import type { SessionHistoryItem } from "@/lib/session/sessionHistoryTypes";
import {
  sessionHistoryScoreDisplay,
  sessionHistoryTypeLabel,
  sessionHistoryContextLine,
  sessionHistoryItemIsDeletable,
} from "@/lib/session/sessionHistoryTypes";
import {
  HISTORY_SORT_OPTIONS,
  HISTORY_STATUS_CHIPS,
  HISTORY_TYPE_CHIPS,
  parseHistorySearchParams,
  writeHistorySearchParams,
} from "@/lib/session/sessionHistoryFilters";

function typeIcon(item: SessionHistoryItem) {
  const t = item.sessionSubtype === "live_copilot" ? "live_copilot" : item.sessionType;
  switch (t) {
    case "live_copilot":
      return Video;
    case "practice_coach":
      return Mic;
    case "mock_interview":
      return Sparkles;
    case "government_exam":
      return GraduationCap;
    case "assessment":
      return FileText;
    case "practice_workspace":
      return BookOpen;
    case "coding_assessment":
      return Code2;
    default:
      return Mic;
  }
}

export default function CallSessions() {
  usePageMeta({ title: PRODUCT_NAMES.sessionHistory });
  const { user } = useAuthStore();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const parsed = useMemo(() => parseHistorySearchParams(searchParams), [searchParams]);

  const [items, setItems] = useState<SessionHistoryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [errorCode, setErrorCode] = useState<string | null>(null);
  const [loadMoreError, setLoadMoreError] = useState<string | null>(null);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(false);
  const [searchDraft, setSearchDraft] = useState(parsed.search ?? "");
  const [pendingDelete, setPendingDelete] = useState<SessionHistoryItem | null>(null);
  const [deleting, setDeleting] = useState(false);
  const fetchGen = useRef(0);

  const filtersActive = Boolean(
    (parsed.typeChip && parsed.typeChip !== "all") ||
      (parsed.statusChip && parsed.statusChip !== "all") ||
      parsed.search ||
      (parsed.scoreState && parsed.scoreState !== "all") ||
      (parsed.debriefState && parsed.debriefState !== "all") ||
      parsed.dateFrom ||
      parsed.dateTo,
  );

  const load = useCallback(
    async (mode: "replace" | "append") => {
      if (!user?.id) return;
      const gen = ++fetchGen.current;
      if (mode === "replace") {
        setLoading(true);
        setError(null);
        setErrorCode(null);
        setLoadMoreError(null);
      } else {
        setLoadingMore(true);
        setLoadMoreError(null);
      }
      try {
        const res = await fetchSessionHistory({
          types: parsed.types,
          statuses: parsed.statuses,
          search: parsed.search,
          dateFrom: parsed.dateFrom,
          dateTo: parsed.dateTo,
          scoreState: parsed.scoreState,
          debriefState: parsed.debriefState,
          sort: parsed.sort,
          cursor: mode === "append" ? nextCursor : null,
          pageSize: 20,
        });
        if (gen !== fetchGen.current) return;
        setItems((prev) => (mode === "append" ? [...prev, ...res.items] : res.items));
        setNextCursor(res.nextCursor);
        setHasMore(res.hasMore);
        setLoadMoreError(null);
      } catch (err) {
        if (gen !== fetchGen.current) return;
        const message =
          err instanceof SessionHistoryApiError
            ? err.message
            : "We couldn’t load your session history.";
        const code = err instanceof SessionHistoryApiError ? err.code : "UNKNOWN";
        if (mode === "append") {
          setLoadMoreError(message);
          toast.error(message);
        } else {
          setError(message);
          setErrorCode(code);
          setItems([]);
          setHasMore(false);
          toast.error(message);
        }
      } finally {
        if (gen === fetchGen.current) {
          setLoading(false);
          setLoadingMore(false);
        }
      }
    },
    [user?.id, parsed, nextCursor],
  );

  useEffect(() => {
    void load("replace");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    user?.id,
    parsed.typeChip,
    parsed.statusChip,
    parsed.search,
    parsed.sort,
    parsed.scoreState,
    parsed.debriefState,
    parsed.dateFrom,
    parsed.dateTo,
  ]);

  useEffect(() => {
    const refetch = () => void load("replace");
    window.addEventListener(SESSIONS_CHANGED_EVENT, refetch);
    window.addEventListener(LEGACY_SESSIONS_CHANGED_EVENT, refetch);
    const unsub = subscribeFocusRecovery((plan) => {
      if (plan.revalidate.includes("sessionsList")) refetch();
    });
    return () => {
      window.removeEventListener(SESSIONS_CHANGED_EVENT, refetch);
      window.removeEventListener(LEGACY_SESSIONS_CHANGED_EVENT, refetch);
      unsub();
    };
  }, [load]);

  useEffect(() => {
    const t = window.setTimeout(() => {
      if ((parsed.search ?? "") === searchDraft) return;
      setSearchParams(
        writeHistorySearchParams(searchParams, { q: searchDraft, cursor: null }),
        { replace: true },
      );
    }, 300);
    return () => window.clearTimeout(t);
  }, [searchDraft, parsed.search, searchParams, setSearchParams]);

  function patchParams(patch: Parameters<typeof writeHistorySearchParams>[1]) {
    setSearchParams(writeHistorySearchParams(searchParams, { ...patch, cursor: null }), {
      replace: true,
    });
  }

  function clearFilters() {
    setSearchDraft("");
    setSearchParams(new URLSearchParams(), { replace: true });
  }

  async function confirmDeleteSession() {
    if (!pendingDelete || !sessionHistoryItemIsDeletable(pendingDelete)) return;
    const id = (pendingDelete.sessionId || pendingDelete.sourceId).trim();
    setDeleting(true);
    try {
      await sessionsDB.delete(id);
      setItems((prev) =>
        prev.filter(
          (row) =>
            !(
              row.sourceKind === pendingDelete.sourceKind &&
              row.sourceId === pendingDelete.sourceId
            ),
        ),
      );
      setPendingDelete(null);
      notifySessionsChanged();
      toast.success("Session deleted");
    } catch (err) {
      console.error("[CallSessions] delete failed:", err);
      toast.error("Failed to delete session");
    } finally {
      setDeleting(false);
    }
  }

  return (
    <div className="space-y-5 max-w-5xl animate-in fade-in slide-in-from-bottom-2 duration-200">
      <PageHeader
        title={PRODUCT_NAMES.sessionHistory}
        description="All practice and assessment activity in one timeline"
        breadcrumbs={[
          { label: "Dashboard", href: "/app/dashboard" },
          { label: "Sessions" },
        ]}
        actions={
          <Link to="/app/live">
            <Button size="sm" className="gap-1.5">
              <Plus className="w-3.5 h-3.5" />
              Start Session
            </Button>
          </Link>
        }
      />

      <div className="flex flex-col gap-3">
        <Input
          placeholder="Search title, role, exam, assessment…"
          aria-label="Search session history"
          value={searchDraft}
          onChange={(e) => setSearchDraft(e.target.value)}
          leftIcon={<Search className="w-4 h-4" />}
          fullWidth={false}
          className="sm:w-80"
        />
        <div className="flex flex-wrap gap-1.5" role="group" aria-label="Session type filters">
          {HISTORY_TYPE_CHIPS.map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => patchParams({ typeChip: t.id })}
              className={cn(
                "px-3 py-1.5 rounded-xl text-xs font-medium border transition-all",
                parsed.typeChip === t.id
                  ? "bg-primary/10 border-primary/30 text-primary"
                  : "bg-card border-border text-muted-foreground hover:text-foreground",
              )}
            >
              {t.label}
            </button>
          ))}
        </div>
        <div className="flex flex-wrap gap-2 items-center">
          <label className="text-xs text-muted-foreground" htmlFor="history-status">
            Status
          </label>
          <select
            id="history-status"
            className="text-xs rounded-lg border border-border bg-background px-2 py-1.5"
            value={parsed.statusChip}
            onChange={(e) => patchParams({ statusChip: e.target.value })}
          >
            {HISTORY_STATUS_CHIPS.map((s) => (
              <option key={s.id} value={s.id}>
                {s.label}
              </option>
            ))}
          </select>
          <label className="text-xs text-muted-foreground" htmlFor="history-sort">
            Sort
          </label>
          <select
            id="history-sort"
            className="text-xs rounded-lg border border-border bg-background px-2 py-1.5"
            value={parsed.sort}
            onChange={(e) => patchParams({ sort: e.target.value })}
          >
            {HISTORY_SORT_OPTIONS.map((s) => (
              <option key={s.id} value={s.id}>
                {s.label}
              </option>
            ))}
          </select>
          {filtersActive && (
            <Button variant="ghost" size="sm" onClick={clearFilters}>
              Clear filters
            </Button>
          )}
        </div>
      </div>

      {loading ? (
        <div className="space-y-3">
          {[...Array(4)].map((_, i) => (
            <SkeletonCard key={i} />
          ))}
        </div>
      ) : error ? (
        <InlineErrorRetry
          message={`${error}${errorCode ? ` (${errorCode})` : ""}`}
          onRetry={() => void load("replace")}
        />
      ) : items.length === 0 && filtersActive ? (
        <EmptyState
          icon={Search}
          title="No sessions match these filters."
          description="Try clearing filters or widening the date range."
          actionLabel="Clear filters"
          onAction={clearFilters}
        />
      ) : items.length === 0 ? (
        <EmptyState
          icon={Mic}
          title="You have not completed any practice sessions yet."
          description="Start a Practice Coach, Mock Interview, exam, or coding assessment."
          actionLabel="Start Practice Coach"
          onAction={() => navigate("/app/live")}
        />
      ) : (
        <div className="space-y-3" data-testid="session-history-list">
          {items.map((item) => {
            const Icon = typeIcon(item);
            const canDelete = sessionHistoryItemIsDeletable(item);
            return (
              <Card
                key={`${item.sourceKind}:${item.sourceId}`}
                padding="none"
                className="p-4 hover:border-primary/30 transition-colors cursor-pointer"
                onClick={() => navigate(item.detailRoute)}
                data-testid="session-history-row"
                data-source-kind={item.sourceKind}
              >
                <div className="flex gap-3 items-start">
                  <div className="rounded-xl bg-secondary p-2 shrink-0">
                    <Icon className="w-4 h-4 text-muted-foreground" aria-hidden />
                  </div>
                  <div className="min-w-0 flex-1 space-y-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge variant="secondary">{sessionHistoryTypeLabel(item)}</Badge>
                      <Badge variant="outline" className="capitalize">
                        {item.status.replace(/_/g, " ")}
                      </Badge>
                      {item.debriefStatus && item.debriefStatus !== "not_eligible" && (
                        <Badge variant="outline">Debrief: {item.debriefStatus.replace(/_/g, " ")}</Badge>
                      )}
                    </div>
                    <p className="font-medium text-sm text-foreground truncate">{item.title}</p>
                    <p className="text-xs text-muted-foreground truncate" data-testid="session-history-context">
                      {sessionHistoryContextLine(item)}
                    </p>
                    <div className="flex flex-wrap gap-3 text-[11px] text-muted-foreground">
                      <span className="inline-flex items-center gap-1">
                        <Clock className="w-3 h-3" />
                        {formatDistanceToNow(new Date(item.lastActivityAt), { addSuffix: true })}
                      </span>
                      <span>
                        {formatSessionDuration({
                          duration_seconds: item.durationSeconds,
                          started_at: item.startedAt,
                          ended_at: item.endedAt,
                          status: item.status,
                        })}
                      </span>
                      <span>
                        {item.answeredCount != null || item.totalQuestionCount != null
                          ? `${item.answeredCount ?? "—"}/${item.totalQuestionCount ?? "—"} answered`
                          : "—"}
                      </span>
                      <span>{sessionHistoryScoreDisplay(item)}</span>
                    </div>
                  </div>
                  {/* Actions: shrink-0 + wrap — never clipped by overflow-hidden / 80px grid */}
                  <div
                    className="shrink-0 flex flex-wrap items-center justify-end gap-1"
                    data-testid="session-history-actions"
                    onClick={(e) => e.stopPropagation()}
                  >
                    <Button
                      variant="ghost"
                      size="sm"
                      className="shrink-0"
                      onClick={(e) => {
                        e.stopPropagation();
                        navigate(item.detailRoute);
                      }}
                      leftIcon={<Eye className="w-3.5 h-3.5" />}
                    >
                      View Details
                    </Button>
                    {canDelete && (
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="shrink-0 min-h-11 min-w-11 px-2"
                        aria-label="Delete session"
                        title="Delete session"
                        onClick={(e) => {
                          e.stopPropagation();
                          setPendingDelete(item);
                        }}
                      >
                        <Trash2 className="w-3.5 h-3.5 text-muted-foreground hover:text-red-400" />
                      </Button>
                    )}
                  </div>
                </div>
              </Card>
            );
          })}
          {hasMore ? (
            <div className="flex flex-col items-center gap-2 pt-2">
              {loadMoreError && (
                <InlineErrorRetry
                  message={loadMoreError}
                  onRetry={() => void load("append")}
                />
              )}
              <Button
                variant="secondary"
                size="sm"
                loading={loadingMore}
                onClick={() => void load("append")}
              >
                Load more
              </Button>
            </div>
          ) : loadMoreError ? (
            <div className="pt-2">
              <InlineErrorRetry
                message={loadMoreError}
                onRetry={() => void load("append")}
              />
            </div>
          ) : (
            <p className="text-center text-xs text-muted-foreground py-2">
              You’ve reached the end of your session history.
            </p>
          )}
        </div>
      )}

      <ConfirmDialog
        open={pendingDelete !== null}
        onOpenChange={(open) => {
          if (!open && !deleting) setPendingDelete(null);
        }}
        title="Delete this session?"
        description="This permanently removes the session from your history. This cannot be undone."
        confirmLabel="Delete session"
        variant="destructive"
        isLoading={deleting}
        onConfirm={() => void confirmDeleteSession()}
      />
    </div>
  );
}
