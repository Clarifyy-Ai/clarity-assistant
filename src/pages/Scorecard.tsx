import { useParams, Link } from "react-router-dom";
import { useScorecard } from "@/hooks/useScorecard";
import {
  Trophy, TrendingUp, TrendingDown, Share2,
  Download, RefreshCw, BarChart2, MessageSquare,
  CheckCircle, AlertTriangle, Mic, Clock,
  ChevronDown, ChevronUp, Loader2, Star,
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
  const {
    scorecard, isLoading, isGenerating, error,
    isShared, shareUrl, shareScorecard, exportPDF,
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
      <div className="min-h-screen bg-[#0a0a0f] text-white flex flex-col items-center justify-center gap-4">
        <Loader2 className="w-10 h-10 text-violet-400 animate-spin" />
        <p className="text-gray-400">
          {isGenerating ? "Analysing your session…" : "Loading scorecard…"}
        </p>
        <p className="text-xs text-gray-500">This may take a few seconds</p>
      </div>
    );
  }

  if (error || !scorecard) {
    return (
      <div className="min-h-screen bg-[#0a0a0f] text-white flex flex-col items-center justify-center gap-4">
        <AlertTriangle className="w-10 h-10 text-red-400" />
        <p className="text-gray-300">Unable to load scorecard</p>
        <Link to="/dashboard" className="text-sm text-violet-400 hover:underline">
          Back to Dashboard
        </Link>
      </div>
    );
  }

  const scoreGrade = getScoreGrade(scorecard.overall_score);

  return (
    <div className="min-h-screen bg-[#0a0a0f] text-white">
      <div className="max-w-4xl mx-auto px-4 sm:px-6 py-8 space-y-8">

        {/* ── Header ─────────────────────────────────── */}
        <div className="flex items-start justify-between">
          <div>
            <h1 className="text-3xl font-bold text-white">Session Scorecard</h1>
            <p className="text-gray-400 mt-1 text-sm">
              {new Date(scorecard.generated_at).toLocaleDateString("en-GB", {
                weekday: "long", year: "numeric", month: "long", day: "numeric",
              })}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={handleShare}
              className="flex items-center gap-1.5 px-3 py-2 bg-white/5 hover:bg-white/10 border border-white/10 text-gray-300 text-sm rounded-xl transition-all"
            >
              <Share2 className="w-3.5 h-3.5" />
              {copyFeedback ? "Copied!" : isShared ? "Share again" : "Share"}
            </button>
            <button
              onClick={exportPDF}
              className="flex items-center gap-1.5 px-3 py-2 bg-white/5 hover:bg-white/10 border border-white/10 text-gray-300 text-sm rounded-xl transition-all"
            >
              <Download className="w-3.5 h-3.5" />
              Export PDF
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
          <div className="text-lg font-semibold text-white">{scoreGrade.label}</div>
          <p className="text-gray-400 text-sm mt-1">Overall performance score</p>

          {/* 4 sub-scores */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-6">
            {[
              { label: "Confidence", value: scorecard.confidence_score },
              { label: "Clarity",    value: scorecard.clarity_score },
              { label: "Structure",  value: scorecard.structure_score },
              { label: "Relevance",  value: scorecard.relevance_score },
            ].map((s) => (
              <div key={s.label} className="bg-black/20 rounded-xl p-3">
                <div className="text-xl font-bold text-white">{s.value}</div>
                <div className="text-xs text-gray-400">{s.label}</div>
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
          <div className="bg-white/5 border border-white/10 rounded-2xl p-5">
            <h2 className="text-base font-semibold text-white mb-3 flex items-center gap-2">
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
          <div className="bg-violet-600/10 border border-violet-500/20 rounded-2xl p-5">
            <p className="text-xs text-violet-400 font-medium uppercase tracking-wider mb-2">
              Coach's Note
            </p>
            <p className="text-gray-200 text-sm leading-relaxed italic">
              "{scorecard.coach_note}"
            </p>
          </div>
        )}

        {/* ── Per-question breakdown ──────────────────── */}
        <div>
          <h2 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
            <BarChart2 className="w-5 h-5 text-violet-400" />
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
            to="/mock/setup"
            className="flex-1 text-center py-3 bg-gradient-to-r from-violet-600 to-purple-600 hover:from-violet-500 hover:to-purple-500 text-white font-semibold rounded-xl transition-all"
          >
            Practice Again
          </Link>
          <Link
            to="/analytics"
            className="flex-1 text-center py-3 bg-white/5 hover:bg-white/10 border border-white/10 text-gray-300 font-medium rounded-xl transition-all"
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
    <div className="bg-white/5 border border-white/10 rounded-xl overflow-hidden">
      <button
        onClick={onToggle}
        className="w-full flex items-center gap-4 p-4 text-left hover:bg-white/5 transition-colors"
      >
        <div className={cn(
          "w-10 h-10 rounded-xl flex items-center justify-center text-sm font-bold shrink-0",
          grade.bg, grade.color
        )}>
          {question.score}
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm text-white truncate">{question.question_text}</p>
          <p className="text-xs text-gray-400 mt-0.5">
            {question.star_used ? "✓ STAR framework used" : "× STAR not detected"}
          </p>
        </div>
        {isExpanded ? (
          <ChevronUp className="w-4 h-4 text-gray-400 shrink-0" />
        ) : (
          <ChevronDown className="w-4 h-4 text-gray-400 shrink-0" />
        )}
      </button>

      {isExpanded && (
        <div className="px-4 pb-4 space-y-3 border-t border-white/10 pt-3">
          <div className="grid grid-cols-2 gap-3 text-sm">
            <div>
              <p className="text-xs text-green-400 font-medium mb-1">Strength</p>
              <p className="text-gray-300">{question.key_strength}</p>
            </div>
            <div>
              <p className="text-xs text-orange-400 font-medium mb-1">Weakness</p>
              <p className="text-gray-300">{question.key_weakness}</p>
            </div>
          </div>
          {question.coach_tip && (
            <div className="bg-violet-600/10 rounded-lg p-3 text-xs text-violet-200">
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
          <li key={i} className="flex items-start gap-2 text-sm text-gray-300">
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
    <div className="bg-white/5 border border-white/10 rounded-xl p-4">
      <div className="flex items-center gap-2 text-gray-400 mb-1">
        <Icon className="w-4 h-4" />
        <span className="text-xs">{label}</span>
      </div>
      <div className={cn(
        "text-2xl font-bold",
        good === undefined ? "text-white" :
        good ? "text-green-400" : "text-orange-400"
      )}>
        {value}
      </div>
      {sub && <p className="text-xs text-gray-500 mt-0.5">{sub}</p>}
    </div>
  );
}

function MiniScoreBar({ value }: { value: number }) {
  return (
    <div className="mt-2 h-1 bg-white/10 rounded-full overflow-hidden">
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
