import { useParams, Link, useNavigate } from "react-router-dom";
import { useScorecard } from "@/hooks/useScorecard";
import { EmptyState } from "@/components/common/EmptyState";
import { HybridSourceLine } from "@/components/hybrid/HybridSourceLine";
import { InlineErrorRetry } from "@/components/common/InlineErrorRetry";
import { PageHeader } from "@/components/layout/PageHeader";
import { Button } from "@/components/ui/Button";
import { scorecardStatusLabel } from "@/lib/analytics/scoreStatus";
import {
  scorecardEligibilityMessage,
  type ScorecardEligibilityCode,
} from "@/lib/scorecard/eligibility";
import {
  Trophy, TrendingUp, TrendingDown, Share2,
  Download, BarChart2, MessageSquare,
  CheckCircle, AlertTriangle, Mic, Clock,
  ChevronDown, ChevronUp, Star,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useState } from "react";
import { toast } from "sonner";
import { useAuthStore } from "@/store/userStore";
import {
  canShareScorecard,
  parsePrivacyPrefs,
  toStoredPrivacyPrefs,
} from "@/lib/privacy/privacyPrefs";
import { FullPageProcessingState } from "@/components/async/FullPageProcessingState";
import { InsufficientCreditsAction } from "@/components/billing/InsufficientCreditsAction";
import { AI_OP_STAGES } from "@/lib/async/aiOpStages";
import { AI_CREDIT_COSTS } from "@/lib/constants/creditEconomics";
import { PAGE_SHELL } from "@/lib/ui/responsivePage";

// ─────────────────────────────────────────────────────────────────
// Scorecard
// Post-session report: overall score, per-question breakdown,
// filler words, WPM, strengths, improvements, share + export.
// ─────────────────────────────────────────────────────────────────

function emptyStateForEligibility(code: ScorecardEligibilityCode | null): {
  title: string;
  description: string;
  showGenerate: boolean;
  showRetry: boolean;
} {
  switch (code) {
    case "NOT_ELIGIBLE_NO_ANSWERS":
      return {
        title: "Session incomplete — no scorecard",
        description: scorecardEligibilityMessage(code),
        showGenerate: false,
        showRetry: false,
      };
    case "NOT_ELIGIBLE_INCOMPLETE_SESSION":
      return {
        title: "Session not completed",
        description: scorecardEligibilityMessage(code),
        showGenerate: false,
        showRetry: false,
      };
    case "FEATURE_NOT_AVAILABLE_FOR_PLAN":
      return {
        title: "Not available on this plan",
        description: scorecardEligibilityMessage(code),
        showGenerate: false,
        showRetry: false,
      };
    case "INSUFFICIENT_CREDITS":
      return {
        title: "Not enough credits",
        description: scorecardEligibilityMessage(code),
        showGenerate: false,
        showRetry: false,
      };
    case "EVALUATION_PROCESSING":
      return {
        title: scorecardStatusLabel("pending"),
        description: scorecardEligibilityMessage(code),
        showGenerate: false,
        showRetry: false,
      };
    case "EVALUATION_FAILED":
      return {
        title: scorecardStatusLabel("failed"),
        description: scorecardEligibilityMessage(code),
        showGenerate: false,
        showRetry: true,
      };
    default:
      return {
        title: scorecardStatusLabel("not_scored"),
        description:
          code
            ? scorecardEligibilityMessage(code)
            : "No server scorecard exists for this session yet. Career Pilot does not invent a numeric score in the browser.",
        showGenerate: true,
        showRetry: false,
      };
  }
}

