import { useEffect, useRef, useState } from "react";
import { useAudioStore } from "@/store/audioStore";
import { useSessionStore } from "@/store/sessionStore";
import { BarChart3, TrendingDown, TrendingUp, Minus } from "lucide-react";
import { cn } from "@/lib/utils";

// ─────────────────────────────────────────────────────────────────
// LiveAIFeedback
// Real-time AI feedback panel showing:
// - Sentiment analysis (positive/neutral/negative)
// - Filler word count & percentage
// - Speaking pace (WPM)
// - Confidence score
// - Topic relevance score
// ─────────────────────────────────────────────────────────────────

interface FeedbackMetrics {
  sentiment: {
    label: "positive" | "neutral" | "negative";
    score: number;
    emoji: string;
  };
  fillerWords: {
    count:        number;
    percentage:   number;
    threshold:    number;
    trend:        "up" | "down" | "stable";
    trendPercent: number;
  };
  speakingPace: {
    current:  number;
    average:  number;
    optimal:  [number, number];
    quality:  "slow" | "good" | "fast";
  };
  confidence: {
    score:        number;
    trend:        "up" | "down" | "stable";
    trendPercent: number;
  };
  topicRelevance: {
    score:   number;
    onTopic: boolean;
  };
  pause: {
    duration:  number;
    isLong:    boolean;
    threshold: number;
  };
}

interface LiveAIFeedbackProps {
  className?:   string;
  compact?:     boolean;
  showTrends?:  boolean;
}

// FIX: removed "so", "well", "just" — these appear constantly in normal
//      professional speech and caused extremely high false-positive rates.
const FILLER_WORDS = [
  "um", "uh", "like", "you know", "basically",
  "actually", "literally", "honestly",
];

const FILLER_THRESHOLD = 12; // % threshold before warning
const PAUSE_THRESHOLD  = 3;  // seconds

// ─── TrendIcon defined OUTSIDE the parent ─────────────────────────
// FIX: inner component definitions get a new identity every render,
//      causing React to unmount/remount them unnecessarily.

function TrendIcon({ trend, invert = false }: { trend: "up" | "down" | "stable"; invert?: boolean }) {
  // For filler words: up = bad (red), down = good (green) → invert=true
  if (trend === "up")   return <TrendingUp   className={cn("h-3.5 w-3.5", invert ? "text-red-400"     : "text-emerald-400")} />;
  if (trend === "down") return <TrendingDown  className={cn("h-3.5 w-3.5", invert ? "text-emerald-400" : "text-red-400")}     />;
  return                       <Minus         className="h-3.5 w-3.5 text-white/20" />;
}

function MiniBar({ value, color }: { value: number; color: string }) {
  return (
    <div className="flex items-center gap-2">
      <div className="flex-1 h-1.5 rounded-full overflow-hidden bg-white/5">
        <div
          className={cn("h-full transition-all duration-500 ease-out", color)}
          style={{ width: `${value}%` }}
        />
      </div>
      <span className="text-[11px] font-semibold tabular-nums w-8 text-right"
        style={{ color: "rgba(255,255,255,0.4)" }}>
        {value}%
      </span>
    </div>
  );
}

// ─── Default state ─────────────────────────────────────────────────

const DEFAULT: FeedbackMetrics = {
  sentiment:      { label: "neutral", score: 50, emoji: "😐" },
  fillerWords:    { count: 0, percentage: 0, threshold: FILLER_THRESHOLD, trend: "stable", trendPercent: 0 },
  speakingPace:   { current: 0, average: 0, optimal: [100, 130], quality: "good" },
  confidence:     { score: 60, trend: "stable", trendPercent: 0 },
  topicRelevance: { score: 70, onTopic: true },
  pause:          { duration: 0, isLong: false, threshold: PAUSE_THRESHOLD },
};

// ─── Main component ─────────────────────────────────────────────────

