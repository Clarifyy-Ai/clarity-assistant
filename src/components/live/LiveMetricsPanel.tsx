import { useEffect, useRef, useState } from "react";
import { useAudioStore } from "@/store/audioStore";
import { useSessionStore } from "@/store/sessionStore";
import { TrendingUp, TrendingDown, Minus, Star } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  computeTranscriptConfidence,
  TRANSCRIPT_MIN_WORDS,
} from "@/lib/audio/transcriptConfidence";

// ─────────────────────────────────────────────────────────────────
// LiveMetricsPanel
// Comprehensive performance metrics dashboard showing:
// - Overall session score (0-100)
// - Answer quality metrics
// - Communication scores
// - Technical performance
// - Historical trending (real delta from previous calculation)
// ─────────────────────────────────────────────────────────────────

interface SessionMetrics {
  overallScore: number;
  tier: "poor" | "fair" | "good" | "excellent";
  answerQuality: {
    completeness: number;
    accuracy:     number;
    relevance:    number;
    structure:    number;
  };
  communication: {
    clarity:     number;
    pace:        number;
    confidence:  number;
    engagement:  number;
    fillerWords: number;
  };
  technical: {
    networkQuality:  "excellent" | "good" | "fair" | "poor";
    audioQuality:    "excellent" | "good" | "fair" | "poor";
    microphoneLevel: "too-quiet" | "good" | "too-loud";
    echoDetected:    boolean;
  };
  trending: {
    scoreChange: number;
    direction:   "up" | "down" | "stable";
  };
}

interface LiveMetricsPanelProps {
  className?:  string;
  showTrend?:  boolean;
  detailed?:   boolean;
}

const SCORE_WEIGHTS = {
  answerQuality: 0.40,
  communication: 0.35,
  technical:     0.25,
} as const;

// ─── Sub-components defined OUTSIDE the parent ────────────────────
// FIX: if defined inside the parent they get a new identity every render,
//      causing React to unmount/remount them on every parent state update.

function ScoreBar({ score }: { score: number }) {
  const color =
    score >= 80 ? "bg-emerald-500" :
    score >= 60 ? "bg-blue-500"    :
    score >= 40 ? "bg-amber-500"   :
                  "bg-red-500";

  return (
    <div className="flex items-center gap-2">
      <div className="flex-1 h-1.5 rounded-full bg-white/5 overflow-hidden">
        <div
          className={cn("h-full transition-all duration-500 ease-out", color)}
          style={{ width: `${score}%` }}
        />
      </div>
      <span className="text-[11px] font-semibold tabular-nums w-8 text-right"
        style={{ color: "rgba(255,255,255,0.45)" }}>
        {score}%
      </span>
    </div>
  );
}

function TrendIcon({ direction }: { direction: "up" | "down" | "stable" }) {
  if (direction === "up")     return <TrendingUp   className="h-3.5 w-3.5 text-emerald-400" />;
  if (direction === "down")   return <TrendingDown  className="h-3.5 w-3.5 text-red-400"    />;
  return                             <Minus         className="h-3.5 w-3.5 text-white/20"    />;
}

function QualityBadge({ value }: { value: "excellent" | "good" | "fair" | "poor" }) {
  const color =
    value === "excellent" ? "text-emerald-400" :
    value === "good"      ? "text-blue-400"     :
    value === "fair"      ? "text-amber-400"    :
                            "text-red-400";
  return (
    <span className={cn("text-xs font-semibold capitalize", color)}>{value}</span>
  );
}

function MetricRow({ label, score }: { label: string; score: number }) {
  return (
    <div className="space-y-1.5">
      <div className="flex justify-between items-center">
        <span className="text-[11px]" style={{ color: "rgba(255,255,255,0.4)" }}>{label}</span>
        <span className="text-[11px] font-semibold tabular-nums"
          style={{ color: "rgba(255,255,255,0.6)" }}>{score}%</span>
      </div>
      <ScoreBar score={score} />
    </div>
  );
}

// ─── Tier helpers ─────────────────────────────────────────────────

function getTierColor(tier: string) {
  switch (tier) {
    case "excellent": return "text-emerald-400";
    case "good":      return "text-blue-400";
    case "fair":      return "text-amber-400";
    case "poor":      return "text-red-400";
    default:          return "text-white/30";
  }
}

