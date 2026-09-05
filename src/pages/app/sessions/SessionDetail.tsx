import { useEffect, useRef, useState, useCallback } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { answerBankDB } from "@/lib/supabase/database";
import { exportSessionPdf } from "@/lib/export/sessionPdf";
import { useAuthStore } from "@/store/userStore";
import { loadOwnedSessionDetail } from "@/lib/sessions/ownedSessionDetail";
import { PAGE_SHELL_STANDARD } from "@/lib/ui/responsivePage";
import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { ProgressBar } from "@/components/ui/ProgressBar";
import { SkeletonCard } from "@/components/ui/SkeletonLoader";
import { EmptyState } from "@/components/common/EmptyState";
import { InlineErrorRetry } from "@/components/common/InlineErrorRetry";
import { AiFormattedOutput } from "@/components/common/AiFormattedOutput";
import { Modal } from "@/components/ui/Modal";
import { toast } from "sonner";
import {
  BarChart2, Clock, MessageSquare, Download,
  ChevronLeft, ChevronRight, ChevronDown, ChevronUp,
  Star, Zap, CheckCircle,
  Brain, Mic, Volume2, TrendingUp,
  ThumbsUp, Share2, RefreshCw, AlertTriangle,
} from "lucide-react";
import { format } from "date-fns";
import { cn } from "@/lib/utils";
import { messageFromExportCaught } from "@/lib/export/exportUserFacingError";
import { agentDebugIngest } from "@/lib/debug/agentIngest";
import {
  formatSessionDuration,
  resolveOverallScore,
  sessionStatusLabel,
} from "@/lib/session/sessionDisplay";
import { buildSessionTranscriptView } from "@/lib/session/sessionTranscriptTurns";
import { formatSessionScore } from "@/lib/analytics/scoreStatus";
import { unscoredReasonLabel } from "@/lib/results/resultDisplay";
import { issueShareToken } from "@/lib/session/issueShareToken";
import {
  SESSION_SHAREABILITY_MESSAGES,
  type SessionShareabilityCode,
} from "@/lib/session/sessionShareability";
import { ApiClientError } from "@/lib/api/apiClient";
import { buildShareUrl } from "@/lib/utils";
import { parseMockProgressNotes } from "@/lib/mock/mockSessionProgress";

