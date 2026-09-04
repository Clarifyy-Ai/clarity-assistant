import { useEffect, useState, useCallback, useMemo, useRef } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useAuthStore } from "@/store/userStore";
import {
  sessionDebriefsDB,
  sessionsDB,
  sessionTranscriptsDB,
  sessionAnswersDB,
  scorecardsDB,
} from "@/lib/supabase/database";
import { enrichDetailedReport } from "@/lib/debrief/enrichDetailedReport";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { SkeletonCard } from "@/components/ui/SkeletonLoader";
import { PageHeader } from "@/components/layout/PageHeader";
import { EmptyState } from "@/components/common/EmptyState";
import { InlineErrorRetry } from "@/components/common/InlineErrorRetry";
import {
  Brain, TrendingUp,
  AlertTriangle, CheckCircle, Target,
  BookOpen, Zap, Star, Clock,
  BarChart2, FlaskConical, ChevronRight,
  Lightbulb, Calendar, ScrollText,
  MessageSquare,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { format } from "date-fns";
import { toast } from "sonner";
import { formatSessionScore, debriefJobStatusLabel } from "@/lib/analytics/scoreStatus";
import { HybridSourceLine } from "@/components/hybrid/HybridSourceLine";
import { getAiUserFacingError, isInsufficientCreditsError, openUpgradeIfInsufficientCredits, openUpgradeIfCapabilityRequired } from "@/lib/network/aiErrorUx";
import { InsufficientCreditsAction } from "@/components/billing/InsufficientCreditsAction";
import { useCreditBalance } from "@/components/billing/useCreditState";
import { evaluateActionCreditGate } from "@/lib/billing/actionCreditGate";
import { AI_CREDIT_COSTS } from "@/lib/constants/creditEconomics";
import { ApiClientError } from "@/lib/api/apiClient";
import {
  cancelSessionDebriefJob,
  generateSessionDebrief,
  isSessionDebriefInFlight,
  userFacingSessionDebriefError,
  type SessionDebriefJob,
} from "@/lib/debrief/debriefJob";
import { DebriefExtras } from "@/components/session/DebriefExtras";
import { DebriefLoadingSteps } from "@/components/debrief/DebriefLoadingSteps";
import {
  DebriefSessionMeta,
  DebriefQuestionsList,
  DebriefEventTimeline,
  DebriefMissedKeywords,
  DebriefVocalCharts,
  DebriefConfidenceBreakdown,
  DebriefShareButton,
  buildSessionEvents,
  type DetailedReport,
} from "@/components/debrief/DebriefAnalyticsPanels";

export default function DebriefDetail() {
  const { id }   = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { user } = useAuthStore();

  const [debrief,    setDebrief]    = useState<any>(null);
  const [session,    setSession]    = useState<any>(null);
  const [loading,    setLoading]    = useState(true);
  const [genning,    setGenning]    = useState(false);
  const [loadStep,   setLoadStep]   = useState(0);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [transcript, setTranscript] = useState<string | null>(null);
  const [answers, setAnswers] = useState<any[]>([]);
  const [scorecard, setScorecard] = useState<any>(null);
  const [transcriptSegments, setTranscriptSegments] = useState<any[]>([]);
  const [debriefSource, setDebriefSource] = useState<string | null>(null);
  const [debriefJob, setDebriefJob] = useState<SessionDebriefJob | null>(null);
  const [creditGateDenied, setCreditGateDenied] = useState(false);
  const { balance: creditBalance, known: creditKnown } = useCreditBalance();
  const generateInFlightRef = useRef(false);
  const cancelGenerateRef = useRef(false);

  // Persist-first: load DB only. Missing debriefs wait for an explicit Generate click.
  const fetchDebrief = useCallback(async (options?: { silent?: boolean }) => {
    if (!id || !user?.id) return;
    if (!options?.silent) {
      setLoading(true);
      setFetchError(null);
      setLoadStep(0);
    }

    try {
      if (!options?.silent) setLoadStep(1);
      let db = await sessionDebriefsDB.getByIdForUser(id, user.id);
      if (!db) {
        db = await sessionDebriefsDB.getBySessionIdForUser(id, user.id);
      }

      if (db) {
        setDebrief(db);
        if (db.session_id) {
          try {
            const [sess, ans, sc, segments] = await Promise.all([
              sessionsDB.getByIdForUser(db.session_id, user.id),
              sessionAnswersDB.listBySessionIdForUser(db.session_id, user.id),
              scorecardsDB.getBySessionIdForUser(db.session_id, user.id).catch(() => null),
              sessionTranscriptsDB.listSegmentsBySessionIdForUser(db.session_id, user.id).catch(() => []),
            ]);
            setSession(sess);
            setAnswers(ans);
            setScorecard(sc);
            setTranscriptSegments(segments);
            try {
              const tx = await sessionTranscriptsDB.getBySessionIdForUser(db.session_id, user.id);
              setTranscript(tx ?? sess?.notes ?? null);
            } catch {
              setTranscript(sess?.notes ?? null);
            }
          } catch {
            setSession(null);
            setTranscript(null);
            setAnswers([]);
            setScorecard(null);
            setTranscriptSegments([]);
          }
        }
      } else {
        const sess = await sessionsDB.getByIdForUser(id, user.id);
        if (!sess) {
          setFetchError("Session not found.");
          return;
        }
        setSession(sess);
        try {
          const [ans, sc, segments] = await Promise.all([
            sessionAnswersDB.listBySessionIdForUser(id, user.id),
            scorecardsDB.getBySessionIdForUser(id, user.id).catch(() => null),
            sessionTranscriptsDB.listSegmentsBySessionIdForUser(id, user.id).catch(() => []),
          ]);
          setAnswers(ans);
          setScorecard(sc);
          setTranscriptSegments(segments);
          try {
            const tx = await sessionTranscriptsDB.getBySessionIdForUser(id, user.id);
            setTranscript(tx ?? sess?.notes ?? null);
          } catch {
            setTranscript(sess?.notes ?? null);
          }
        } catch {
          // Artifacts are optional; user can still generate a debrief.
        }
        // Persist-first: never spend AI credits just because this page mounted.
      }
    } catch (err: unknown) {
      const msg = getAiUserFacingError(err);
      console.error("[DebriefDetail] fetchDebrief error:", err);
      setFetchError(msg);
    } finally {
      if (!options?.silent) setLoading(false);
    }
  }, [id, user?.id]);

  // ── Generate debrief from edge function ──────────────────────
  const generateDebrief = useCallback(async (sessionId: string) => {
    if (generateInFlightRef.current || !user?.id) return;

    const gate = evaluateActionCreditGate({
      operationKey: "session_debrief",
      balance: creditKnown ? creditBalance : null,
      balanceKnown: creditKnown,
    });
    if (gate.status === "insufficient" || gate.status === "unknown_balance") {
      setCreditGateDenied(true);
      openUpgradeIfInsufficientCredits(
        new ApiClientError({
          message: "Not enough credits to generate a debrief.",
          status: 402,
          code: "INSUFFICIENT_CREDITS",
        }),
      );
      return;
    }

    generateInFlightRef.current = true;
    cancelGenerateRef.current = false;
    setCreditGateDenied(false);
    setFetchError(null);
    setGenning(true);
    setLoadStep(2);
    try {
      const job = await generateSessionDebrief({
        sessionId,
        userId: user.id,
        shouldAbort: () => cancelGenerateRef.current,
        onJob: (nextJob) => {
          setDebriefJob(nextJob);
          setDebriefSource(nextJob.source ?? null);
          setLoadStep(nextJob.status === "completed" ? 3 : 2);
        },
      });
      setLoadStep(3);
      setDebriefSource(job.source ?? null);
      await fetchDebrief({ silent: true });
    } catch (err: unknown) {
      if (isInsufficientCreditsError(err)) {
        setCreditGateDenied(true);
        openUpgradeIfInsufficientCredits(err);
        setGenning(false);
        return;
      }
      openUpgradeIfCapabilityRequired(err);
      const msg = userFacingSessionDebriefError(err);
      console.error("[DebriefDetail] generateDebrief error:", err);
      toast.error(msg);
      setFetchError(msg);
    } finally {
      generateInFlightRef.current = false;
      setGenning(false);
    }
  }, [fetchDebrief, user?.id, creditBalance, creditKnown]);

  const cancelGenerateDebrief = useCallback(async () => {
    cancelGenerateRef.current = true;
    const jobId = debriefJob?.jobId;
    if (!jobId || !isSessionDebriefInFlight(debriefJob.status)) {
      setGenning(false);
      generateInFlightRef.current = false;
      return;
    }
    try {
      const cancelled = await cancelSessionDebriefJob(jobId);
      setDebriefJob(cancelled);
      toast.info("Debrief generation cancelled.");
    } catch (err: unknown) {
      toast.error(getAiUserFacingError(err));
    } finally {
      setGenning(false);
      generateInFlightRef.current = false;
    }
  }, [debriefJob]);

  // FIX 3: include user?.id in dep array so it re-runs if user loads after id
  useEffect(() => {
    void fetchDebrief();
  }, [fetchDebrief]);

  // ── Derived values ────────────────────────────────────────────

  const gradeColor =
    !debrief?.overall_grade ? null :
    debrief.overall_grade.startsWith("A") ? "emerald" :
    debrief.overall_grade.startsWith("B") ? "blue"    :
    debrief.overall_grade.startsWith("C") ? "amber"   : "red";

  const detailedReport = useMemo(() => {
    const raw = (debrief?.detailed_report ?? {}) as DetailedReport;
    return enrichDetailedReport(raw, session, transcriptSegments);
  }, [debrief?.detailed_report, session, transcriptSegments]);

  const sessionEvents = useMemo(
    () => buildSessionEvents(session, answers, transcriptSegments),
    [session, answers, transcriptSegments],
  );

  const handleShareToken = useCallback(async (token: string) => {
    if (!debrief?.id || !user?.id) return;
    await sessionDebriefsDB.updateShareToken(debrief.id, user.id, token);
    if (debrief.session_id) {
      try {
        await scorecardsDB.markShared(debrief.session_id, user.id, token);
      } catch {
        /* debrief share still succeeds if scorecard row is missing */
      }
    }
    setDebrief((d: any) => ({
      ...d,
      detailed_report: { ...(d.detailed_report ?? {}), share_token: token, is_shared: true },
    }));
  }, [debrief?.id, debrief?.session_id, user?.id]);

  const debriefTitle = session?.session_type
    ? `${session.session_type.charAt(0).toUpperCase() + session.session_type.slice(1)} Interview`
    : "Session Debrief";
  const debriefSubtitle = debrief?.created_at
    ? format(new Date(debrief.created_at), "EEEE, MMMM d yyyy")
    : undefined;

  const debriefBreadcrumbs = [
    { label: "Dashboard", href: "/app/dashboard" },
    { label: "Debriefs", href: "/app/debriefs" },
    { label: debriefTitle },
  ];

  // ── Loading state — initial DB fetch ─────────────────────────
  if (loading) {
    return (
      <div className="max-w-3xl space-y-5">
        <PageHeader
          title="Session Debrief"
          description="Loading debrief…"
          breadcrumbs={debriefBreadcrumbs.slice(0, 2).concat([{ label: "Loading…" }])}
        />
        <DebriefLoadingSteps activeIndex={loadStep} debriefJob={debriefJob} />
        <SkeletonCard />
      </div>
    );
  }

  // FIX 6: dedicated generation state — no skeletons during AI generation
  if (genning) {
    return (
      <div className="max-w-3xl flex flex-col items-center justify-center py-24 gap-5">
        <div className="w-14 h-14 rounded-2xl bg-primary/20 flex items-center justify-center">
          <Brain className="w-7 h-7 text-primary animate-pulse" />
        </div>
        <div className="text-center space-y-2">
          <p className="text-sm font-semibold text-foreground">
            {debriefJobStatusLabel(debriefJob?.status) === "Processing"
              ? "Evaluating recorded answers…"
              : "Generating your debrief…"}
          </p>
          <p className="text-xs text-muted-foreground">
            Status only — no preliminary grades until evaluation finishes.
          </p>
        </div>
        <DebriefLoadingSteps
          activeIndex={loadStep}
          debriefJob={debriefJob}
          onCancel={
            debriefJob && isSessionDebriefInFlight(debriefJob.status)
              ? () => void cancelGenerateDebrief()
              : undefined
          }
        />
        <Button
          variant="secondary"
          size="sm"
          onClick={() => void cancelGenerateDebrief()}
        >
          Cancel generation
        </Button>
      </div>
    );
  }

  // ── Error state ───────────────────────────────────────────────
  if (fetchError && !debrief) {
    return (
      <div className="max-w-3xl space-y-5">
        <PageHeader
          title="Session Debrief"
          breadcrumbs={debriefBreadcrumbs.slice(0, 2).concat([{ label: "Error" }])}
        />
        <Card>
          <EmptyState
            icon={AlertTriangle}
            title="Couldn't load debrief"
            description={fetchError}
            actionLabel={session && id ? "Generate debrief" : "Retry"}
            onAction={
              session && id
                ? () => void generateDebrief(id)
                : fetchDebrief
            }
            secondaryActionLabel="Back to debriefs"
            onSecondaryAction={() => navigate("/app/debriefs")}
          />
        </Card>
      </div>
    );
  }

  // ── Not found state ───────────────────────────────────────────
  if (!debrief && session && id) {
    return (
      <div className="max-w-3xl space-y-5">
        <PageHeader
          title="Session Debrief"
          breadcrumbs={debriefBreadcrumbs.slice(0, 2).concat([{ label: "Not generated" }])}
        />
        <Card>
          {creditGateDenied ? (
            <InsufficientCreditsAction
              operationKey="session_debrief"
              required={AI_CREDIT_COSTS.session_debrief}
              balance={creditKnown ? creditBalance : null}
              mode="credits"
              returnTo={`/app/debriefs/${id}`}
            />
          ) : (
            <EmptyState
              icon={Brain}
              title="No debrief yet"
              description="This session has no saved debrief. Generate one when you are ready — it uses AI credits."
              actionLabel="Generate debrief"
              onAction={() => void generateDebrief(id)}
              secondaryActionLabel="Back to debriefs"
              onSecondaryAction={() => navigate("/app/debriefs")}
            />
          )}
        </Card>
      </div>
    );
  }

  if (!debrief) {
    return (
      <div className="max-w-3xl space-y-5">
        <PageHeader
          title="Session Debrief"
          breadcrumbs={debriefBreadcrumbs.slice(0, 2).concat([{ label: "Not found" }])}
        />
        <Card>
          <EmptyState
            icon={Brain}
            title="Debrief not found"
            description="This debrief may have been deleted or you may not have access."
            actionLabel="Back to debriefs"
            onAction={() => navigate("/app/debriefs")}
          />
        </Card>
      </div>
    );
  }

  // ── Render ────────────────────────────────────────────────────

  return (
    <div className="max-w-3xl space-y-5 animate-in fade-in slide-in-from-bottom-2 duration-200">

      <PageHeader
        title={debriefTitle + (session?.target_company ? ` — ${session.target_company}` : "")}
        description={debriefSubtitle || undefined}
        breadcrumbs={debriefBreadcrumbs}
      />
      <HybridSourceLine source={debriefSource} />

      <nav
        aria-label="Debrief sections"
        className="sticky top-14 sm:top-0 z-10 -mx-1 px-1 py-2 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/80 border-b border-border flex gap-2 overflow-x-auto text-xs overscroll-x-contain"
      >
        {[
          { id: "overview", label: "Overview" },
          { id: "strengths", label: "Strengths" },
          { id: "improvements", label: "Improvements" },
          { id: "charts", label: "Charts" },
          { id: "share", label: "Share" },
        ].map((item) => (
          <a
            key={item.id}
            href={`#debrief-${item.id}`}
            className="shrink-0 rounded-lg border border-border bg-secondary/40 px-3 py-2 min-h-11 inline-flex items-center text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors"
          >
            {item.label}
          </a>
        ))}
      </nav>

      {fetchError && (
        <InlineErrorRetry message={fetchError} onRetry={fetchDebrief} />
      )}

      {/* Hero grade card */}
      <Card id="debrief-overview" className="bg-gradient-to-br from-primary/10 to-blue-600/10 border-primary/20 scroll-mt-16">
        <div className="flex items-start gap-3 sm:gap-5">
          <div className={cn(
            "w-14 h-14 sm:w-20 sm:h-20 rounded-2xl flex items-center justify-center text-2xl sm:text-4xl font-black border-2 shrink-0",
            gradeColor === "emerald" ? "border-emerald-500/50 bg-emerald-500/10 text-emerald-400" :
            gradeColor === "blue"    ? "border-blue-500/50 bg-blue-500/10 text-blue-400"          :
            gradeColor === "amber"   ? "border-amber-500/50 bg-amber-500/10 text-amber-400"       :
            gradeColor === "red"     ? "border-red-500/50 bg-red-500/10 text-red-400"             :
                                       "border-border bg-secondary/40 text-muted-foreground text-sm sm:text-base px-1 text-center"
          )}>
            {debrief.overall_grade ?? "—"}
          </div>

          <div className="flex-1">
            <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-widest">
              AI Debrief
            </p>
            {debrief.overall_grade ? (
              <p className="text-xs text-muted-foreground mt-1">
                Overall grade: {debrief.overall_grade}
              </p>
            ) : (
              <p className="text-xs text-muted-foreground mt-1">
                Overall grade: Not evaluated
              </p>
            )}
            {debrief.summary && (
              <p className="text-sm text-foreground leading-relaxed mt-3">
                {debrief.summary}
              </p>
            )}
            {!debrief.summary && (
              <p className="text-sm text-muted-foreground mt-3">
                No debrief summary was saved for this session. Generate again if needed — we do not invent coaching feedback.
              </p>
            )}
          </div>
        </div>
      </Card>

      <Card id="debrief-share" className="scroll-mt-24 sm:scroll-mt-16">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="text-sm font-semibold text-foreground">Share this debrief</h2>
            <p className="mt-1 text-xs text-muted-foreground">
              Create a read-only link with the grade, summary, strengths, improvements, and action plan.
            </p>
          </div>
          <DebriefShareButton
            debriefId={debrief.id}
            report={detailedReport}
            onShareToken={handleShareToken}
            previewTitle={debriefTitle + (session?.target_company ? ` — ${session.target_company}` : "")}
            previewScore={formatSessionScore(
              scorecard?.overall_score,
              scorecard?.score_status ?? "not_scored",
            )}
            previewSummary={debrief.summary ?? null}
          />
        </div>
      </Card>

      {/* Session metadata, overall score, category breakdown */}
      <DebriefSessionMeta session={session} debrief={debrief} scorecard={scorecard} />

      {/* Priority focus */}
      {debrief.priority_focus && (
        <Card className="flex items-start gap-4 border-amber-500/20 bg-amber-500/5">
          <AlertTriangle className="w-5 h-5 text-amber-400 shrink-0 mt-0.5" />
          <div>
            <p className="text-sm font-semibold text-amber-300">Priority focus area</p>
            <p className="text-xs text-muted-foreground mt-1 leading-relaxed">
              {debrief.priority_focus}
            </p>
          </div>
        </Card>
      )}

      {/* Skill gap analysis */}
      {debrief.skill_gaps?.length > 0 && (
        <Card>
          <div className="flex items-center gap-2 mb-4">
            <Target className="w-4 h-4 text-red-400" />
            <h3 className="text-sm font-semibold text-foreground">Skill gap analysis</h3>
          </div>
          <div className="space-y-4">
            {debrief.skill_gaps.map((gap: any, i: number) => (
              <div key={i}>
                <div className="flex flex-col sm:flex-row sm:items-center justify-between mb-1 gap-0.5">
                  <p className="text-xs font-medium text-foreground">{gap.skill}</p>
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] text-muted-foreground">Current: {gap.current}/10</span>
                    <span className="text-[10px] text-muted-foreground">Target: {gap.target}/10</span>
                  </div>
                </div>
                <div className="relative h-2 bg-secondary rounded-full overflow-hidden">
                  <div
                    className="absolute top-0 h-full w-0.5 bg-primary z-10"
                    style={{ left: `${gap.target * 10}%` }}
                  />
                  <div
                    className={cn(
                      "h-full rounded-full transition-all",
                      gap.current >= gap.target         ? "bg-emerald-500" :
                      gap.current >= gap.target - 2     ? "bg-amber-500"   : "bg-red-500"
                    )}
                    style={{ width: `${gap.current * 10}%` }}
                  />
                </div>
                {gap.note && (
                  <p className="text-[10px] text-muted-foreground mt-1">{gap.note}</p>
                )}
              </div>
            ))}
          </div>
        </Card>
      )}

      {/* Strengths + improvements */}
      <div id="debrief-strengths" className="grid grid-cols-1 sm:grid-cols-2 gap-4 scroll-mt-24 sm:scroll-mt-16">
        {debrief.strengths?.length > 0 && (
          <Card>
            <div className="flex items-center gap-2 mb-3">
              <CheckCircle className="w-4 h-4 text-emerald-400" />
              <h3 className="text-sm font-semibold text-foreground">What went well</h3>
            </div>
            <ul className="space-y-2">
              {debrief.strengths.map((s: string, i: number) => (
                <li key={i} className="flex items-start gap-2 text-xs text-foreground">
                  <span className="text-emerald-500 shrink-0 mt-0.5">✓</span>{s}
                </li>
              ))}
            </ul>
          </Card>
        )}
        {debrief.improvements?.length > 0 && (
          <Card id="debrief-improvements" className="scroll-mt-24 sm:scroll-mt-16">
            <div className="flex items-center gap-2 mb-3">
              <TrendingUp className="w-4 h-4 text-amber-400" />
              <h3 className="text-sm font-semibold text-foreground">To improve</h3>
            </div>
            <ul className="space-y-2">
              {debrief.improvements.map((s: string, i: number) => (
                <li key={i} className="flex items-start gap-2 text-xs text-foreground">
                  <span className="text-amber-500 shrink-0 mt-0.5">→</span>{s}
                </li>
              ))}
            </ul>
          </Card>
        )}
      </div>

      {/* 7-day action plan */}
      {debrief.action_plan?.length > 0 && (
        <Card>
          <div className="flex items-center gap-2 mb-4">
            <Calendar className="w-4 h-4 text-blue-400" />
            <h3 className="text-sm font-semibold text-foreground">7-day action plan</h3>
          </div>
          <div className="space-y-3">
            {debrief.action_plan.map((step: any, i: number) => (
              <div key={i} className="flex items-start gap-3 p-3 bg-secondary border border-border rounded-xl">
                <div className="w-7 h-7 bg-blue-500/10 rounded-lg flex items-center justify-center text-[11px] font-bold text-blue-400 shrink-0">
                  D{step.day ?? i + 1}
                </div>
                <div>
                  <p className="text-xs font-semibold text-foreground">{step.title}</p>
                  {step.description && (
                    <p className="text-[11px] text-muted-foreground mt-0.5 leading-relaxed">
                      {step.description}
                    </p>
                  )}
                  {step.time_estimate && (
                    <div className="flex items-center gap-1 mt-1">
                      <Clock className="w-3 h-3 text-muted-foreground" />
                      <span className="text-[10px] text-muted-foreground">{step.time_estimate}</span>
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        </Card>
      )}

      {/* Study resources */}
      {debrief.resources?.length > 0 && (
        <Card>
          <div className="flex items-center gap-2 mb-4">
            <BookOpen className="w-4 h-4 text-primary" />
            <h3 className="text-sm font-semibold text-foreground">Recommended resources</h3>
          </div>
          <div className="space-y-2">
            {debrief.resources.map((r: any, i: number) => (
              <div key={i} className="flex items-center justify-between p-3 bg-secondary border border-border rounded-xl">
                <div className="flex items-start gap-3">
                  <span className="text-lg">{
                    r.type === "video"   ? "🎥" :
                    r.type === "book"    ? "📚" :
                    r.type === "article" ? "📰" :
                    r.type === "course"  ? "🎓" : "🔗"
                  }</span>
                  <div>
                    <p className="text-xs font-medium text-foreground">{r.title}</p>
                    {r.description && (
                      <p className="text-[10px] text-muted-foreground mt-0.5">{r.description}</p>
                    )}
                  </div>
                </div>
                {r.url && (
                  <a
                    href={r.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-xs text-primary hover:text-primary/80 transition-colors shrink-0 ml-3"
                  >
                    Open ↗
                  </a>
                )}
              </div>
            ))}
          </div>
        </Card>
      )}

      {/* Next session goals */}
      {debrief.next_session_goals?.length > 0 && (
        <Card className="border-emerald-500/20 bg-emerald-500/5">
          <div className="flex items-center gap-2 mb-4">
            <Star className="w-4 h-4 text-emerald-400" />
            <h3 className="text-sm font-semibold text-foreground">Goals for your next session</h3>
          </div>
          <ul className="space-y-2">
            {debrief.next_session_goals.map((g: string, i: number) => (
              <li key={i} className="flex items-start gap-2 text-xs text-foreground">
                <span className="text-emerald-500 shrink-0 tabular-nums mt-0.5">{i + 1}.</span>
                {g}
              </li>
            ))}
          </ul>
        </Card>
      )}

      {/* AI insight */}
      {debrief.insight && (
        <Card className="flex items-start gap-4 bg-primary/10 border-primary/20">
          <Lightbulb className="w-5 h-5 text-primary shrink-0 mt-0.5" />
          <div>
            <p className="text-xs font-semibold text-primary mb-1">AI insight</p>
            <p className="text-sm text-foreground leading-relaxed italic">
              &ldquo;{debrief.insight}&rdquo;
            </p>
          </div>
        </Card>
      )}

      {/* Questions + timeline + analytics */}
      {answers.length === 0 ? (
        <Card>
          <EmptyState
            icon={MessageSquare}
            title="No Q&A recorded"
            description="This session has no question-and-answer pairs to review."
            compact
          />
        </Card>
      ) : (
        <DebriefQuestionsList
          answers={answers.map((a) => ({
            id: a.id,
            question: a.question,
            answer: a.answer,
            score: a.score,
            ai_feedback: a.ai_feedback,
            created_at: a.created_at,
          }))}
        />
      )}
      <DebriefEventTimeline events={sessionEvents} />
      <DebriefMissedKeywords report={detailedReport} transcript={transcript} />
      <div id="debrief-charts" className="space-y-4 scroll-mt-24 sm:scroll-mt-16">
      <DebriefVocalCharts report={detailedReport} />
      <DebriefConfidenceBreakdown scorecard={scorecard} session={session} />
      </div>

      {/* Full transcript */}
      {transcript && (
        <Card>
          <div className="flex items-center gap-2 mb-3">
            <ScrollText className="w-4 h-4 text-blue-400" />
            <h3 className="text-sm font-semibold text-foreground">Full transcript</h3>
          </div>
          <div className="max-h-72 overflow-y-auto rounded-xl bg-secondary/50 border border-border p-4">
            <p className="text-xs text-foreground leading-relaxed whitespace-pre-wrap font-mono">
              {transcript}
            </p>
          </div>
        </Card>
      )}

      {/* Sprint B extras */}
      <div>
      <DebriefExtras
        debriefId={debrief.id}
        wpmSeries={detailedReport.wpm_series}
        missedKeywords={detailedReport.missed_keywords}
        speakers={detailedReport.speakers}
        initialRating={detailedReport.rating ?? null}
      />
      </div>

      {/* CTA row */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <Button
          variant="secondary"
          size="md"
          fullWidth
          onClick={() => navigate(`/app/scorecard/${debrief.session_id}`)}
          leftIcon={<BarChart2 className="w-4 h-4" />}
        >
          View scorecard
        </Button>
        <Button
          variant="primary"
          size="md"
          fullWidth
          onClick={() => navigate("/app/mock")}
          leftIcon={<FlaskConical className="w-4 h-4" />}
          rightIcon={<ChevronRight className="w-4 h-4" />}
        >
          Practice again
        </Button>
      </div>
    </div>
  );
}