function getTierBg(tier: string) {
  switch (tier) {
    case "excellent": return "bg-emerald-500/10 border-emerald-500/20";
    case "good":      return "bg-blue-500/10 border-blue-500/20";
    case "fair":      return "bg-amber-500/10 border-amber-500/20";
    case "poor":      return "bg-red-500/10 border-red-500/20";
    default:          return "bg-white/5 border-white/10";
  }
}

// ─── Main component ───────────────────────────────────────────────

const DEFAULT_METRICS: SessionMetrics = {
  overallScore:  72,
  tier:          "good",
  answerQuality: { completeness: 80, accuracy: 82, relevance: 78, structure: 68 },
  communication: { clarity: 80, pace: 85, confidence: 72, engagement: 76, fillerWords: 83 },
  technical:     { networkQuality: "good", audioQuality: "good", microphoneLevel: "good", echoDetected: false },
  trending:      { scoreChange: 0, direction: "stable" },
};

const MIN_WORDS_FOR_SCORE = TRANSCRIPT_MIN_WORDS;

export function LiveMetricsPanel({
  className,
  showTrend = true,
  detailed  = true,
}: LiveMetricsPanelProps) {
  // FIX: elapsedTime does not exist on audioStore — use elapsed_seconds from sessionStore
  const transcript    = useAudioStore((s) => s.transcript);
  const elapsedSeconds = useSessionStore((s) => s.elapsed_seconds ?? 0);

  const [metrics, setMetrics] = useState<SessionMetrics>(DEFAULT_METRICS);
  const [isEstimated, setIsEstimated] = useState(true);

  // FIX: track previous score in a ref so we can compute a real trend delta
  const prevScoreRef = useRef<number>(DEFAULT_METRICS.overallScore);

  useEffect(() => {
    const text = (transcript?.utterances ?? [])
      .map((u) => u.text)
      .join(" ")
      .toLowerCase();
    const words = text.split(/\s+/).filter((w) => w.length > 0);
    const total = words.length;
    const signals = computeTranscriptConfidence(text);
    const hasEnoughSpeech = total >= MIN_WORDS_FOR_SCORE;
    setIsEstimated(!hasEnoughSpeech);

    // ── Answer Quality ─────────────────────────────────────────
    const completeness = signals.completeness;

    const accuracyKw = ["example", "specifically", "demonstrated", "achieved", "learned", "measured", "improved"];
    const accuracy = Math.min(100, 50 + accuracyKw.filter((k) => text.includes(k)).length * 8);

    const relevanceKw = ["role", "responsibility", "problem", "solution", "delivered", "impact"];
    const relevance = Math.min(100, 50 + relevanceKw.filter((k) => text.includes(k)).length * 8);

    const structureKw = ["first", "second", "third", "finally", "overall", "summary", "situation", "task", "action", "result"];
    const structure = Math.min(100, 50 + structureKw.filter((k) => text.includes(k)).length * 5);

    // ── Communication ──────────────────────────────────────────
    // Guard: only compute WPM if there are enough words and time has passed
    const safeElapsed = Math.max(elapsedSeconds, 5);
    const wpm         = total > 5 ? Math.round((total / safeElapsed) * 60) : 0;
    const pace        = wpm === 0 ? 75 :
                        wpm >= 100 && wpm <= 130 ? 95 :
                        Math.max(40, 100 - Math.abs(wpm - 115) * 1.2);

    const fillerKw = ["um", "uh", "like", "basically", "actually", "literally", "honestly"];
    let fillerCount = 0;
    fillerKw.forEach((f) => {
      const m = text.match(new RegExp(`\\b${f}\\b`, "gi"));
      if (m) fillerCount += m.length;
    });
    const fillerPct = total > 0 ? (fillerCount / total) * 100 : 0;
    const clarity   = Math.max(40, Math.round(100 - fillerPct * 3));
    const fillerScore = Math.max(40, Math.round(100 - fillerPct * 2));

    // Confidence heuristic: penalise hedging language
    const hedgeKw = ["maybe", "perhaps", "possibly", "might", "sort of", "kind of"];
    const hedgeCount = hedgeKw.filter((h) => text.includes(h)).length;
    const confidence = Math.max(30, Math.min(95, 75 - hedgeCount * 5));

    // Engagement: question-response ratio + keyword density
    const engagementKw = ["i", "we", "our", "my", "contributed", "led", "built", "designed"];
    const engagement = Math.min(90, 55 + engagementKw.filter((k) => text.includes(k)).length * 3);

    // ── Score calculation ──────────────────────────────────────
    const aqAvg   = (completeness + accuracy + relevance + structure) / 4;
    const commAvg = (clarity + pace + confidence + engagement + fillerScore) / 5;
    const techScore = 80; // driven by network/audio store in a real integration

    const overallScore = Math.round(
      aqAvg     * SCORE_WEIGHTS.answerQuality +
      commAvg   * SCORE_WEIGHTS.communication +
      techScore * SCORE_WEIGHTS.technical,
    );

    const tier: SessionMetrics["tier"] =
      overallScore >= 80 ? "excellent" :
      overallScore >= 60 ? "good"      :
      overallScore >= 40 ? "fair"      :
                           "poor";

    // FIX: compute real trend from previous score
    const delta = overallScore - prevScoreRef.current;
    const direction: "up" | "down" | "stable" =
      Math.abs(delta) < 2 ? "stable" :
      delta > 0           ? "up"     :
                            "down";
    prevScoreRef.current = overallScore;

    setMetrics({
      overallScore,
      tier,
      answerQuality: {
        completeness: Math.round(completeness),
        accuracy:     Math.round(accuracy),
        relevance:    Math.round(relevance),
        structure:    Math.round(structure),
      },
      communication: {
        clarity:     Math.round(clarity),
        pace:        Math.round(pace),
        confidence:  Math.round(confidence),
        engagement:  Math.round(engagement),
        fillerWords: fillerScore,
      },
      technical: {
        networkQuality:  "good",
        audioQuality:    "good",
        microphoneLevel: "good",
        echoDetected:    false,
      },
      trending: {
        scoreChange: Math.abs(Math.round(delta)),
        direction,
      },
    });
  }, [transcript, elapsedSeconds]);

  // ── Compact view ────────────────────────────────────────────────
  if (!detailed) {
    if (isEstimated && metrics.overallScore === DEFAULT_METRICS.overallScore) {
      return (
        <div className={cn("space-y-2", className)}>
          <div
            className="px-3 py-2 rounded-xl border text-center"
            style={{ background: "rgba(255,255,255,0.03)", borderColor: "rgba(255,255,255,0.07)" }}
          >
            <p className="text-[11px]" style={{ color: "rgba(255,255,255,0.45)" }}>
              Estimating… speak a few more words for live scores
            </p>
          </div>
        </div>
      );
    }
    return (
      <div className={cn("space-y-2", className)}>
        <div
          className="flex items-center justify-between px-3 py-2 rounded-xl border"
          style={{ background: "rgba(255,255,255,0.03)", borderColor: "rgba(255,255,255,0.07)" }}
        >
          <div className="flex items-center gap-2">
            <Star className="h-3.5 w-3.5 text-amber-400" />
            <span className="text-xs font-medium" style={{ color: "rgba(255,255,255,0.5)" }}>Score</span>
          </div>
          <div className="flex items-center gap-2">
            <span className={cn("text-sm font-bold", getTierColor(metrics.tier))}>
              {metrics.overallScore}
            </span>
            {isEstimated && (
              <span
                className="text-[9px] uppercase tracking-wide px-1 py-0.5 rounded bg-white/10 text-white/40"
                title="Preliminary score — improves with more speech"
              >
                Est.
              </span>
            )}
            {showTrend && <TrendIcon direction={metrics.trending.direction} />}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className={cn("space-y-3", className)}>

      {/* Overall Score */}
      <div className={cn("p-3 rounded-xl border", getTierBg(metrics.tier))}>
        <div className="flex items-start justify-between mb-2">
          <div>
            <p className="text-xs font-semibold" style={{ color: "rgba(255,255,255,0.7)" }}>
              Overall Score
              {isEstimated && (
                <span
                  className="ml-1.5 text-[9px] font-normal uppercase tracking-wide px-1.5 py-0.5 rounded bg-white/10 text-white/40"
                  title="Scores are estimated from transcript heuristics until enough speech is captured"
                >
                  Est.
                </span>
              )}
            </p>
            <p className={cn("text-[10px] mt-0.5 capitalize font-medium", getTierColor(metrics.tier))}>
              {metrics.tier}
            </p>
          </div>
          <div className="text-right">
            <span className={cn("text-2xl font-bold tabular-nums", getTierColor(metrics.tier))}>
              {metrics.overallScore}
            </span>
            <span className="text-[10px] ml-0.5" style={{ color: "rgba(255,255,255,0.2)" }}>/100</span>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex-1 h-1.5 rounded-full overflow-hidden bg-black/30">
            <div
              className={cn(
                "h-full transition-all duration-700 ease-out",
                metrics.tier === "excellent" ? "bg-emerald-500" :
                metrics.tier === "good"      ? "bg-blue-500"    :
                metrics.tier === "fair"      ? "bg-amber-500"   :
                                               "bg-red-500"
              )}
              style={{ width: `${metrics.overallScore}%` }}
            />
          </div>
          {showTrend && (
            <div className="flex items-center gap-1 shrink-0">
              <TrendIcon direction={metrics.trending.direction} />
              {metrics.trending.scoreChange > 0 && (
                <span className="text-[10px] font-semibold tabular-nums"
                  style={{ color: "rgba(255,255,255,0.3)" }}>
                  {metrics.trending.direction === "up" ? "+" : "-"}{metrics.trending.scoreChange}
                </span>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Answer Quality */}
      <section
        className="p-3 rounded-xl space-y-3"
        style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.06)" }}
      >
        <h4 className="text-[10px] font-semibold uppercase tracking-widest"
          style={{ color: "rgba(255,255,255,0.3)" }}>Answer Quality</h4>
        <MetricRow label="Completeness" score={metrics.answerQuality.completeness} />
        <MetricRow label="Accuracy"     score={metrics.answerQuality.accuracy}     />
        <MetricRow label="Relevance"    score={metrics.answerQuality.relevance}     />
        <MetricRow label="Structure"    score={metrics.answerQuality.structure}     />
      </section>

      {/* Communication */}
      <section
        className="p-3 rounded-xl space-y-3"
        style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.06)" }}
      >
        <h4 className="text-[10px] font-semibold uppercase tracking-widest"
          style={{ color: "rgba(255,255,255,0.3)" }}>Communication</h4>
        <MetricRow label="Clarity"       score={metrics.communication.clarity}     />
        <MetricRow label="Speaking Pace" score={metrics.communication.pace}        />
        <MetricRow label="Confidence"    score={metrics.communication.confidence}  />
        <MetricRow label="Engagement"    score={metrics.communication.engagement}  />
        <MetricRow label="Filler Words"  score={metrics.communication.fillerWords} />
      </section>

      {/* Technical */}
      <section
        className="p-3 rounded-xl space-y-2"
        style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.06)" }}
      >
        <h4 className="text-[10px] font-semibold uppercase tracking-widest"
          style={{ color: "rgba(255,255,255,0.3)" }}>Technical</h4>
        <div className="flex items-center justify-between py-1">
          <span className="text-[11px]" style={{ color: "rgba(255,255,255,0.4)" }}>Network</span>
          <QualityBadge value={metrics.technical.networkQuality} />
        </div>
        <div className="flex items-center justify-between py-1"
          style={{ borderTop: "1px solid rgba(255,255,255,0.05)" }}>
          <span className="text-[11px]" style={{ color: "rgba(255,255,255,0.4)" }}>Audio</span>
          <QualityBadge value={metrics.technical.audioQuality} />
        </div>
        <div className="flex items-center justify-between py-1"
          style={{ borderTop: "1px solid rgba(255,255,255,0.05)" }}>
          <span className="text-[11px]" style={{ color: "rgba(255,255,255,0.4)" }}>Microphone</span>
          <span className={cn(
            "text-xs font-semibold",
            metrics.technical.microphoneLevel === "good"      ? "text-emerald-400" :
            metrics.technical.microphoneLevel === "too-quiet" ? "text-amber-400"   :
                                                                "text-red-400",
          )}>
            {metrics.technical.microphoneLevel === "good"      ? "Good"      :
             metrics.technical.microphoneLevel === "too-quiet" ? "Too Quiet" :
                                                                 "Too Loud"}
          </span>
        </div>
        {metrics.technical.echoDetected && (
          <div className="mt-1 px-2 py-1.5 rounded-lg text-[10px] text-red-400 font-medium"
            style={{ background: "rgba(239,68,68,0.1)", border: "1px solid rgba(239,68,68,0.2)" }}>
            ⚠️ Echo detected — check headphones
          </div>
        )}
      </section>
    </div>
  );
}

export default LiveMetricsPanel;
