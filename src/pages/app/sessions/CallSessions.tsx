import { useCallback, useEffect, useRef, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { sessionsDB } from "@/lib/supabase/database";
import { useAuthStore } from "@/store/userStore";
import { toast } from "sonner";
import { ConfirmDialog } from "@/components/common/ConfirmDialog";
import { PageHeader } from "@/components/layout/PageHeader";
import { EmptyState } from "@/components/common/EmptyState";
import { InlineErrorRetry } from "@/components/common/InlineErrorRetry";
import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { Input } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";
import { SkeletonCard } from "@/components/ui/SkeletonLoader";
import { usePageMeta } from "@/hooks/usePageMeta";
import { debugLog161d95 } from "@/lib/debug/debugLog161d95";
import { cn } from "@/lib/utils";
import {
  Mic,
  Search,
  Plus,
  Clock,
  Sparkles,
  Phone,
  Video,
  Trash2,
  Eye,
} from "lucide-react";
import { PRODUCT_NAMES } from "@/lib/constants/productNames";
import { agentDebugIngest } from "@/lib/debug/agentIngest";
import { formatDistanceToNow } from "date-fns";
import type { Tables } from "@/integrations/supabase";
import { useSwipeAction } from "@/hooks/useSwipeAction";
import {
  sessionMatchesTypeFilter,
  sessionTypeLabel,
  type SessionHistoryTypeFilter,
} from "@/lib/session/sessionHistoryFilters";
import { SESSIONS_CHANGED_EVENT } from "@/lib/session/sessionReuse";
import { subscribeFocusRecovery } from "@/lib/focusRecovery";

const SESSION_TYPES: SessionHistoryTypeFilter[] = ["all", "live", "mock", "practice"];

type SessionRow = Pick<
  Tables<"sessions">,
  | "id"
  | "type"
  | "title"
  | "overall_score"
  | "created_at"
  | "started_at"
  | "ended_at"
  | "questions_asked"
  | "status"
  | "tags"
> & { source_type?: string | null };

const SESSION_TABS = ["recent", "all"] as const;
type SessionTab = (typeof SESSION_TABS)[number];

export default function CallSessions() {
  usePageMeta({
    title: "Session History | Clarify AI",
    description: "Review all your practice sessions — live coaching, mock interviews, and rehearsals.",
  });

  const navigate = useNavigate();

  const [searchParams, setSearchParams] = useSearchParams();
  const tab = (searchParams.get("tab") === "all" ? "all" : "recent") as SessionTab;

  const { user } = useAuthStore();
  const [sessions, setSessions] = useState<SessionRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [filter, setFilter] = useState<SessionHistoryTypeFilter>("all");
  const [search, setSearch] = useState("");
  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null);

  const hasSessionsRef = useRef(false);
  hasSessionsRef.current = sessions.length > 0;

  const fetchSessions = useCallback(async (mode: "initial" | "background" = "initial") => {
    if (!user?.id) return;

    if (mode === "initial") {
      setLoading(true);
    }
    setError(false);
    try {
      const limit = tab === "all" ? 500 : 20;
      const data = await sessionsDB.listSummariesByUserId(user.id, limit);
      setSessions(data);
    } catch (err) {
      console.error("[CallSessions] fetch error:", err);
      setError(true);
      toast.error("Couldn't load sessions. Please retry.");
    } finally {
      if (mode === "initial") {
        setLoading(false);
      }
    }
  }, [user?.id, tab]);

  useEffect(() => {
    void fetchSessions(hasSessionsRef.current ? "background" : "initial");
  }, [fetchSessions]);

  useEffect(() => {
    const refetch = () => void fetchSessions("background");
    window.addEventListener(SESSIONS_CHANGED_EVENT, refetch);
    const unsub = subscribeFocusRecovery((plan) => {
      if (plan.revalidate.includes("sessionsList")) {
        void fetchSessions("background");
      }
    });
    return () => {
      window.removeEventListener(SESSIONS_CHANGED_EVENT, refetch);
      unsub();
    };
  }, [fetchSessions]);

  async function deleteSession(id: string) {
    try {
      await sessionsDB.delete(id);
      setSessions((prev) => prev.filter((s) => s.id !== id));
      toast.success("Session deleted");
    } catch {
      toast.error("Failed to delete session");
    }
  }

  const filtered = sessions.filter((s) => {
    if (filter !== "all" && !sessionMatchesTypeFilter(s.type, filter)) return false;
    if (search) {
      const q = search.toLowerCase();
      return (
        s.title?.toLowerCase().includes(q) ||
        s.type?.toLowerCase().includes(q) ||
        (s.tags ?? []).some((t: string) => t.toLowerCase().includes(q))
      );
    }
    return true;
  });

  return (
    <div className="space-y-5 max-w-5xl animate-in fade-in slide-in-from-bottom-2 duration-200">
      <PageHeader
        title={PRODUCT_NAMES.sessionHistory}
        description={`${sessions.length} total sessions`}
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

      <div className="flex gap-2">
        {SESSION_TABS.map((t) => (
          <button
            key={t}
            type="button"
            onClick={() => setSearchParams(t === "recent" ? {} : { tab: t })}
            className={cn(
              "px-3 py-1.5 rounded-xl text-xs font-medium border transition-all capitalize",
              tab === t
                ? "bg-primary/10 border-primary/30 text-primary/80"
                : "bg-card border-border text-muted-foreground hover:text-foreground",
            )}
          >
            {t === "recent" ? "Recent" : "All history"}
          </button>
        ))}
      </div>

      <div className="flex flex-col sm:flex-row gap-3">
        <Input
          placeholder="Search sessions…"
          aria-label="Search sessions"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          leftIcon={<Search className="w-4 h-4" />}
          fullWidth={false}
          className="sm:w-64"
        />
        <div className="flex gap-1.5">
          {SESSION_TYPES.map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => setFilter(t)}
              className={cn(
                "px-3 py-1.5 rounded-xl text-xs font-medium border transition-all capitalize",
                filter === t
                  ? "bg-primary/10 border-primary/30 text-primary"
                  : "bg-card border-border text-muted-foreground hover:text-foreground",
              )}
            >
              {t}
            </button>
          ))}
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
          message="Unable to load sessions. There was a problem connecting to the database."
          onRetry={() => void fetchSessions()}
        />
      ) : filtered.length === 0 ? (
        <Card>
          <EmptyState
            icon={Phone}
            title="No sessions yet"
            description={
              sessions.length === 0
                ? "Start your first live session to see your history here."
                : "No sessions match your filter."
            }
            actionLabel={sessions.length === 0 ? "Start Session" : undefined}
            onAction={sessions.length === 0 ? () => navigate("/app/live") : undefined}
          />
        </Card>
      ) : (
        <div className="border border-border rounded-xl overflow-hidden">
          <div className="hidden sm:grid grid-cols-[2fr_1fr_1fr_1fr_1fr_80px] gap-4 px-4 py-2.5 bg-muted/30 border-b border-border text-[10px] uppercase tracking-wider font-semibold text-muted-foreground">
            <span>Session</span>
            <span>Type</span>
            <span>Duration</span>
            <span>AI Usage</span>
            <span>Created</span>
            <span>Actions</span>
          </div>

          {filtered.map((s) => {
            let duration: string | null = null;
            if (s.started_at && s.ended_at) {
              const ms =
                new Date(s.ended_at).getTime() - new Date(s.started_at).getTime();
              if (ms > 0) duration = `${Math.floor(ms / 60000)}m`;
            } else if (s.status === "active" && !s.ended_at) {
              duration = "In progress";
            }

            const typeLabel = sessionTypeLabel(s);
            const typeColor =
              s.type === "live"
                ? "bg-red-500/10 text-red-400 border-red-500/20"
                : s.type === "mock"
                  ? "bg-blue-500/10 text-blue-400 border-blue-500/20"
                  : "bg-primary/10 text-primary border-primary/20";

            return (
              <SwipeSessionRow
                key={s.id}
                session={s}
                duration={duration}
                typeColor={typeColor}
                typeLabel={typeLabel}
                onDelete={() => setPendingDeleteId(s.id)}
              />
            );
          })}
        </div>
      )}

      <ConfirmDialog
        open={pendingDeleteId !== null}
        onOpenChange={(open) => {
          if (!open) setPendingDeleteId(null);
        }}
        title="Delete this session?"
        description="This permanently removes the session record, transcript, and scores. This cannot be undone."
        confirmLabel="Delete session"
        variant="destructive"
        onConfirm={async () => {
          if (!pendingDeleteId) return;
          await deleteSession(pendingDeleteId);
          setPendingDeleteId(null);
        }}
      />
    </div>
  );
}