export default function SessionDetail() {
  const { id }   = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { user } = useAuthStore();

  const [session,     setSession]     = useState<any>(null);
  const [answers,     setAnswers]     = useState<any[]>([]);
  const [scorecard,   setScorecard]   = useState<{
    overall_score?: number | null;
    score_status?: string | null;
    evaluation_status?: string | null;
    eligibility_reason?: string | null;
    is_shared?: boolean | null;
    share_token?: string | null;
  } | null>(null);
  const [transcript,  setTranscript]  = useState<{
    content?: string | null;
    utterances?: unknown;
  } | null>(null);
  const [debriefSummary, setDebriefSummary] = useState<string | null>(null);
  const [debriefId, setDebriefId] = useState<string | null>(null);
  const [loading,     setLoading]     = useState(true);
  const [fetchError,  setFetchError]  = useState<string | null>(null);
  const [expanded,    setExpanded]    = useState<Record<string, boolean>>({});
  const [chatOpen,    setChatOpen]    = useState(false);
  const [shareOpen,   setShareOpen]   = useState(false);
  const [shareBusy, setShareBusy] = useState(false);
  const [shareStatus, setShareStatus] = useState<{
    code: SessionShareabilityCode | string;
    message: string;
    shareUrl: string | null;
    isShared: boolean;
  } | null>(null);
  const [userIdWhenMounted] = useState(user?.id); // Capture user.id at mount for stable comparison
  const fetchRequestRef = useRef(0);

  // ── Fetch session + answers ───────────────────────────────────

  const fetchSession = useCallback(async () => {
    if (!id) {
      setFetchError("Session ID is required");
      setLoading(false);
      return;
    }
    if (!user?.id) {
      // User data not yet loaded — wait for auth to complete
      return;
    }
    const requestId = ++fetchRequestRef.current;
    setLoading(true);
    setFetchError(null);

    try {
      const detail = await loadOwnedSessionDetail(id, user.id);
      if (requestId !== fetchRequestRef.current) return;

      if (detail.code === "NOT_AUTHENTICATED") {
        setFetchError("Your session expired. Please sign in again to view session details.");
        setSession(null);
        setScorecard(null);
        setAnswers([]);
        setTranscript(null);
        setDebriefSummary(null);
        return;
      }

      agentDebugIngest({
        sessionId: "fcd48a",
        runId: "prompt05-verify",
        hypothesisId: "SES",
        location: "SessionDetail.tsx:fetchSession",
        message: "session detail loaded",
        data: {
          requestedId: id,
          found: Boolean(detail.session?.id),
          status: detail.session?.status ?? null,
          answerCount: Array.isArray(detail.answers) ? detail.answers.length : 0,
          code: detail.code,
        },
      });

      setSession(detail.session);
      setScorecard(detail.scorecard);
      setTranscript(detail.transcript ?? null);
      const debrief = detail.debrief;
      const summary =
        typeof debrief?.summary === "string"
          ? debrief.summary
          : typeof debrief?.insight === "string"
            ? debrief.insight
            : null;
      setDebriefSummary(summary);
      setDebriefId(
        typeof debrief?.id === "string" && debrief.id.trim() ? debrief.id : null,
      );
      setAnswers(
        [...detail.answers]
          .sort((a, b) => {
            const ai = a.question_index;
            const bi = b.question_index;
            if (typeof ai === "number" && typeof bi === "number" && ai !== bi) return ai - bi;
            if (typeof ai === "number" && typeof bi !== "number") return -1;
            if (typeof bi === "number" && typeof ai !== "number") return 1;
            return String(a.created_at).localeCompare(String(b.created_at));
          })
          .map((row) => ({
            id: row.id,
            question_text: row.question,
            transcript: row.answer,
            score: row.score,
            ai_feedback: row.ai_feedback,
            question_index:
              typeof row.question_index === "number" ? row.question_index : null,
            question_tags: [],
            content_score: row.score,
            structure_score: null,
            communication_score: null,
            confidence_score: null,
            session_id: id,
            star_breakdown: null,
          })),
      );

      if (detail.answers.length === 0 && detail.session?.notes) {
        const progress = parseMockProgressNotes(detail.session.notes);
        if (progress?.answers?.length) {
          setAnswers(
            [...progress.answers]
              .sort((a, b) => a.question_index - b.question_index)
              .map((row, index) => ({
                id: row.question_id ?? `mock-progress-${index}`,
                question_text: row.question_text,
                transcript: row.skipped ? "" : row.answer_text,
                score: null,
                ai_feedback: null,
                question_index: row.question_index,
                question_tags: [],
                content_score: null,
                structure_score: null,
                communication_score: null,
                confidence_score: null,
                session_id: id,
                star_breakdown: null,
              })),
          );
        }
      }
    } catch (err) {
      if (requestId !== fetchRequestRef.current) return;
      const raw = err instanceof Error ? err.message : String(err ?? "");
      const authLike =
        /jwt|unauthorized|401|not authenticated|invalid.*token|session.*expired/i.test(raw);
      setFetchError(
        authLike
          ? "Your session expired. Please sign in again to view session details."
          : "We couldn't load this session. Please retry — we did not invent empty session data.",
      );
      setSession(null);
      setScorecard(null);
      setAnswers([]);
      setTranscript(null);
      setDebriefSummary(null);
    } finally {
      if (requestId === fetchRequestRef.current) setLoading(false);
    }
  }, [id, user?.id]);

  useEffect(() => {
    void fetchSession();
  }, [fetchSession]);

  const refreshShareStatus = useCallback(async () => {
    if (!session?.id) return;
    setShareBusy(true);
    try {
      const status = await issueShareToken(session.id, "status");
      const token =
        typeof status.share_token === "string" && status.share_token.trim().length >= 16
          ? status.share_token.trim()
          : null;
      setShareStatus({
        code: (status.code as SessionShareabilityCode) || "SCORECARD_REQUIRED",
        message:
          status.message ||
          status.error ||
          SESSION_SHAREABILITY_MESSAGES[
            (status.code as SessionShareabilityCode) || "SCORECARD_REQUIRED"
          ] ||
          "Checking share eligibility…",
        shareUrl: token ? buildShareUrl(token) : null,
        isShared: Boolean(status.is_shared || token),
      });
    } catch (err) {
      const code =
        err instanceof ApiClientError && typeof err.code === "string"
          ? err.code
          : "SCORECARD_REQUIRED";
      const message =
        err instanceof ApiClientError
          ? err.message
          : SESSION_SHAREABILITY_MESSAGES.SCORECARD_REQUIRED;
      setShareStatus({
        code,
        message,
        shareUrl: null,
        isShared: false,
      });
    } finally {
      setShareBusy(false);
    }
  }, [session?.id]);

  async function openShareModal() {
    setShareOpen(true);
    setShareStatus(null);
    await refreshShareStatus();
  }

  async function handleIssueShare() {
    if (!session?.id || shareBusy) return;
    setShareBusy(true);
    try {
      const issued = await issueShareToken(session.id, "issue");
      const token =
        typeof issued.share_token === "string" && issued.share_token.trim().length >= 16
          ? issued.share_token.trim()
          : null;
      const url = token ? buildShareUrl(token) : issued.share_url ?? null;
      if (url) {
        await navigator.clipboard.writeText(url);
        setShareStatus({
          code: "SHARE_READY",
          message: issued.idempotent
            ? "Share link copied (same link as before)."
            : "Share link created and copied.",
          shareUrl: url,
          isShared: true,
        });
        toast.success("Share link copied");
        return;
      }
      setShareStatus({
        code: (issued.code as SessionShareabilityCode) || "SCORECARD_REQUIRED",
        message:
          issued.error ||
          issued.message ||
          SESSION_SHAREABILITY_MESSAGES.SCORECARD_REQUIRED,
        shareUrl: null,
        isShared: false,
      });
    } catch (err) {
      const code =
        err instanceof ApiClientError && typeof err.code === "string"
          ? err.code
          : "SCORECARD_REQUIRED";
      const message =
        err instanceof ApiClientError
          ? err.message
          : "Could not create a share link. Please try again.";
      setShareStatus({
        code,
        message,
        shareUrl: null,
        isShared: false,
      });
      if (code !== "SESSION_INCOMPLETE" && code !== "SCORECARD_REQUIRED") {
        toast.error(message);
      }
    } finally {
      setShareBusy(false);
    }
  }

  async function handleRevokeShare() {
    if (!session?.id || shareBusy) return;
    setShareBusy(true);
    try {
      await issueShareToken(session.id, "revoke");
      setShareStatus({
        code: "SCORECARD_REQUIRED",
        message: "Share link revoked. Public access is disabled.",
        shareUrl: null,
        isShared: false,
      });
      toast.success("Share link revoked");
    } catch (err) {
      toast.error(
        err instanceof ApiClientError
          ? err.message
          : "Could not revoke the share link.",
      );
    } finally {
      setShareBusy(false);
    }
  }

  // ── Derived values ────────────────────────────────────────────

  const score = resolveOverallScore(session, scorecard);
  const scoreStatus = scorecard?.score_status ?? (score !== null ? "scored" : "not_scored");
  const scoreLabel = formatSessionScore(score, scoreStatus);
  const hasOverallScore = score !== null && scoreStatus === "scored";
  const unscoredReason = !hasOverallScore
    ? unscoredReasonLabel({
        evaluationStatus: scorecard?.evaluation_status,
        eligibilityReason: scorecard?.eligibility_reason,
        fallback: "Not evaluated — generate a scorecard when this session is eligible.",
      })
    : null;
  const scoreColor =
    !hasOverallScore ? "gray" :
    score! >= 80 ? "emerald" :
    score! >= 60 ? "amber"   : "red";

  const scoreTier =
    !hasOverallScore ? scoreLabel :
    score! >= 85 ? "Excellent" :
    score! >= 70 ? "Good" :
    score! >= 55 ? "Fair" : "Needs work";

  const duration = formatSessionDuration(session ?? {});
  const statusLabel = sessionStatusLabel(session ?? {});
  const transcriptView = buildSessionTranscriptView({
    utterances: transcript?.utterances,
    content: transcript?.content ?? null,
    answers: answers.map((a) => ({
      question: a.question_text,
      answer: a.transcript,
      ai_feedback: a.ai_feedback,
      question_index: a.question_index,
    })),
  });
  const hasTranscriptPanel =
    transcriptView.mode !== "empty" || Boolean(debriefSummary);

  // ── Loading state ─────────────────────────────────────────────

  if (loading) {
    return (
      <div className={cn(PAGE_SHELL_STANDARD, "space-y-5")}>
        <SkeletonCard />
        <SkeletonCard />
        <SkeletonCard />
      </div>
    );
  }

  // ── Error state ───────────────────────────────────────────────

  if (fetchError) {
    return (
      <div className={cn(PAGE_SHELL_STANDARD, "space-y-4")}>
        <InlineErrorRetry message={fetchError} onRetry={() => void fetchSession()} />
        <Button variant="secondary" size="sm" onClick={() => navigate("/app/sessions")}>
          ← Back to sessions
        </Button>
      </div>
    );
  }

  // ── Not found state ───────────────────────────────────────────

  if (!session) {
    return (
      <div className={PAGE_SHELL_STANDARD}>
        <Card>
          <EmptyState
            icon={MessageSquare}
            title="Session not found"
            description="This session may have been deleted or the link is invalid."
            actionLabel="Back to sessions"
            onAction={() => navigate("/app/sessions")}
            compact
          />
        </Card>
      </div>
    );
  }

  // ── Render ────────────────────────────────────────────────────

  return (
    <div className={cn(PAGE_SHELL_STANDARD, "space-y-5")}>

      {/* ── Header ───────────────────────────────────── */}
      <div className="flex flex-col sm:flex-row sm:items-center gap-3">
        <div className="flex items-center gap-3 min-w-0">
          <button
            type="button"
            aria-label="Back to sessions"
            onClick={() => navigate("/app/sessions")}
            className="p-2 rounded-xl bg-accent/5 hover:bg-accent/10 text-muted-foreground hover:text-foreground transition-all shrink-0"
          >
            <ChevronLeft className="w-4 h-4" aria-hidden="true" />
          </button>
          <div className="min-w-0">
            <h1 className="text-lg sm:text-xl font-bold text-foreground capitalize truncate">
              {(session.type ?? session.session_type ?? "practice")} Interview
              {session.target_company && ` — ${session.target_company}`}
            </h1>
            <p className="text-muted-foreground text-[10px] sm:text-xs mt-0.5">
              {format(new Date(session.created_at), "EEEE, MMMM d yyyy · h:mm a")}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2 sm:ml-auto shrink-0 flex-wrap">
          <Button
            variant="secondary"
            size="sm"
            onClick={() => navigate(`/app/scorecard/${session.id}`)}
            leftIcon={<BarChart2 className="w-3.5 h-3.5" />}
          >
            Scorecard
          </Button>
          <Button
            variant="secondary"
            size="sm"
            onClick={() =>
              navigate(`/app/debriefs/${debriefId ?? session.id}`)
            }
            leftIcon={<Brain className="w-3.5 h-3.5" />}
          >
            Debrief
          </Button>
          <Button
            variant="secondary"
            size="sm"
            onClick={() => void openShareModal()}
            leftIcon={<Share2 className="w-3.5 h-3.5" />}
          >
            Share
          </Button>
          <Button
            variant="secondary"
            size="sm"
            leftIcon={<Download className="w-3.5 h-3.5" />}
            onClick={() => {
              try {
                exportSessionPdf({
                  title: `${session.session_type ?? "Session"} Interview${session.target_company ? ` — ${session.target_company}` : ""}`,
                  dateLabel: format(new Date(session.created_at), "EEEE, MMMM d yyyy · h:mm a"),
                  overallScore: hasOverallScore ? score : null,
                  durationLabel: duration,
                  aiFeedback: session.ai_feedback ?? null,
                  answers: answers.map((a) => ({
                    question_text: a.question_text,
                    transcript: a.transcript,
                    score: a.score,
                  })),
                });
                toast.success("PDF downloaded");
              } catch (err) {
                toast.error(messageFromExportCaught(err));
              }
            }}
          >
            Export PDF
          </Button>
        </div>
      </div>

      {/* ── Overall scorecard ─────────────────────────── */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Card className="sm:col-span-1 flex flex-col items-center justify-center py-6 text-center">
          <div className={cn(
            "text-4xl sm:text-6xl font-black mb-1",
            scoreColor === "emerald" ? "text-emerald-400" :
            scoreColor === "amber"   ? "text-amber-400"   :
            scoreColor === "gray"    ? "text-muted-foreground" : "text-red-400"
          )}>
            {hasOverallScore && score !== null ? score : scoreLabel}
          </div>
          <p className="text-foreground text-sm font-medium">{scoreTier}</p>
          <p className="text-muted-foreground text-xs mt-1">Overall score</p>
          {unscoredReason && (
            <p className="text-muted-foreground text-[11px] mt-2 max-w-[14rem] leading-snug px-2">
              {unscoredReason}
            </p>
          )}
          {hasOverallScore && score !== null && (
            <ProgressBar value={score} max={100} color={scoreColor === "gray" ? "violet" : scoreColor} size="sm" className="mt-4 w-32" />
          )}
        </Card>

        <Card className="sm:col-span-2">
          <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-widest mb-4">
            Dimension breakdown
          </h3>
          <div className="space-y-3">
            {[
              { label: "Content & Relevance",  key: "content_score"      },
              { label: "Structure (STAR)",      key: "structure_score"    },
              { label: "Communication",         key: "communication_score"},
              { label: "Confidence & Delivery", key: "confidence_score"   },
            ].map((dim) => {
              const raw = session[dim.key];
              const unscored = raw === null || raw === undefined;
              const val = unscored ? 0 : Number(raw);
              const c: "emerald" | "amber" | "red" =
                val >= 75 ? "emerald" : val >= 50 ? "amber" : "red";
              return (
                <div key={dim.key} className="flex items-center gap-3">
                  <span className="text-[10px] sm:text-xs text-muted-foreground w-28 sm:w-40 shrink-0">{dim.label}</span>
                  {unscored ? (
                    <span className="flex-1 text-xs text-muted-foreground">
                      Not scored
                      {unscoredReason ? (
                        <span className="block text-[10px] opacity-80 mt-0.5">{unscoredReason}</span>
                      ) : null}
                    </span>
                  ) : (
                    <ProgressBar value={val} max={100} color={c} size="sm" className="flex-1" />
                  )}
                  <span className={cn(
                    "text-xs font-bold w-8 text-right tabular-nums",
                    unscored ? "text-muted-foreground" :
                    c === "emerald" ? "text-emerald-400" :
                    c === "amber"   ? "text-amber-400"   : "text-red-400"
                  )}>
                    {unscored ? "—" : val}
                  </span>
                </div>
              );
            })}
          </div>
        </Card>
      </div>

      {/* ── Session stats row ──────────────────────────── */}
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
        {[
          { icon: <Clock className="w-4 h-4 text-blue-400" />,         label: "Duration",     value: duration },
          { icon: <CheckCircle className="w-4 h-4 text-emerald-400" />, label: "Status",      value: statusLabel },
          { icon: <MessageSquare className="w-4 h-4 text-primary" />,label: "Questions",    value: `${answers.length} / ${session.question_count ?? answers.length}` },
          { icon: <Volume2 className="w-4 h-4 text-emerald-400" />,    label: "Avg WPM",      value: typeof session.avg_wpm === "number" ? `${session.avg_wpm}` : "—" },
          { icon: <Mic className="w-4 h-4 text-amber-400" />, label: "Total fillers",value: typeof session.filler_words === "number" ? session.filler_words : (typeof session.total_filler_words === "number" ? session.total_filler_words : "—") },
        ].map((stat) => (
          <Card key={stat.label} padding="sm" className="flex items-center gap-3">
            {stat.icon}
            <div>
              <p className="text-sm font-bold text-foreground">{stat.value}</p>
              <p className="text-[10px] text-muted-foreground">{stat.label}</p>
            </div>
          </Card>
        ))}
      </div>

      {(hasTranscriptPanel) && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {transcriptView.mode !== "empty" && (
            <Card>
              <h3 className="text-sm font-semibold text-foreground mb-2 flex items-center gap-2">
                <Mic className="w-4 h-4 text-primary" />
                Transcript
              </h3>
              {transcriptView.mode === "turns" ? (
                <div className="space-y-2 max-h-64 overflow-y-auto font-mono text-xs">
                  {transcriptView.turns.map((turn) => (
                    <div key={turn.id} className="flex gap-2 items-start">
                      <span
                        className={cn(
                          "w-10 shrink-0 text-[10px] font-semibold uppercase tracking-wider pt-0.5",
                          turn.label === "THEM" && "text-amber-500",
                          turn.label === "YOU" && "text-blue-500",
                          turn.label === "AI" && "text-primary",
                          turn.label === "…" && "text-muted-foreground",
                        )}
                      >
                        {turn.label}
                      </span>
                      <p className="text-sm text-foreground leading-relaxed whitespace-pre-wrap flex-1">
                        {turn.text}
                      </p>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-foreground leading-relaxed whitespace-pre-wrap max-h-64 overflow-y-auto">
                  {transcriptView.flatContent}
                </p>
              )}
              {transcriptView.groups.length > 0 && transcriptView.mode === "turns" && (
                <div className="mt-4 pt-3 border-t border-border space-y-3">
                  <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-widest">
                    Turn groups
                  </p>
                  {transcriptView.groups.map((group) => (
                    <div key={group.id} className="space-y-1.5 rounded-lg bg-secondary/40 p-2.5">
                      {group.interviewer && (
                        <p className="text-xs text-foreground">
                          <span className="font-semibold text-amber-500 mr-1.5">THEM</span>
                          {group.interviewer}
                        </p>
                      )}
                      {group.candidate && (
                        <p className="text-xs text-foreground">
                          <span className="font-semibold text-blue-500 mr-1.5">YOU</span>
                          {group.candidate}
                        </p>
                      )}
                      {group.aiSuggestion && (
                        <p className="text-xs text-foreground">
                          <span className="font-semibold text-primary mr-1.5">AI</span>
                          {group.aiSuggestion}
                        </p>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </Card>
          )}
          {debriefSummary && (
            <Card>
              <h3 className="text-sm font-semibold text-foreground mb-2 flex items-center gap-2">
                <Brain className="w-4 h-4 text-primary" />
                Report
              </h3>
              <AiFormattedOutput text={debriefSummary} className="text-sm text-foreground leading-relaxed" />
            </Card>
          )}
        </div>
      )}

      {/* ── AI Overall Feedback ────────────────────────── */}
      {session.ai_feedback && (
        <Card>
          <div className="flex items-center gap-2 mb-3">
            <Brain className="w-4 h-4 text-primary" />
            <h3 className="text-sm font-semibold text-foreground">AI Feedback Summary</h3>
          </div>
          <AiFormattedOutput text={session.ai_feedback} className="text-sm text-foreground leading-relaxed" />
          {session.strengths?.length > 0 && (
            <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <p className="text-xs font-semibold text-emerald-400 mb-2 flex items-center gap-1.5">
                  <CheckCircle className="w-3.5 h-3.5" /> Strengths
                </p>
                <ul className="space-y-1.5">
                  {session.strengths.map((s: string, i: number) => (
                    <li key={i} className="text-xs text-foreground flex items-start gap-2">
                      <span className="text-emerald-500 mt-0.5 shrink-0">✓</span>{s}
                    </li>
                  ))}
                </ul>
              </div>
              <div>
                <p className="text-xs font-semibold text-amber-400 mb-2 flex items-center gap-1.5">
                  <TrendingUp className="w-3.5 h-3.5" /> Areas to improve
                </p>
                <ul className="space-y-1.5">
                  {(session.improvements ?? []).map((s: string, i: number) => (
                    <li key={i} className="text-xs text-foreground flex items-start gap-2">
                      <span className="text-amber-500 mt-0.5 shrink-0">→</span>{s}
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          )}
        </Card>
      )}

      {/* ── Per-question review ────────────────────────── */}
      <div>
        <h2 className="text-sm font-semibold text-foreground mb-3 flex items-center gap-2">
          <MessageSquare className="w-4 h-4 text-primary" />
          Question-by-question review
        </h2>
        <div className="space-y-3">
          {answers.length === 0 ? (
            <Card>
              <EmptyState
                icon={MessageSquare}
                title="No questions recorded"
                description="This session has no question-and-answer data yet."
                compact
              />
            </Card>
          ) : answers.map((ans, i) => {
            const isOpen  = expanded[ans.id];
            const displayIndex =
              typeof ans.question_index === "number" ? ans.question_index + 1 : i + 1;
            const qScore  = ans.score ?? null;
            const qColor  =
              qScore === null ? "gray"    :
              qScore >= 75    ? "emerald" :
              qScore >= 50    ? "amber"   : "red";

            return (
              <Card key={ans.id} padding="sm">
                <button
                  type="button"
                  id={`session-answer-trigger-${ans.id}`}
                  aria-expanded={isOpen}
                  aria-controls={`session-answer-panel-${ans.id}`}
                  className="w-full flex items-start gap-3 text-left"
                  onClick={() => setExpanded((p) => ({ ...p, [ans.id]: !p[ans.id] }))}
                >
                  <div className="w-7 h-7 bg-secondary rounded-lg flex items-center justify-center text-xs font-bold text-muted-foreground shrink-0 mt-0.5">
                    {displayIndex}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-foreground line-clamp-2">
                      {ans.question_text}
                    </p>
                    {ans.question_tags?.length > 0 && (
                      <div className="flex gap-1.5 mt-1 flex-wrap">
                        {ans.question_tags.map((t: string) => (
                          <Badge key={t} variant="gray" size="sm">{t}</Badge>
                        ))}
                      </div>
                    )}
                  </div>
                  <div className="flex items-center gap-2 shrink-0 ml-2">
                    {qScore !== null && (
                      <span className={cn(
                        "text-sm font-black px-2 py-0.5 rounded-lg",
                        qColor === "emerald" ? "bg-emerald-500/10 text-emerald-400" :
                        qColor === "amber"   ? "bg-amber-500/10 text-amber-400"     :
                        qColor === "red"     ? "bg-red-500/10 text-red-400"         :
                                               "bg-secondary text-muted-foreground"
                      )}>
                        {qScore}
                      </span>
                    )}
                    {isOpen
                      ? <ChevronUp className="w-4 h-4 text-muted-foreground" />
                      : <ChevronDown className="w-4 h-4 text-muted-foreground" />
                    }
                  </div>
                </button>

                {isOpen && (
                  <div
                    id={`session-answer-panel-${ans.id}`}
                    role="region"
                    aria-labelledby={`session-answer-trigger-${ans.id}`}
                    className="mt-4 space-y-4 pt-4 border-t border-border"
                  >
                    {ans.transcript && (
                      <div>
                        <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-widest mb-1.5">
                          Your answer
                        </p>
                        <p className="text-sm text-foreground leading-relaxed">{ans.transcript}</p>
                      </div>
                    )}

                    {(ans.content_score || ans.structure_score) && (
                      <div className="grid grid-cols-2 gap-2">
                        {[
                          { label: "Content",    val: ans.content_score       },
                          { label: "Structure",  val: ans.structure_score     },
                          { label: "Delivery",   val: ans.communication_score },
                          { label: "Confidence", val: ans.confidence_score    },
                        ].filter((d) => d.val !== null && d.val !== undefined)
                          .map((d) => (
                            <div key={d.label} className="flex items-center gap-2">
                              <span className="text-xs text-muted-foreground w-20 shrink-0">{d.label}</span>
                              <ProgressBar
                                value={d.val}
                                max={100}
                                color={d.val >= 70 ? "emerald" : d.val >= 50 ? "amber" : "red"}
                                size="xs"
                                className="flex-1"
                              />
                              <span className="text-xs font-bold text-foreground w-6 text-right">{d.val}</span>
                            </div>
                          ))}
                      </div>
                    )}

                    <div className="flex flex-wrap gap-3 text-xs text-muted-foreground">
                      {ans.wpm             && <span className="flex items-center gap-1"><Mic className="w-3 h-3" />{ans.wpm} WPM</span>}
                      {ans.filler_count !== null && <span className="flex items-center gap-1"><AlertTriangle className="w-3 h-3" />{ans.filler_count} fillers</span>}
                      {ans.duration_seconds && <span className="flex items-center gap-1"><Clock className="w-3 h-3" />{ans.duration_seconds}s</span>}
                    </div>

                    {ans.ai_feedback && (
                      <div className="bg-secondary border border-border rounded-xl p-4">
                        <p className="text-[10px] font-semibold text-primary uppercase tracking-widest mb-2">
                          AI feedback
                        </p>
                        <p className="text-xs text-foreground leading-relaxed">{ans.ai_feedback}</p>
                      </div>
                    )}

                    {ans.model_answer && (
                      <div className="bg-emerald-500/5 border border-emerald-500/15 rounded-xl p-4">
                        <p className="text-[10px] font-semibold text-emerald-400 uppercase tracking-widest mb-2">
                          Model answer
                        </p>
                        <p className="text-xs text-foreground leading-relaxed whitespace-pre-wrap">
                          {ans.model_answer}
                        </p>
                      </div>
                    )}

                    {ans.star_breakdown && (
                      <div className="grid grid-cols-2 gap-2">
                        {Object.entries(ans.star_breakdown).map(([key, val]) => (
                          <div key={key} className="bg-secondary border border-border rounded-xl p-3">
                            <p className="text-[10px] font-bold text-primary uppercase mb-1">{key}</p>
                            <p className="text-xs text-muted-foreground">{val as string}</p>
                          </div>
                        ))}
                      </div>
                    )}

                    {/* FIX 3: upsert with duplicate guard + all relevant fields */}
                    <div className="flex gap-2">
                      <Button
                        variant="secondary"
                        size="xs"
                        leftIcon={<Star className="w-3 h-3" />}
                        onClick={async () => {
                          if (!user?.id) {
                            toast.error("Sign in to save answers.");
                            return;
                          }
                          try {
                            await answerBankDB.upsert(user.id, {
                              question_text: ans.question_text,
                              answer_text: ans.transcript,
                              tags: ans.question_tags ?? [],
                              source: "session",
                            });
                            toast.success("Saved to Answer Bank");
                          } catch (err: unknown) {
                            toast.error(err instanceof Error ? err.message : "Failed to save answer.");
                          }
                        }}
                      >
                        Save to Answer Bank
                      </Button>
                      <Button
                        variant="ghost"
                        size="xs"
                        leftIcon={<RefreshCw className="w-3 h-3" />}
                        onClick={() => setChatOpen(true)}
                      >
                        Drill this
                      </Button>
                    </div>
                  </div>
                )}
              </Card>
            );
          })}
        </div>
      </div>

      {/* ── Debrief CTA ───────────────────────────────── */}
      <Card className="flex flex-col sm:flex-row items-start sm:items-center gap-3 sm:gap-4 bg-gradient-to-r from-primary/10 to-blue-600/10 border-primary/20">
        <div className="flex items-center gap-3 flex-1 min-w-0">
          <div className="w-10 h-10 bg-primary/20 rounded-xl flex items-center justify-center shrink-0">
            <Brain className="w-5 h-5 text-primary" />
          </div>
          <div className="min-w-0">
            <p className="text-sm font-semibold text-foreground">Deep-dive debrief</p>
            <p className="text-xs text-muted-foreground mt-0.5">
              AI-generated action plan, gap analysis, and what to study next.
            </p>
          </div>
        </div>
        <Button
          variant="primary"
          size="sm"
          className="w-full sm:w-auto shrink-0"
          onClick={() => navigate(`/app/debriefs/${debriefId ?? session.id}`)}
          rightIcon={<ChevronRight className="w-3.5 h-3.5" />}
        >
          View debrief
        </Button>
      </Card>

      <Modal open={shareOpen} onClose={() => setShareOpen(false)} title="Share session report" size="sm">
        <div className="space-y-3">
          {shareBusy && !shareStatus ? (
            <p className="text-sm text-muted-foreground">Checking share eligibility…</p>
          ) : null}
          {shareStatus ? (
            <p
              className={cn(
                "text-sm leading-relaxed",
                shareStatus.code === "SESSION_INCOMPLETE" ||
                  shareStatus.code === "SESSION_ABANDONED"
                  ? "text-amber-700 dark:text-amber-200"
                  : "text-muted-foreground",
              )}
              data-testid="session-share-status"
            >
              {shareStatus.message}
            </p>
          ) : null}
          {shareStatus?.shareUrl ? (
            <p className="text-xs break-all rounded-lg border border-border bg-secondary/40 px-3 py-2 font-mono">
              {shareStatus.shareUrl}
            </p>
          ) : null}
          <div className="flex flex-col sm:flex-row gap-2">
            {shareStatus?.code === "SHARE_READY" || shareStatus?.shareUrl ? (
              <Button
                variant="primary"
                size="sm"
                className="w-full"
                loading={shareBusy}
                onClick={() => void handleIssueShare()}
              >
                {shareStatus.shareUrl ? "Copy share link" : "Create share link"}
              </Button>
            ) : shareStatus?.code === "SCORECARD_REQUIRED" ? (
              <Button
                variant="primary"
                size="sm"
                className="w-full"
                onClick={() => {
                  setShareOpen(false);
                  navigate(`/app/scorecard/${session.id}`);
                }}
              >
                Open scorecard
              </Button>
            ) : shareStatus?.code === "SHARE_DISABLED" ? (
              <Button
                variant="primary"
                size="sm"
                className="w-full"
                onClick={() => {
                  setShareOpen(false);
                  navigate("/app/settings/privacy");
                }}
              >
                Open privacy settings
              </Button>
            ) : shareStatus?.code === "SESSION_INCOMPLETE" ||
              shareStatus?.code === "SESSION_ABANDONED" ? null : (
              <Button
                variant="primary"
                size="sm"
                className="w-full"
                loading={shareBusy}
                onClick={() => void handleIssueShare()}
              >
                Create share link
              </Button>
            )}
            {shareStatus?.isShared ? (
              <Button
                variant="secondary"
                size="sm"
                className="w-full"
                loading={shareBusy}
                onClick={() => void handleRevokeShare()}
              >
                Revoke link
              </Button>
            ) : (
              <Button
                variant="secondary"
                size="sm"
                className="w-full"
                onClick={() => {
                  setShareOpen(false);
                  navigate(`/app/debriefs/${debriefId ?? session.id}`);
                }}
              >
                Open debrief
              </Button>
            )}
          </div>
        </div>
      </Modal>
    </div>
  );
}
