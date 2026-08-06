import { useParams, Link, useNavigate } from "react-router-dom";
import { useScorecard } from "@/hooks/useScorecard";
import { EmptyState } from "@/components/common/EmptyState";
import { InlineErrorRetry } from "@/components/common/InlineErrorRetry";
import { SkeletonCard } from "@/components/ui/SkeletonLoader";
import {
  Trophy, TrendingUp, TrendingDown, Share2,
  Download, BarChart2, MessageSquare,
  CheckCircle, AlertTriangle, Mic, Clock,
  ChevronDown, ChevronUp, Star,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useState } from "react";

// ─────────────────────────────────────────────────────────────────
// Scorecard
// Post-session report: overall score, per-question breakdown,
// filler words, WPM, strengths, improvements, share + export.
// ─────────────────────────────────────────────────────────────────

export default function Scorecard() {
  const { sessionId }   = useParams<{ sessionId: string }>();
  const navigate = useNavigate();
  const {
    scorecard, isLoading, isGenerating, error,
    isShared, shareUrl, shareScorecard, exportPDF, reload,
  } = useScorecard({ sessionId: sessionId! });

  const [expandedQ, setExpandedQ] = useState<string | null>(null);
  const [copyFeedback, setCopyFeedback] = useState(false);

  async function handleShare() {
    const url = await shareScorecard();
    if (url) {
      await navigator.clipboard.writeText(url);
      setCopyFeedback(true);
      setTimeout(() => setCopyFeedback(false), 2000);
    }
  }

  // ── Loading state ─────────────────────────────────────────────

  if (isLoading || isGenerating) {
    return (
      <div className="min-h-screen bg-background text-foreground">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 py-8 space-y-4">
          <SkeletonCard />
          <SkeletonCard />
          <SkeletonCard />
          {isGenerating && (
            <p className="text-sm text-muted-foreground text-center">
              Analysing your session… This may take a few seconds.
            </p>
          )}
        </div>
      </div>
    );
  }

  if (error || !scorecard) {
    return (
      <div className="min-h-screen bg-background text-foreground">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 py-8 space-y-4">
          {error && (
            <InlineErrorRetry message={error} onRetry={() => void reload()} />
          )}
          {!error && (
            <EmptyState
              icon={BarChart2}
              title="Scorecard not found"
              description="We couldn't find a scorecard for this session."
              actionLabel="Back to Dashboard"
              onAction={() => navigate("/app/dashboard")}
              compact
            />
          )}
        </div>
      </div>
    );
  }

  const scoreGrade = getScoreGrade(scorecard.overall_score);
  const looksEmpty =
    scorecard.overall_score === 0 &&
    (scorecard.question_scores?.length ?? 0) === 0 &&
    (scorecard.clarity_score ?? 0) === 0 &&
    (scorecard.structure_score ?? 0) === 0 &&
    (scorecard.relevance_score ?? 0) === 0;

  return (
    <div className="min-h-screen bg-background text-foreground">
      <div className="max-w-4xl mx-auto px-4 sm:px-6 py-8 space-y-8">

        {looksEmpty && (
          <div
            role="alert"
            className="rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-200"
          >
            This scorecard shows all zeros — usually because no answers were scored or AI scoring failed.
            Use Retry below if generation errored, or return to the session and try again.
            <button
              type="button"
              className="ml-2 underline underline-offset-2"
              onClick={() => void reload()}
            >
              Retry
            </button>
          </div>
        )}

        {/* ── Header ─────────────────────────────────── */}
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h1 className="text-3xl font-bold text-foreground">Session Scorecard</h1>
            <p className="text-muted-foreground mt-1 text-sm">
              {new Date(scorecard.generated_at).toLocaleDateString("en-GB", {
                weekday: "long", year: "numeric", month: "long", day: "numeric",
              })}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              aria-label={isShared ? "Share scorecard link again" : "Share scorecard link"}
              onClick={handleShare}
              className="flex items-center gap-1.5 px-3 py-2 bg-secondary hover:bg-secondary border border-border text-muted-foreground text-sm rounded-xl transition-all"
            >
              <Share2 className="w-3.5 h-3.5" />
              {copyFeedback ? "Copied!" : isShared ? "Share again" : "Share"}
            </button>
            <button
              type="button"
              aria-label="Export scorecard as JSON"
              onClick={() => void exportPDF()}
              className="flex items-center gap-1.5 px-3 py-2 bg-secondary hover:bg-secondary border border-border text-muted-foreground text-sm rounded-xl transition-all"
            >
              <Download className="w-3.5 h-3.5" />
              Export JSON
            </button>
          </div>
        </div>

        {/* ── Overall score ──────────────────────────── */}
        <div className={cn(
          "rounded-2xl p-6 border text-center",
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
                <div className="text-xl font-bold text-foreground">{s.value}</div>
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
            value={scorecard.wpm_avg}
            icon={Mic}
            sub={scorecard.wpm_trend}
            good={scorecard.wpm_avg >= 110 && scorecard.wpm_avg <= 160}
          />
          <MetricCard
            label="Filler Words"
            value={scorecard.filler_count}
            icon={MessageSquare}
            sub={`${scorecard.filler_rate.toFixed(1)}/min`}
            good={scorecard.filler_rate < 2}
            lowerIsBetter
          />
          <MetricCard
            label="STAR Use"
            value={`${scorecard.star_adherence}%`}
            icon={BarChart2}
            good={scorecard.star_adherence >= 70}
          />
          <MetricCard
            label="Questions"
            value={scorecard.question_scores.length}
            icon={CheckCircle}
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
            <p className="text-gray-200 text-sm leading-relaxed italic">
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
          <Link
            to="/app/mock"
            className="flex-1 text-center py-3 bg-gradient-to-r from-primary to-purple-600 hover:from-primary hover:to-purple-500 text-foreground font-semibold rounded-xl transition-all"
          >
            Practice Again
          </Link>
          <Link
            to="/app/analytics"
            className="flex-1 text-center py-3 bg-secondary hover:bg-secondary border border-border text-muted-foreground font-medium rounded-xl transition-all"
          >
            View Analytics
          </Link>
        </div>
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
  const grade = getScoreGrade(question.score);
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

function MiniScoreBar({ value }: { value: number }) {
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

function getScoreGrade(score: number) {
  if (score >= 85) return { label: "Excellent",    color: "text-emerald-400", bg: "bg-emerald-500/10", border: "border-emerald-500/20" };
  if (score >= 70) return { label: "Good",         color: "text-green-400",   bg: "bg-green-500/10",   border: "border-green-500/20" };
  if (score >= 55) return { label: "Average",      color: "text-yellow-400",  bg: "bg-yellow-500/10",  border: "border-yellow-500/20" };
  if (score >= 40) return { label: "Needs Work",   color: "text-orange-400",  bg: "bg-orange-500/10",  border: "border-orange-500/20" };
  return               { label: "Keep Practising", color: "text-red-400",     bg: "bg-red-500/10",     border: "border-red-500/20" };
}