function SwipeSessionRow({
  session: s,
  duration,
  typeColor,
  typeLabel,
  onDelete,
}: {
  session: SessionRow;
  duration: string | null;
  typeColor: string;
  typeLabel: string;
  onDelete: () => void;
}) {
  const swipe = useSwipeAction({ maxReveal: 72, threshold: 48 });
  const navigate = useNavigate();

  return (
    <div className="relative overflow-hidden border-b border-border last:border-b-0">
      <div
        className="absolute inset-y-0 right-0 flex items-stretch sm:hidden"
        aria-hidden={!swipe.revealed}
      >
        <button
          type="button"
          onClick={() => {
            swipe.reset();
            onDelete();
          }}
          aria-label="Delete session"
          className={cn(
            "w-[72px] flex items-center justify-center bg-red-500/90 text-white min-h-11",
            swipe.revealed ? "pointer-events-auto" : "pointer-events-none opacity-0",
          )}
        >
          <Trash2 className="w-4 h-4" />
        </button>
      </div>

      <div
        {...swipe.bind}
        role="link"
        tabIndex={0}
        onClick={(e) => {
          if ((e.target as HTMLElement | null)?.closest("button, a, input, select, textarea")) {
            return;
          }
          agentDebugIngest({
            sessionId: "fcd48a",
            runId: "post-fix",
            hypothesisId: "SES-ROW",
            location: "CallSessions.tsx:rowClick",
            message: "session row navigate",
            data: { sessionId: s.id },
          });
          navigate(`/app/sessions/${s.id}`);
        }}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            navigate(`/app/sessions/${s.id}`);
          }
        }}
        className="relative grid grid-cols-1 sm:grid-cols-[2fr_1fr_1fr_1fr_1fr_80px] gap-2 sm:gap-4 px-4 py-3 hover:bg-muted/10 transition-colors items-start bg-background sm:bg-transparent cursor-pointer"
        aria-label={`View session details: ${s.title ?? s.type ?? "session"}`}
      >
        <div className="min-w-0">
          <p className="text-sm font-medium text-foreground truncate">
            {s.title ?? `${s.type ?? "practice"} session`}
          </p>
          {(() => {
            const ageMs = Date.now() - new Date(s.created_at).getTime();
            const isExpired =
              s.status === "abandoned" ||
              (s.status !== "completed" && ageMs > 24 * 60 * 60 * 1000);
            if (isExpired) {
              return (
                <Badge variant="secondary" className="text-[9px] mt-0.5">
                  Expired
                </Badge>
              );
            }
            if (s.status && s.status !== "completed") {
              return (
                <Badge variant="secondary" className="text-[9px] mt-0.5">
                  {s.status}
                </Badge>
              );
            }
            if (s.status === "completed" && s.overall_score == null) {
              return (
                <Badge variant="secondary" className="text-[9px] mt-0.5">
                  Feedback processing
                </Badge>
              );
            }
            return null;
          })()}
        </div>

        <div>
          <span
            className={cn(
              "inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium border capitalize",
              typeColor,
            )}
          >
            {s.type === "live" ? (
              <Mic className="w-2.5 h-2.5" />
            ) : (
              <Video className="w-2.5 h-2.5" />
            )}
            {typeLabel}
          </span>
        </div>

        <div className="flex items-center gap-1 text-xs text-muted-foreground">
          <Clock className="w-3 h-3" />
          {duration ?? "—"}
        </div>

        <div className="flex items-center gap-1 text-xs text-muted-foreground">
          <Sparkles className="w-3 h-3" />
          {s.questions_asked ?? 0} Qs
        </div>

        <div className="text-xs text-muted-foreground">
          {formatDistanceToNow(new Date(s.created_at), { addSuffix: true })}
        </div>

        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              // #region agent log
              debugLog161d95({
                hypothesisId: "H5",
                location: "CallSessions.tsx:eyeClick",
                message: "session_view_details_click",
                data: { sessionId: s.id, status: s.status ?? null },
              });
              // #endregion
              navigate(`/app/sessions/${s.id}`);
            }}
            className="inline-flex items-center gap-1.5 px-2 py-2 hover:bg-muted/20 rounded-lg transition-colors min-h-11 text-xs text-muted-foreground hover:text-foreground"
            title="View details"
            aria-label="View session details"
          >
            <Eye className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Details</span>
          </button>
          <button
            type="button"
            onClick={onDelete}
            className="p-2 hover:bg-red-500/10 rounded-lg transition-colors min-h-11 min-w-11 inline-flex items-center justify-center"
            aria-label="Delete session"
            title="Delete"
          >
            <Trash2 className="w-3.5 h-3.5 text-muted-foreground hover:text-red-400" />
          </button>
        </div>
      </div>
    </div>
  );
}