export function LiveAIFeedback({
  className,
  compact     = false,
  showTrends  = true,
}: LiveAIFeedbackProps) {
  // FIX: elapsedTime does not exist on audioStore — use elapsed_seconds from sessionStore
  const transcript     = useAudioStore((s) => s.transcript);
  const elapsedSeconds = useSessionStore((s) => s.elapsed_seconds ?? 0);

  const [metrics, setMetrics] = useState<FeedbackMetrics>(DEFAULT);

  // FIX: track previous filler% and confidence to compute real trends
  const prevFillerPctRef  = useRef(0);
  const prevConfidenceRef = useRef(60);
  // Running WPM average buffer (last N samples)
  const wpmSamplesRef = useRef<number[]>([]);

  useEffect(() => {
    if (!transcript?.utterances?.length) return;

    const text  = transcript.utterances.map((u) => u.text).join(" ").toLowerCase();
    const words = text.split(/\s+/).filter((w) => w.length > 0);
    const total = words.length;

    // ── WPM ────────────────────────────────────────────────────
    // FIX: guard against zero elapsed time — only compute WPM after at least
    //      10 words have been spoken to avoid wildly inflated early readings.
    let wpm = 0;
    if (total >= 10 && elapsedSeconds >= 5) {
      wpm = Math.round((total / elapsedSeconds) * 60);
      wpmSamplesRef.current = [...wpmSamplesRef.current.slice(-9), wpm];
    }
    const avgWpm = wpmSamplesRef.current.length
      ? Math.round(wpmSamplesRef.current.reduce((a, b) => a + b, 0) / wpmSamplesRef.current.length)
      : 0;

    const paceQuality: "slow" | "good" | "fast" =
      wpm === 0       ? "good"  :
      wpm < 80        ? "slow"  :
      wpm > 150       ? "fast"  :
                        "good";

    // ── Filler words ───────────────────────────────────────────
    let fillerCount = 0;
    FILLER_WORDS.forEach((f) => {
      const m = text.match(new RegExp(`\\b${f}\\b`, "gi"));
      if (m) fillerCount += m.length;
    });
    const fillerPct = total > 0 ? Math.round((fillerCount / total) * 100) : 0;

    // FIX: real trend from previous measurement
    const fillerDelta = fillerPct - prevFillerPctRef.current;
    const fillerTrend: "up" | "down" | "stable" =
      Math.abs(fillerDelta) < 1 ? "stable" :
      fillerDelta > 0           ? "up"     :
                                  "down";
    prevFillerPctRef.current = fillerPct;

    // ── Sentiment ──────────────────────────────────────────────
    const positiveKw = ["great", "excellent", "good", "amazing", "perfect", "love", "happy", "successful", "proud", "excited"];
    const negativeKw = ["bad", "terrible", "awful", "horrible", "hate", "sad", "failed", "worst", "difficult", "struggle"];
    let sentScore = 50;
    positiveKw.forEach((w) => { if (text.includes(w)) sentScore += 4; });
    negativeKw.forEach((w) => { if (text.includes(w)) sentScore -= 4; });
    sentScore = Math.max(0, Math.min(100, sentScore));
    const sentLabel: "positive" | "neutral" | "negative" =
      sentScore > 60 ? "positive" : sentScore < 40 ? "negative" : "neutral";
    const sentEmoji = sentLabel === "positive" ? "😊" : sentLabel === "negative" ? "😟" : "😐";

    // ── Confidence heuristic ───────────────────────────────────
    const hedgeKw = ["maybe", "perhaps", "possibly", "i think", "sort of", "kind of", "not sure", "i guess"];
    const hedgeCount  = hedgeKw.filter((h) => text.includes(h)).length;
    const confidenceScore = Math.max(30, Math.min(95,
      75 - hedgeCount * 6 -
      (fillerPct > FILLER_THRESHOLD ? 10 : 0) -
      (paceQuality !== "good" ? 5 : 0),
    ));

    // FIX: real confidence trend
    const confDelta = confidenceScore - prevConfidenceRef.current;
    const confTrend: "up" | "down" | "stable" =
      Math.abs(confDelta) < 3 ? "stable" :
      confDelta > 0           ? "up"     :
                                "down";
    prevConfidenceRef.current = confidenceScore;

    // ── Topic relevance ────────────────────────────────────────
    // FIX: removed "question"/"answer" which match almost any sentence;
    //      use more specific interview-context keywords instead
    const topicKw = [
      "experience", "contributed", "led", "built", "designed", "delivered",
      "improved", "implemented", "managed", "achieved", "responsibility",
    ];
    const topicScore = Math.min(95, 55 + topicKw.filter((k) => text.includes(k)).length * 4);

    setMetrics({
      sentiment:      { label: sentLabel, score: Math.round(sentScore), emoji: sentEmoji },
      fillerWords: {
        count:        fillerCount,
        percentage:   fillerPct,
        threshold:    FILLER_THRESHOLD,
        trend:        fillerTrend,
        trendPercent: Math.abs(fillerDelta),
      },
      speakingPace: {
        current: wpm,
        average: avgWpm,
        optimal: [100, 130],
        quality: paceQuality,
      },
      confidence: {
        score:        Math.round(confidenceScore),
        trend:        confTrend,
        trendPercent: Math.abs(Math.round(confDelta)),
      },
      topicRelevance: {
        score:   Math.round(topicScore),
        onTopic: topicScore > 60,
      },
      pause: { duration: 0, isLong: false, threshold: PAUSE_THRESHOLD },
    });
  }, [transcript, elapsedSeconds]);

  // ── Compact mode ────────────────────────────────────────────────
  if (compact) {
    return (
      <div className={cn("space-y-2.5", className)}>
        <div className="flex items-center justify-between">
          <span className="text-[11px]" style={{ color: "rgba(255,255,255,0.4)" }}>Sentiment</span>
          <div className="flex items-center gap-2">
            <span>{metrics.sentiment.emoji}</span>
            <div className="w-14 h-1 rounded-full overflow-hidden bg-white/5">
              <div
                className={cn("h-full transition-all duration-500",
                  metrics.sentiment.score > 60 ? "bg-emerald-500" :
                  metrics.sentiment.score < 40 ? "bg-red-500"     :
                                                 "bg-blue-500")}
                style={{ width: `${metrics.sentiment.score}%` }}
              />
            </div>
          </div>
        </div>
        <div className="flex items-center justify-between">
          <span className="text-[11px]" style={{ color: "rgba(255,255,255,0.4)" }}>Filler</span>
          <div className="flex items-center gap-1.5">
            {showTrends && <TrendIcon trend={metrics.fillerWords.trend} invert />}
            <span className="text-[11px] font-semibold tabular-nums"
              style={{ color: "rgba(255,255,255,0.55)" }}>
              {metrics.fillerWords.count}
            </span>
          </div>
        </div>
        <div className="flex items-center justify-between">
          <span className="text-[11px]" style={{ color: "rgba(255,255,255,0.4)" }}>Pace</span>
          <span className={cn("text-[11px] font-semibold tabular-nums",
            metrics.speakingPace.quality === "good" ? "text-emerald-400" :
            metrics.speakingPace.quality === "slow" ? "text-amber-400"   :
                                                      "text-red-400")}>
            {metrics.speakingPace.current > 0 ? `${metrics.speakingPace.current} WPM` : "—"}
          </span>
        </div>
      </div>
    );
  }

  // ── Full panel ────────────────────────────────────────────────
  return (
    <div className={cn("space-y-3", className)}>
      {/* Header */}
      <div className="flex items-center gap-2 pb-2"
        style={{ borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
        <BarChart3 className="h-3.5 w-3.5 text-blue-400" />
        <h3 className="text-xs font-semibold" style={{ color: "rgba(255,255,255,0.7)" }}>
          Live Feedback
        </h3>
      </div>

      {/* Sentiment */}
      <div className="space-y-1.5">
        <div className="flex items-center justify-between">
          <span className="text-[11px]" style={{ color: "rgba(255,255,255,0.4)" }}>Sentiment</span>
          <span className="text-base">{metrics.sentiment.emoji}</span>
        </div>
        <MiniBar
          value={metrics.sentiment.score}
          color={
            metrics.sentiment.score > 60 ? "bg-emerald-500" :
            metrics.sentiment.score < 40 ? "bg-red-500"     :
                                           "bg-blue-500"
          }
        />
        <p className="text-[10px] capitalize" style={{ color: "rgba(255,255,255,0.25)" }}>
          {metrics.sentiment.label}
        </p>
      </div>

      {/* Filler Words */}
      <div className="p-2.5 rounded-xl space-y-1.5"
        style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.06)" }}>
        <div className="flex items-center justify-between">
          <span className="text-[11px]" style={{ color: "rgba(255,255,255,0.4)" }}>Filler Words</span>
          {showTrends && (
            <div className="flex items-center gap-1">
              <TrendIcon trend={metrics.fillerWords.trend} invert />
              <span className="text-[10px]" style={{ color: "rgba(255,255,255,0.3)" }}>
                {metrics.fillerWords.trendPercent.toFixed(1)}%
              </span>
            </div>
          )}
        </div>
        <div className="flex items-center justify-between">
          <span className="text-sm font-bold" style={{ color: "rgba(255,255,255,0.75)" }}>
            {metrics.fillerWords.count}
          </span>
          <span className="text-[10px]" style={{ color: "rgba(255,255,255,0.3)" }}>
            {metrics.fillerWords.percentage}% of words
          </span>
        </div>
        {metrics.fillerWords.percentage > metrics.fillerWords.threshold && (
          <p className="text-[10px] text-amber-400 font-medium">
            ⚠️ Above recommended {metrics.fillerWords.threshold}% threshold
          </p>
        )}
      </div>

      {/* Speaking Pace */}
      <div className="p-2.5 rounded-xl space-y-1.5"
        style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.06)" }}>
        <div className="flex items-center justify-between">
          <span className="text-[11px]" style={{ color: "rgba(255,255,255,0.4)" }}>Speaking Pace</span>
          <span className={cn("text-[11px] font-semibold",
            metrics.speakingPace.quality === "good" ? "text-emerald-400" :
            metrics.speakingPace.quality === "slow" ? "text-amber-400"   :
                                                      "text-red-400")}>
            {metrics.speakingPace.quality === "good" && "✓ On target"}
            {metrics.speakingPace.quality === "slow" && "⚡ Too slow"}
            {metrics.speakingPace.quality === "fast" && "⚠️ Too fast"}
          </span>
        </div>
        <div className="flex items-baseline gap-1">
          <span className="text-sm font-bold" style={{ color: "rgba(255,255,255,0.75)" }}>
            {metrics.speakingPace.current > 0 ? metrics.speakingPace.current : "—"}
          </span>
          {metrics.speakingPace.current > 0 && (
            <span className="text-[10px]" style={{ color: "rgba(255,255,255,0.3)" }}>WPM</span>
          )}
        </div>
        <p className="text-[10px]" style={{ color: "rgba(255,255,255,0.22)" }}>
          Optimal: {metrics.speakingPace.optimal[0]}–{metrics.speakingPace.optimal[1]} WPM
        </p>
      </div>

      {/* Confidence */}
      <div className="p-2.5 rounded-xl space-y-1.5"
        style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.06)" }}>
        <div className="flex items-center justify-between">
          <span className="text-[11px]" style={{ color: "rgba(255,255,255,0.4)" }}>Confidence</span>
          {showTrends && (
            <div className="flex items-center gap-1">
              <TrendIcon trend={metrics.confidence.trend} />
              {metrics.confidence.trendPercent > 0 && (
                <span className="text-[10px]" style={{ color: "rgba(255,255,255,0.3)" }}>
                  {metrics.confidence.trendPercent}%
                </span>
              )}
            </div>
          )}
        </div>
        <div className="flex-1 h-1.5 rounded-full overflow-hidden bg-white/5">
          <div
            className="h-full transition-all duration-500 ease-out"
            style={{
              width:      `${metrics.confidence.score}%`,
              background: `linear-gradient(90deg, #ef4444 0%, #f59e0b 50%, #10b981 100%)`,
              // Clip to only show up to the score point for a gradient-fill effect
              clipPath:   `inset(0 ${100 - metrics.confidence.score}% 0 0)`,
            }}
          />
        </div>
        <p className="text-[10px]" style={{ color: "rgba(255,255,255,0.3)" }}>
          {metrics.confidence.score}%
        </p>
      </div>

      {/* Topic Relevance */}
      <div className="p-2.5 rounded-xl space-y-1.5"
        style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.06)" }}>
        <div className="flex items-center justify-between">
          <span className="text-[11px]" style={{ color: "rgba(255,255,255,0.4)" }}>Topic Relevance</span>
          <span className={cn("text-[11px] font-semibold",
            metrics.topicRelevance.onTopic ? "text-emerald-400" : "text-amber-400")}>
            {metrics.topicRelevance.onTopic ? "✓ On Topic" : "⚠️ Off Topic"}
          </span>
        </div>
        <MiniBar
          value={metrics.topicRelevance.score}
          color={
            metrics.topicRelevance.score > 70 ? "bg-emerald-500" :
            metrics.topicRelevance.score > 50 ? "bg-amber-500"   :
                                                "bg-red-500"
          }
        />
      </div>
    </div>
  );
}

export default LiveAIFeedback;
