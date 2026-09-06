import { useEffect, useState, useCallback, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { useAuthStore } from "@/store/userStore";
import { sessionsDB } from "@/lib/supabase/database";
import {
  filterDebriefListItems,
  mergeDebriefListItems,
  type DebriefListItem,
  type DebriefListSession,
} from "@/lib/debrief/debriefList";
import { loadDebriefListPage } from "@/lib/debrief/loadDebriefList";
import {
  DEBRIEF_EMPTY_COPY,
  buildDebriefListAccess,
  debriefFetchErrorMessage,
  resolveDebriefPageState,
  type DebriefPageState,
  type DebriefSessionEligibility,
} from "@/lib/debrief/debriefPageState";
import { FullPageProcessingState } from "@/components/async/FullPageProcessingState";
import { PageHeader } from "@/components/layout/PageHeader";
import { PageContent } from "@/components/layout/PageContent";
import { EmptyState } from "@/components/common/EmptyState";
import { InlineErrorRetry } from "@/components/common/InlineErrorRetry";
import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { Input } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";
import {
  Brain,
  ChevronRight,
  AlertTriangle,
  CalendarDays,
  Search,
  Sparkles,
  Loader2,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { format } from "date-fns";
import type { Tables } from "@/integrations/supabase";
import { PAGE_SHELL } from "@/lib/ui/responsivePage";

type SessionMeta = Pick<
  Tables<"sessions">,
  "id" | "overall_score" | "type" | "title" | "created_at"
>;

export default function Debrief() {
  const navigate = useNavigate();
  const user = useAuthStore((s) => s.user);
  const authLoading = useAuthStore((s) => s.isLoading);
  const planId = useAuthStore((s) => s.planId) || "free";

  const [debriefs, setDebriefs] = useState<
    Awaited<ReturnType<typeof loadDebriefListPage>>["debriefs"]
  >([]);
  const [sessions, setSessions] = useState<Record<string, SessionMeta>>({});
  const [pendingSessions, setPendingSessions] = useState<DebriefListSession[]>([]);
  const [processingJobs, setProcessingJobs] = useState<
    Awaited<ReturnType<typeof loadDebriefListPage>>["processingJobs"]
  >([]);
  const [failedJobs, setFailedJobs] = useState<
    Awaited<ReturnType<typeof loadDebriefListPage>>["failedJobs"]
  >([]);
  const [eligibility, setEligibility] = useState<DebriefSessionEligibility>({
    totalCompletedSessions: 0,
    eligibleSessions: 0,
    ineligibleSessions: 0,
  });
  const [loading, setLoading] = useState(true);
  const [retrying, setRetrying] = useState(false);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [pendingWarning, setPendingWarning] = useState<string | null>(null);
  const [planRestricted, setPlanRestricted] = useState(false);
  const [search, setSearch] = useState("");
  const [correlationId, setCorrelationId] = useState<string | null>(null);

  const fetchDebriefs = useCallback(async () => {
    if (authLoading) return;
    if (!user?.id) {
      setLoading(false);
      setFetchError(null);
      return;
    }
    setLoading(true);
    setFetchError(null);
    setPendingWarning(null);

    try {
      const result = await loadDebriefListPage({
        userId: user.id,
        planId,
      });

      if (!result.access.canViewDebrief) {
        setPlanRestricted(true);
        setDebriefs([]);
        setPendingSessions([]);
        setProcessingJobs([]);
        setFailedJobs([]);
        setEligibility(result.sessionEligibility);
        setCorrelationId(result.correlationId ?? null);
        return;
      }

      setPlanRestricted(false);
      setDebriefs(result.debriefs);
      setPendingSessions(result.pendingSessions);
      setProcessingJobs(result.processingJobs);
      setFailedJobs(result.failedJobs);
      setEligibility(result.sessionEligibility);
      setPendingWarning(result.pendingWarning);
      setCorrelationId(result.correlationId ?? null);

      const sessionIds = [
        ...new Set([
          ...result.debriefs
            .map((d) => d.session_id)
            .filter((id): id is string => Boolean(id)),
          ...result.processingJobs.map((j) => j.sessionId),
          ...result.failedJobs.map((j) => j.sessionId),
          ...result.pendingSessions.map((s) => s.id),
        ]),
      ];

      let sessionMap: Record<string, SessionMeta> = {};
      if (sessionIds.length > 0) {
        try {
          const sessionRows = await sessionsDB.listMetaByIds(sessionIds);
          sessionMap = Object.fromEntries(sessionRows.map((s) => [s.id, s]));
        } catch (sessErr) {
          console.warn("[Debrief] Failed to fetch sessions:", sessErr);
        }
      }
      setSessions(sessionMap);
    } catch (err: unknown) {
      setFetchError(debriefFetchErrorMessage(err));
      setDebriefs([]);
      setPendingSessions([]);
      setProcessingJobs([]);
      setFailedJobs([]);
    } finally {
      setLoading(false);
      setRetrying(false);
    }
  }, [authLoading, user?.id, planId]);

  const listItems = useMemo(() => {
    const sessionsById: Record<string, DebriefListSession> = {
      ...Object.fromEntries(
        Object.entries(sessions).map(([id, s]) => [id, s as DebriefListSession]),
      ),
    };
    return mergeDebriefListItems({
      debriefs,
      sessionsById,
      pendingSessions,
      processingJobs,
      failedJobs,
    });
  }, [debriefs, sessions, pendingSessions, processingJobs, failedJobs]);

  const filteredItems = useMemo(
    () => filterDebriefListItems(listItems, search),
    [listItems, search],
  );

  const pageState: DebriefPageState = resolveDebriefPageState({
    userReady: Boolean(user?.id) && !authLoading,
    loading,
    retrying,
    planRestricted,
    debriefFetchFailed: Boolean(fetchError),
    pendingFetchFailed: Boolean(pendingWarning) && debriefs.length === 0,
    debriefCount: debriefs.length,
    pendingCount: pendingSessions.length,
    processingCount: processingJobs.length,
    failedCount: failedJobs.length,
    eligibleSessions: eligibility.eligibleSessions,
    totalCompletedSessions: eligibility.totalCompletedSessions,
  });

  const access = buildDebriefListAccess({
    planId,
    planRestricted,
    pageState,
  });

  useEffect(() => {
    void fetchDebriefs();
  }, [fetchDebriefs]);

  const onRetry = () => {
    setRetrying(true);
    void fetchDebriefs();
  };

  const gradeColor = (g: string) => {
    if (!g) return "red";
    const base = g.charAt(0).toUpperCase();
    if (base === "A") return "emerald";
    if (base === "B") return "blue";
    if (base === "C") return "amber";
    return "red";
  };

  if (pageState === "initializing" || pageState === "loading" || pageState === "retrying") {
    return (
      <PageContent data-testid="page-width-root" className={cn(PAGE_SHELL, "space-y-5")}>
        <PageHeader
          title="Debriefs"
          subtitle="Deep-dive AI analysis of each session"
          breadcrumbs={[
            { label: "Dashboard", href: "/app/dashboard" },
            { label: "Debriefs" },
          ]}
        />
        <FullPageProcessingState
          title={pageState === "retrying" ? "Retrying debrief list" : "Loading debriefs"}
          message={
            pageState === "retrying"
              ? "Fetching your session debriefs again…"
              : "Gathering saved debriefs and sessions ready to analyze…"
          }
          stage="debriefs"
        />
      </PageContent>
    );
  }

  return (
    <PageContent data-testid="page-width-root" className={cn(PAGE_SHELL, "space-y-5")}>
      <PageHeader
        title="Debriefs"
        subtitle="Deep-dive AI analysis of each session"
        breadcrumbs={[
          { label: "Dashboard", href: "/app/dashboard" },
          { label: "Debriefs" },
        ]}
      />

      <Input
        placeholder="Search debriefs…"
        aria-label="Search debriefs"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        leftIcon={<Search className="w-4 h-4" />}
        className="max-w-sm"
      />

      {pendingWarning && pageState !== "temporary_failure" && (
        <InlineErrorRetry
          message={`Some ready-to-generate sessions could not be loaded. ${pendingWarning}`}
          onRetry={onRetry}
        />
      )}

      {pageState === "temporary_failure" && (
        <Card>
          <EmptyState
            icon={AlertTriangle}
            title={DEBRIEF_EMPTY_COPY.temporaryFailureTitle}
            description={
              fetchError ??
              (correlationId
                ? `${DEBRIEF_EMPTY_COPY.temporaryFailureDescription} Reference: ${correlationId}`
                : DEBRIEF_EMPTY_COPY.temporaryFailureDescription)
            }
            actionLabel="Retry"
            onAction={onRetry}
          />
          <div className="px-6 pb-6">
            <Button variant="outline" onClick={() => navigate("/app/sessions")}>
              Open Session History
            </Button>
          </div>
        </Card>
      )}

      {pageState === "plan_restricted" && (
        <Card>
          <EmptyState
            icon={Brain}
            title={DEBRIEF_EMPTY_COPY.planRestrictedTitle}
            description={`Your current plan (${access.plan}) does not include Debriefs. Upgrade to unlock session-level coaching reports.`}
            actionLabel="View plans"
            onAction={() => navigate("/pricing")}
          />
        </Card>
      )}

      {pageState === "no_eligible_session" && !search && (
        <Card>
          <EmptyState
            icon={Brain}
            title={DEBRIEF_EMPTY_COPY.noEligibleTitle}
            description={DEBRIEF_EMPTY_COPY.noEligibleDescription}
            actionLabel="Start mock session"
            onAction={() => navigate("/app/mock")}
          />
          <div className="flex flex-wrap gap-2 px-6 pb-6">
            <Button variant="outline" onClick={() => navigate("/app/live")}>
              Start Practice Coach
            </Button>
            <Button variant="outline" onClick={() => navigate("/app/sessions")}>
              Open Session History
            </Button>
          </div>
        </Card>
      )}

      {(pageState === "available" ||
        pageState === "processing" ||
        (pageState === "no_eligible_session" && Boolean(search))) && (
        <>
          {search && filteredItems.length === 0 && (
            <Card>
              <EmptyState
                icon={Brain}
                title={DEBRIEF_EMPTY_COPY.noMatchingTitle}
                description={`No debriefs match "${search}".`}
              />
            </Card>
          )}

          {filteredItems.length > 0 && (
            <div className="space-y-3">
              {filteredItems.map((item) => {
                if (item.kind === "debrief") {
                  return (
                    <DebriefRow
                      key={item.id}
                      item={item}
                      gradeColor={gradeColor}
                      onOpen={() => navigate(`/app/debriefs/${item.debrief.id}`)}
                    />
                  );
                }
                if (item.kind === "processing") {
                  return (
                    <ProcessingRow
                      key={item.id}
                      item={item}
                      onRefresh={onRetry}
                      onOpen={() =>
                        navigate(
                          item.session
                            ? `/app/sessions/${item.job.sessionId}`
                            : "/app/sessions",
                        )
                      }
                    />
                  );
                }
                if (item.kind === "failed") {
                  return (
                    <FailedRow
                      key={item.id}
                      item={item}
                      onRetry={() =>
                        navigate(`/app/debriefs/${item.job.sessionId}`)
                      }
                      onOpen={() =>
                        navigate(
                          item.session
                            ? `/app/sessions/${item.job.sessionId}`
                            : "/app/sessions",
                        )
                      }
                    />
                  );
                }
                return (
                  <PendingRow
                    key={item.id}
                    item={item}
                    onOpen={() => navigate(`/app/debriefs/${item.session.id}`)}
                  />
                );
              })}
            </div>
          )}
        </>
      )}
    </PageContent>
  );
}

function DebriefRow({
  item,
  gradeColor,
  onOpen,
}: {
  item: Extract<DebriefListItem, { kind: "debrief" }>;
  gradeColor: (g: string) => string;
  onOpen: () => void;
}) {
  const sess = item.session;
  const gc = gradeColor(item.debrief.overall_grade ?? "");

  return (
    <Card hover onClick={onOpen}>
      <div className="flex items-start gap-4">
        <div
          className={cn(
            "w-12 h-12 rounded-2xl flex items-center justify-center shrink-0 text-lg font-black border",
            gc === "emerald"
              ? "bg-emerald-500/10 border-emerald-500/20 text-emerald-400"
              : gc === "blue"
                ? "bg-blue-500/10 border-blue-500/20 text-blue-400"
                : gc === "amber"
                  ? "bg-amber-500/10 border-amber-500/20 text-amber-400"
                  : "bg-red-500/10 border-red-500/20 text-red-400",
          )}
        >
          {item.debrief.overall_grade ?? "?"}
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <p className="text-sm font-semibold text-foreground capitalize">
              {sess?.type ?? "Session"} Interview
              {sess?.title && ` — ${sess.title}`}
            </p>
            {sess?.overall_score != null && (
              <Badge
                variant={
                  sess.overall_score >= 75
                    ? "emerald"
                    : sess.overall_score >= 55
                      ? "amber"
                      : "red"
                }
                size="sm"
              >
                {sess.overall_score}/100
              </Badge>
            )}
          </div>

          <p className="text-xs text-muted-foreground mt-1 flex items-center gap-1">
            <CalendarDays className="w-3 h-3" />
            {format(new Date(item.debrief.created_at), "MMM d, yyyy · h:mm a")}
          </p>

          {item.debrief.priority_focus && (
            <div className="flex items-center gap-1.5 mt-2">
              <AlertTriangle className="w-3 h-3 text-amber-400 shrink-0" />
              <p className="text-xs text-amber-300">
                Focus: {item.debrief.priority_focus}
              </p>
            </div>
          )}
        </div>

        <ChevronRight className="w-4 h-4 text-muted-foreground shrink-0 mt-1" />
      </div>
    </Card>
  );
}

function PendingRow({
  item,
  onOpen,
}: {
  item: Extract<DebriefListItem, { kind: "pending" }>;
  onOpen: () => void;
}) {
  const sess = item.session;

  return (
    <Card hover onClick={onOpen}>
      <div className="flex items-start gap-4">
        <div className="w-12 h-12 rounded-2xl flex items-center justify-center shrink-0 border bg-primary/10 border-primary/20 text-primary">
          <Sparkles className="w-5 h-5" />
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <p className="text-sm font-semibold text-foreground capitalize">
              {sess.type ?? "Session"} Interview
              {sess.title && ` — ${sess.title}`}
            </p>
            <Badge variant="blue" size="sm">
              Ready to generate
            </Badge>
            {sess.overall_score != null && (
              <Badge
                variant={
                  sess.overall_score >= 75
                    ? "emerald"
                    : sess.overall_score >= 55
                      ? "amber"
                      : "red"
                }
                size="sm"
              >
                {sess.overall_score}/100
              </Badge>
            )}
          </div>

          <p className="text-xs text-muted-foreground mt-1 flex items-center gap-1">
            <CalendarDays className="w-3 h-3" />
            {format(new Date(sess.created_at), "MMM d, yyyy · h:mm a")}
          </p>

          <p className="text-xs text-muted-foreground mt-2">
            Open to generate an AI debrief with grades, focus areas, and tips.
          </p>
        </div>

        <ChevronRight className="w-4 h-4 text-muted-foreground shrink-0 mt-1" />
      </div>
    </Card>
  );
}

function ProcessingRow({
  item,
  onOpen,
  onRefresh,
}: {
  item: Extract<DebriefListItem, { kind: "processing" }>;
  onOpen: () => void;
  onRefresh: () => void;
}) {
  const sess = item.session;

  return (
    <Card>
      <div className="flex items-start gap-4">
        <div className="w-12 h-12 rounded-2xl flex items-center justify-center shrink-0 border bg-amber-500/10 border-amber-500/20 text-amber-400">
          <Loader2 className="w-5 h-5 animate-spin" aria-hidden />
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <p className="text-sm font-semibold text-foreground capitalize">
              {sess?.type ?? "Session"} Interview
              {sess?.title && ` — ${sess.title}`}
            </p>
            <Badge variant="amber" size="sm">
              {item.job.status === "queued" ? "Queued" : "Processing"}
            </Badge>
          </div>

          <p className="text-xs text-muted-foreground mt-1 flex items-center gap-1">
            <CalendarDays className="w-3 h-3" />
            Updated {format(new Date(item.job.updatedAt), "MMM d, yyyy · h:mm a")}
          </p>

          <p className="text-xs text-muted-foreground mt-2">
            {item.job.progressStage
              ? `Stage: ${item.job.progressStage}. `
              : ""}
            You can leave and return — refresh to check status.
          </p>

          <div className="flex flex-wrap gap-2 mt-3">
            <Button size="sm" variant="outline" onClick={onRefresh}>
              Refresh status
            </Button>
            <Button size="sm" variant="ghost" onClick={onOpen}>
              Open session
            </Button>
          </div>
        </div>
      </div>
    </Card>
  );
}

function FailedRow({
  item,
  onOpen,
  onRetry,
}: {
  item: Extract<DebriefListItem, { kind: "failed" }>;
  onOpen: () => void;
  onRetry: () => void;
}) {
  const sess = item.session;
  const message =
    item.job.errorMessage?.trim() ||
    "Debrief generation failed. You can retry without losing this session.";

  return (
    <Card>
      <div className="flex items-start gap-4">
        <div className="w-12 h-12 rounded-2xl flex items-center justify-center shrink-0 border bg-red-500/10 border-red-500/20 text-red-400">
          <AlertTriangle className="w-5 h-5" aria-hidden />
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <p className="text-sm font-semibold text-foreground capitalize">
              {sess?.type ?? "Session"} Interview
              {sess?.title && ` — ${sess.title}`}
            </p>
            <Badge variant="red" size="sm">
              Failed
            </Badge>
          </div>

          <p className="text-xs text-muted-foreground mt-1 flex items-center gap-1">
            <CalendarDays className="w-3 h-3" />
            Updated {format(new Date(item.job.updatedAt), "MMM d, yyyy · h:mm a")}
          </p>

          <p className="text-xs text-muted-foreground mt-2">{message}</p>

          <div className="flex flex-wrap gap-2 mt-3">
            <Button size="sm" variant="outline" onClick={onRetry}>
              Retry debrief
            </Button>
            <Button size="sm" variant="ghost" onClick={onOpen}>
              Open session
            </Button>
          </div>
        </div>
      </div>
    </Card>
  );
}