export default function Scorecard() {
  const { sessionId }   = useParams<{ sessionId: string }>();
  const navigate = useNavigate();
  const {
    scorecard, status, eligibilityCode, isLoading, isGenerating, error,
    isShared, shareScorecard, shareBlockedReason, exportPDF,
    generateScorecard, creditRequired, creditBalance,
  } = useScorecard({ sessionId: sessionId! });
  const shareAllowed = canShareScorecard(
    useAuthStore((s) => s.profile?.privacy_prefs),
  );
  const updateProfile = useAuthStore((s) => s.updateProfile);

  const [expandedQ, setExpandedQ] = useState<string | null>(null);
  const [copyFeedback, setCopyFeedback] = useState(false);
  const [shareEnabling, setShareEnabling] = useState(false);

  async function enableScorecardSharing(): Promise<boolean> {
    const profile = useAuthStore.getState().profile;
    if (!profile?.id) return false;
    setShareEnabling(true);
    try {
      const stored = toStoredPrivacyPrefs({
        ...parsePrivacyPrefs(profile.privacy_prefs),
        share_scorecard: true,
      });
      await updateProfile({ privacy_prefs: stored });
      toast.success("Scorecard sharing enabled");
      return true;
    } catch {
      toast.error("Could not update privacy settings. Open Settings → Privacy.");
      return false;
    } finally {
      setShareEnabling(false);
    }
  }

  async function handleShare() {
    if (!shareAllowed) {
      const enabled = await enableScorecardSharing();
      if (!enabled) {
        navigate("/app/settings/privacy");
        return;
      }
    }
    const url = await shareScorecard();
    if (url) {
      await navigator.clipboard.writeText(url);
      setCopyFeedback(true);
      setTimeout(() => setCopyFeedback(false), 2000);
      toast.success("Share link copied to clipboard");
      return;
    }
    const blocked = shareBlockedReason ?? "";
    if (/privacy|sharing is turned off/i.test(blocked)) {
      toast.error(blocked, {
        duration: 8000,
        action: {
          label: "Enable sharing",
          onClick: () => void enableScorecardSharing().then((ok) => ok && handleShare()),
        },
      });
      return;
    }
    toast.error(blocked || "Could not create a share link. Please try again.");
  }

  // ── Loading / pending ─────────────────────────────────────────

  if (isLoading || isGenerating || status === "loading" || status === "pending") {
    const scoreMsg =
      status === "pending" || isGenerating
        ? AI_OP_STAGES.scorecard.evaluating
        : AI_OP_STAGES.scorecard.processing;
    return (
      <div data-testid="scorecard-page" className={cn(PAGE_SHELL, "space-y-4")}>
        <PageHeader
          title="Session Scorecard"
          breadcrumbs={[
            { label: "Dashboard", href: "/app/dashboard" },
            { label: "Sessions", href: "/app/sessions" },
            { label: "Scorecard" },
          ]}
        />
        <FullPageProcessingState
          title="Building your scorecard"
          message={scoreMsg}
          stage={status === "pending" || isGenerating ? "evaluating" : "processing"}
        >
          <ol className="text-left text-xs text-muted-foreground space-y-1.5 max-w-sm mx-auto">
            <li>1. {AI_OP_STAGES.scorecard.processing}</li>
            <li>2. {AI_OP_STAGES.scorecard.evaluating}</li>
            <li>3. {AI_OP_STAGES.scorecard.building}</li>
          </ol>
          <p className="text-[11px] text-muted-foreground">
            {scorecardEligibilityMessage("EVALUATION_PROCESSING")}
          </p>
        </FullPageProcessingState>
      </div>
    );
  }

  if (status === "failed" || (error && status !== "not_scored" && status !== "scored")) {
    if (eligibilityCode === "INSUFFICIENT_CREDITS") {
      return (
        <div data-testid="scorecard-page" className={cn(PAGE_SHELL, "space-y-4")}>
          <PageHeader
            title="Session Scorecard"
            breadcrumbs={[
              { label: "Dashboard", href: "/app/dashboard" },
              { label: "Sessions", href: "/app/sessions" },
              { label: "Scorecard" },
            ]}
          />
          <InsufficientCreditsAction
            operationKey="generate_scorecard"
            required={creditRequired ?? AI_CREDIT_COSTS.generate_scorecard}
            balance={creditBalance}
            mode="credits"
            returnTo={sessionId ? `/app/scorecard/${sessionId}` : "/app/sessions"}
          />
        </div>
      );
    }
    return (
      <div data-testid="scorecard-page" className={cn(PAGE_SHELL, "space-y-4")}>
        <PageHeader
          title="Session Scorecard"
          breadcrumbs={[
            { label: "Dashboard", href: "/app/dashboard" },
            { label: "Sessions", href: "/app/sessions" },
            { label: "Scorecard" },
          ]}
        />
        {eligibilityCode === "FEATURE_NOT_AVAILABLE_FOR_PLAN" ? (
          <InsufficientCreditsAction
            operationKey="generate_scorecard"
            required={AI_CREDIT_COSTS.generate_scorecard}
            balance={creditBalance}
            mode="plan"
            returnTo={sessionId ? `/app/scorecard/${sessionId}` : "/app/sessions"}
          />
        ) : (
          <InlineErrorRetry
            message={
              error ??
              scorecardEligibilityMessage(eligibilityCode ?? "EVALUATION_FAILED")
            }
            onRetry={() => void generateScorecard()}
          />
        )}
      </div>
    );
  }

  if (status === "not_scored" || !scorecard) {
    const empty = emptyStateForEligibility(eligibilityCode);
    if (eligibilityCode === "INSUFFICIENT_CREDITS") {
      return (
        <div data-testid="scorecard-page" className={cn(PAGE_SHELL, "space-y-4")}>
          <PageHeader
            title="Session Scorecard"
            breadcrumbs={[
              { label: "Dashboard", href: "/app/dashboard" },
              { label: "Sessions", href: "/app/sessions" },
              { label: "Scorecard" },
            ]}
          />
          <InsufficientCreditsAction
            operationKey="generate_scorecard"
            required={creditRequired ?? AI_CREDIT_COSTS.generate_scorecard}
            balance={creditBalance}
            mode="credits"
            returnTo={sessionId ? `/app/scorecard/${sessionId}` : "/app/sessions"}
          />
        </div>
      );
    }
    const counts =
      scorecard &&
      (scorecard.question_count != null || scorecard.answer_count != null)
        ? ` Questions: ${scorecard.question_count ?? "—"} · Answers: ${scorecard.answer_count ?? "—"} · Evaluated: ${scorecard.evaluated_answer_count ?? "—"}.`
        : "";

    return (
      <div data-testid="scorecard-page" className={cn(PAGE_SHELL, "space-y-4")}>
        <PageHeader
          title="Session Scorecard"
          breadcrumbs={[
            { label: "Dashboard", href: "/app/dashboard" },
            { label: "Sessions", href: "/app/sessions" },
            { label: "Scorecard" },
          ]}
        />
        <EmptyState
          icon={
            eligibilityCode === "NOT_ELIGIBLE_NO_ANSWERS" ||
            eligibilityCode === "NOT_ELIGIBLE_INCOMPLETE_SESSION"
              ? AlertTriangle
              : BarChart2
          }
          title={empty.title}
          description={`${error ?? empty.description}${counts}`}
          actionLabel={
            empty.showRetry
              ? "Retry evaluation"
              : empty.showGenerate
                ? "Generate scorecard"
                : "Back to mock interviews"
          }
          onAction={
            empty.showRetry || empty.showGenerate
              ? () => void generateScorecard()
              : () => navigate("/app/mock")
          }
          secondaryActionLabel={
            empty.showGenerate || empty.showRetry
              ? "Back to mock interviews"
              : undefined
          }
          onSecondaryAction={
            empty.showGenerate || empty.showRetry
              ? () => navigate("/app/mock")
              : undefined
          }
          compact
        />
      </div>
    );
  }

  // Defense in depth: never render the scored layout without a finite overall score.
  const hasFiniteOverall =
    typeof scorecard.overall_score === "number" &&
    Number.isFinite(scorecard.overall_score);
  if (status !== "scored" || !hasFiniteOverall) {
    return (
      <div data-testid="scorecard-page" className={cn(PAGE_SHELL, "space-y-4")}>
        <PageHeader
          title="Session Scorecard"
          breadcrumbs={[
            { label: "Dashboard", href: "/app/dashboard" },
            { label: "Sessions", href: "/app/sessions" },
            { label: "Scorecard" },
          ]}
        />
        <InlineErrorRetry
          message={
            error ??
            "Scorecard is incomplete. Retry evaluation — overall score is required before showing results."
          }
          onRetry={() => void generateScorecard()}
        />
      </div>
    );
  }

  const dominantQuality = scorecard.question_scores?.find((q) =>
    q.quality_class &&
    q.quality_class !== "VALID",
  )?.quality_class;
  const allPoor =
    (scorecard.question_scores?.length ?? 0) > 0 &&
    scorecard.question_scores.every((q) =>
      q.quality_class &&
      q.quality_class !== "VALID" &&
      q.quality_class !== "LOW_QUALITY",
    );
  const scoreGrade = getScoreGrade(
    scorecard.overall_score,
    allPoor ? dominantQuality ?? "IRRELEVANT" : undefined,
  );
  const missingDimensions =
    scorecard.clarity_score == null ||
    scorecard.structure_score == null ||
    scorecard.relevance_score == null ||
    scorecard.confidence_score == null;
  const looksEmpty =
    (scorecard.question_scores?.length ?? 0) === 0 && missingDimensions;

  return (
    <div data-testid="scorecard-page" className={cn(PAGE_SHELL, "space-y-6 min-w-0")}>
        {looksEmpty && (
          <div
            role="alert"
            className="rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-950 dark:text-amber-100"
          >
            <p className="leading-relaxed whitespace-normal">
              Overall score is available, but question ratings or dimension breakdowns are
              incomplete. Retry evaluation to fill missing sections — scores are never invented
              in the browser.
            </p>
            <div className="mt-3 flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => void generateScorecard()}
                className="inline-flex items-center rounded-lg bg-secondary px-3 py-1.5 text-xs font-medium hover:bg-secondary/80"
              >
                Retry evaluation
              </button>
              <Link
                to="/app/mock"
                className="inline-flex items-center rounded-lg bg-secondary px-3 py-1.5 text-xs font-medium hover:bg-secondary/80"
              >
                Start a new mock
              </Link>
            </div>
          </div>
        )}

      <PageHeader
        title="Session Scorecard"
        description={new Date(scorecard.generated_at).toLocaleDateString("en-GB", {
          weekday: "long", year: "numeric", month: "long", day: "numeric",
        })}
        breadcrumbs={[
          { label: "Dashboard", href: "/app/dashboard" },
          { label: "Sessions", href: "/app/sessions" },
          { label: "Scorecard" },
        ]}
        actions={
          <div className="flex items-center gap-2 flex-wrap">
            <Button
              type="button"
              variant="secondary"
              size="sm"
              loading={shareEnabling}
              aria-label={
                shareAllowed
                  ? isShared
                    ? "Share scorecard link again"
                    : "Share scorecard link"
                  : "Enable scorecard sharing and copy link"
              }
              onClick={() => void handleShare()}
              leftIcon={<Share2 className="w-3.5 h-3.5" />}
            >
              {copyFeedback
                ? "Copied!"
                : shareAllowed
                  ? isShared
                    ? "Share again"
                    : "Share"
                  : "Enable & share"}
            </Button>
            <Button
              type="button"
              variant="secondary"
              size="sm"
              aria-label="Export scorecard as PDF"
              onClick={() => void exportPDF()}
              leftIcon={<Download className="w-3.5 h-3.5" />}
            >
              Export PDF
            </Button>
          </div>
        }
      />
      <HybridSourceLine source={scorecard.scoring_source} />

        {/* ── Overall score ──────────────────────────── */}
        <div className={cn(
          "rounded-2xl p-6 border text-center min-w-0",
          scoreGrade.bg, scoreGrade.border
        )}>
          <div className={cn("text-7xl font-black mb-2", scoreGrade.color)}>
            {scorecard.overall_score}
          </div>
          <div className="text-lg font-semibold text-foreground">{scoreGrade.label}</div>
          <p className="text-muted-foreground text-sm mt-1">Overall performance score</p>

          {/* 4 sub-scores */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-6">
            {[
              { label: "Confidence", value: scorecard.confidence_score },
              { label: "Clarity",    value: scorecard.clarity_score },
              { label: "Structure",  value: scorecard.structure_score },
              { label: "Relevance",  value: scorecard.relevance_score },
            ].map((s) => (
              <div key={s.label} className="bg-background/40 rounded-xl p-3">
                <div className="text-xl font-bold text-foreground">
                  {s.value == null ? "—" : s.value}
                </div>
                <div className="text-xs text-muted-foreground">{s.label}</div>
                <MiniScoreBar value={s.value} />
              </div>
            ))}
          </div>
        </div>

        {/* ── Metrics row ────────────────────────────── */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          <MetricCard
            label="Avg WPM"
            value={scorecard.wpm_avg == null ? "Not available" : scorecard.wpm_avg}
            icon={Mic}
            sub={scorecard.wpm_trend ?? undefined}
            good={
              scorecard.wpm_avg == null
                ? undefined
                : scorecard.wpm_avg >= 110 && scorecard.wpm_avg <= 160
            }
          />
          <MetricCard
            label="Filler Words"
            value={scorecard.filler_count == null ? "Not available" : scorecard.filler_count}
            icon={MessageSquare}
            sub={
              scorecard.filler_rate == null
                ? "Not available"
                : `${scorecard.filler_rate.toFixed(1)}/min`
            }
            good={
              scorecard.filler_rate == null ? undefined : scorecard.filler_rate < 2
            }
            lowerIsBetter
          />
          <MetricCard
            label="STAR Use"
            value={
              scorecard.star_adherence == null
                ? "Not available"
                : `${scorecard.star_adherence}%`
            }
            icon={BarChart2}
            good={
              scorecard.star_adherence == null
                ? undefined
                : scorecard.star_adherence >= 70
            }
          />
          <MetricCard
            label="Answers evaluated"
            value={
              scorecard.evaluated_answer_count != null
                ? scorecard.evaluated_answer_count
                : scorecard.question_scores.length > 0
                  ? scorecard.question_scores.length
                  : "Not available"
            }
            icon={CheckCircle}
            sub={
              scorecard.answer_count != null || scorecard.question_count != null
                ? `${scorecard.evaluated_answer_count ?? scorecard.question_scores.length ?? 0} evaluated · ${scorecard.answer_count ?? "—"} answers · ${scorecard.question_count ?? "—"} questions`
                : scorecard.question_scores.length > 0
                  ? `${scorecard.question_scores.length} scored`
                  : "No question-level scores"
            }
          />
        </div>

        {/* ── Top fillers ────────────────────────────── */}
        {scorecard.top_filler_words.length > 0 && (
          <div className="bg-secondary border border-border rounded-2xl p-5">
            <h2 className="text-base font-semibold text-foreground mb-3 flex items-center gap-2">
              <MessageSquare className="w-4 h-4 text-orange-400" />
              Top Filler Words
            </h2>
            <div className="flex flex-wrap gap-2">
              {scorecard.top_filler_words.map((f) => (
                <div
                  key={f.word}
                  className="flex items-center gap-1.5 px-3 py-1.5 bg-orange-500/10 border border-orange-500/20 rounded-full"
                >
                  <span className="text-orange-300 text-sm font-medium">"{f.word}"</span>
                  <span className="text-xs text-orange-400 font-bold">{f.count}×</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ── Strengths + improvements ────────────────── */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <FeedbackPanel
            title="Strengths"
            items={scorecard.strengths}
            icon={CheckCircle}
            color="green"
          />
          <FeedbackPanel
            title="Areas to Improve"
            items={scorecard.improvements}
            icon={AlertTriangle}
            color="amber"
          />
        </div>

        {/* ── Coach note ─────────────────────────────── */}
        {scorecard.coach_note && (
          <div className="bg-primary/10 border border-primary/20 rounded-2xl p-5">
            <p className="text-xs text-primary font-medium uppercase tracking-wider mb-2">
              Coach's Note
            </p>
            <p className="text-foreground text-sm leading-relaxed italic">
              "{scorecard.coach_note}"
            </p>
          </div>
        )}

        {/* ── Per-question breakdown ──────────────────── */}
        <div>
          <h2 className="text-lg font-semibold text-foreground mb-4 flex items-center gap-2">
            <BarChart2 className="w-5 h-5 text-primary" />
            Question Breakdown
          </h2>
          <div className="space-y-3">
            {scorecard.question_scores.map((q) => (
              <QuestionScoreCard
                key={q.question_id}
                question={q}
                isExpanded={expandedQ === q.question_id}
                onToggle={() =>
                  setExpandedQ(expandedQ === q.question_id ? null : q.question_id)
                }
              />
            ))}
          </div>
        </div>

        {/* ── CTA ────────────────────────────────────── */}
        <div className="flex flex-col sm:flex-row gap-3 pt-4">
          {sessionId && (
            <Link
              to={`/app/sessions/${sessionId}`}
              className="flex-1 text-center py-3 bg-secondary hover:bg-secondary/80 border border-border text-muted-foreground font-medium rounded-xl transition-all"
            >
              View session
            </Link>
          )}
          <Link
            to="/app/mock"
            className="flex-1 text-center py-3 bg-primary hover:bg-primary/90 text-primary-foreground font-semibold rounded-xl transition-all"
          >
            Practice Again
          </Link>
          <Link
            to="/app/analytics"
            className="flex-1 text-center py-3 bg-secondary hover:bg-secondary/80 border border-border text-muted-foreground font-medium rounded-xl transition-all"
          >
            View Analytics
          </Link>
        </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────
// Sub-components
// ─────────────────────────────────────────────────────────────────

function QuestionScoreCard({
  question, isExpanded, onToggle,
}: {
  question: any; isExpanded: boolean; onToggle: () => void;
}) {
  const grade = getScoreGrade(question.score, question.quality_class);
  return (
    <div className="bg-secondary border border-border rounded-xl overflow-hidden">
      <button
        onClick={onToggle}
        className="w-full flex items-center gap-4 p-4 text-left hover:bg-secondary transition-colors"
      >
        <div className={cn(
          "w-10 h-10 rounded-xl flex items-center justify-center text-sm font-bold shrink-0",
          grade.bg, grade.color
        )}>
          {question.score}
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm text-foreground truncate">{question.question_text}</p>
          <p className="text-xs text-muted-foreground mt-0.5">
            {question.star_used ? "✓ STAR framework used" : "× STAR not detected"}
          </p>
        </div>
        {isExpanded ? (
          <ChevronUp className="w-4 h-4 text-muted-foreground shrink-0" />
        ) : (
          <ChevronDown className="w-4 h-4 text-muted-foreground shrink-0" />
        )}
      </button>

      {isExpanded && (
        <div className="px-4 pb-4 space-y-3 border-t border-border pt-3">
          <div className="grid grid-cols-2 gap-3 text-sm">
            <div>
              <p className="text-xs text-green-400 font-medium mb-1">Strength</p>
              <p className="text-muted-foreground">{question.key_strength}</p>
            </div>
            <div>
              <p className="text-xs text-orange-400 font-medium mb-1">Weakness</p>
              <p className="text-muted-foreground">{question.key_weakness}</p>
            </div>
          </div>
          {question.coach_tip && (
            <div className="bg-primary/10 rounded-lg p-3 text-xs text-primary/80">
              💡 {question.coach_tip}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function FeedbackPanel({
  title, items, icon: Icon, color,
}: {
  title: string; items: string[]; icon: any; color: "green" | "amber";
}) {
  const colorMap = {
    green: { bg: "bg-green-500/10", border: "border-green-500/20", text: "text-green-400", dot: "bg-green-400" },
    amber: { bg: "bg-amber-500/10", border: "border-amber-500/20", text: "text-amber-400", dot: "bg-amber-400" },
  };
  const c = colorMap[color];
  return (
    <div className={cn("rounded-2xl p-5 border", c.bg, c.border)}>
      <h3 className={cn("font-semibold text-sm mb-3 flex items-center gap-2", c.text)}>
        <Icon className="w-4 h-4" />
        {title}
      </h3>
      <ul className="space-y-2">
        {items.map((item, i) => (
          <li key={i} className="flex items-start gap-2 text-sm text-muted-foreground">
            <div className={cn("w-1.5 h-1.5 rounded-full mt-1.5 shrink-0", c.dot)} />
            {item}
          </li>
        ))}
      </ul>
    </div>
  );
}

function MetricCard({
  label, value, icon: Icon, sub, good, lowerIsBetter,
}: {
  label: string; value: string | number; icon: any;
  sub?: string; good?: boolean; lowerIsBetter?: boolean;
}) {
  return (
    <div className="bg-secondary border border-border rounded-xl p-4">
      <div className="flex items-center gap-2 text-muted-foreground mb-1">
        <Icon className="w-4 h-4" />
        <span className="text-xs">{label}</span>
      </div>
      <div className={cn(
        "text-2xl font-bold",
        good === undefined ? "text-foreground" :
        good ? "text-green-400" : "text-orange-400"
      )}>
        {value}
      </div>
      {sub && <p className="text-xs text-muted-foreground mt-0.5">{sub}</p>}
    </div>
  );
}

function MiniScoreBar({ value }: { value: number | null }) {
  if (value == null) {
    return (
      <div className="mt-2 h-1 bg-secondary rounded-full overflow-hidden">
        <div className="h-full w-0 rounded-full bg-muted-foreground/30" />
      </div>
    );
  }
  return (
    <div className="mt-2 h-1 bg-secondary rounded-full overflow-hidden">
      <div
        className={cn(
          "h-full rounded-full",
          value >= 70 ? "bg-green-400" :
          value >= 50 ? "bg-yellow-400" : "bg-red-400"
        )}
        style={{ width: `${value}%` }}
      />
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────

function getScoreGrade(score: number | null, qualityClass?: string) {
  if (score == null) {
    return {
      label: "Not eligible",
      color: "text-muted-foreground",
      bg: "bg-secondary",
      border: "border-border",
    };
  }
  const poor =
    qualityClass === "IRRELEVANT" ||
    qualityClass === "NON_RESPONSIVE" ||
    qualityClass === "GIBBERISH" ||
    qualityClass === "REPEATED" ||
    qualityClass === "EMPTY";
  if (poor || (score <= 5 && qualityClass && qualityClass !== "VALID")) {
    return {
      label: "Irrelevant or non-responsive answer",
      color: "text-red-400",
      bg: "bg-red-500/10",
      border: "border-red-500/20",
    };
  }
  if (score >= 85) return { label: "Excellent",    color: "text-emerald-400", bg: "bg-emerald-500/10", border: "border-emerald-500/20" };
  if (score >= 70) return { label: "Good",         color: "text-green-400",   bg: "bg-green-500/10",   border: "border-green-500/20" };
  if (score >= 55) return { label: "Average",      color: "text-yellow-400",  bg: "bg-yellow-500/10",  border: "border-yellow-500/20" };
  if (score >= 40) return { label: "Needs Work",   color: "text-orange-400",  bg: "bg-orange-500/10",  border: "border-orange-500/20" };
  return               { label: "Keep Practising", color: "text-red-400",     bg: "bg-red-500/10",     border: "border-red-500/20" };
}
