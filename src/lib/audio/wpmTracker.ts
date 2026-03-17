import type { WPMDataPoint } from "@/types/session.types";

// ─────────────────────────────────────────────────────────────────
// WPM (Words Per Minute) Tracker
// Tracks speaking speed in real time during a session.
// Provides rolling average, per-question data, and trend analysis.
// ─────────────────────────────────────────────────────────────────

// Average conversational speaking speed targets:
// < 110 WPM → Too slow (nervous, hesitant)
// 110–160 WPM → Ideal interview pace
// 161–180 WPM → Slightly fast but acceptable
// > 180 WPM → Too fast (anxious, hard to follow)

export const WPM_RANGES = {
  TOO_SLOW:   { min: 0,   max: 110 },
  IDEAL:      { min: 110, max: 160 },
  FAST:       { min: 160, max: 180 },
  TOO_FAST:   { min: 180, max: Infinity },
} as const;

export type WPMRating = "too_slow" | "ideal" | "fast" | "too_fast";

// ─────────────────────────────────────────────────────────────────
// WPM calculation utilities
// ─────────────────────────────────────────────────────────────────

export function calculateWPM(wordCount: number, durationSeconds: number): number {
  if (durationSeconds <= 0 || wordCount <= 0) return 0;
  return Math.round((wordCount / durationSeconds) * 60);
}

export function countWords(text: string): number {
  return text.trim().split(/\s+/).filter(Boolean).length;
}

export function rateWPM(wpm: number): WPMRating {
  if (wpm < WPM_RANGES.TOO_SLOW.max)  return "too_slow";
  if (wpm <= WPM_RANGES.IDEAL.max)    return "ideal";
  if (wpm <= WPM_RANGES.FAST.max)     return "fast";
  return "too_fast";
}

export function getWPMLabel(rating: WPMRating): string {
  const labels: Record<WPMRating, string> = {
    too_slow: "Too slow — try to be more confident",
    ideal:    "Great pace — clear and comfortable",
    fast:     "Slightly fast — slow down a little",
    too_fast: "Too fast — take a breath and slow down",
  };
  return labels[rating];
}

export function getWPMColor(wpm: number): string {
  const rating = rateWPM(wpm);
  const colors: Record<WPMRating, string> = {
    too_slow: "text-blue-400",
    ideal:    "text-green-400",
    fast:     "text-yellow-400",
    too_fast: "text-red-400",
  };
  return colors[rating];
}

// ─────────────────────────────────────────────────────────────────
// Real-time WPM tracker — tracks across full session
// ─────────────────────────────────────────────────────────────────

export class WPMTracker {
  private wordCount = 0;
  private startTime: number | null = null;
  private dataPoints: WPMDataPoint[] = [];
  private lastSnapshotTime = 0;
  private onUpdate: (wpm: number) => void;
  private readonly SNAPSHOT_INTERVAL_MS = 3000; // snapshot every 3 seconds

  constructor(onUpdate: (wpm: number) => void) {
    this.onUpdate = onUpdate;
  }

  // ── Start tracking ────────────────────────────────────────────

  start(): void {
    this.startTime = Date.now();
    this.lastSnapshotTime = Date.now();
  }

  // ── Process new transcript text ───────────────────────────────

  processText(text: string): void {
    if (!this.startTime) this.start();

    const newWords = countWords(text);
    this.wordCount += newWords;

    const now = Date.now();
    const elapsedSeconds = (now - this.startTime!) / 1000;
    const currentWPM = calculateWPM(this.wordCount, elapsedSeconds);

    // Snapshot every N seconds for chart data
    if (now - this.lastSnapshotTime >= this.SNAPSHOT_INTERVAL_MS) {
      this.dataPoints.push({
        timestamp: elapsedSeconds,
        wpm:       currentWPM,
      });
      this.lastSnapshotTime = now;
    }

    this.onUpdate(currentWPM);
  }

  // ── Per-question WPM tracker ──────────────────────────────────

  private questionStartTime: number | null = null;
  private questionWordCount = 0;

  startQuestion(): void {
    this.questionStartTime = Date.now();
    this.questionWordCount = 0;
  }

  processQuestionText(text: string): void {
    this.questionWordCount += countWords(text);
  }

  endQuestion(): number {
    if (!this.questionStartTime) return 0;
    const durationSeconds = (Date.now() - this.questionStartTime) / 1000;
    const wpm = calculateWPM(this.questionWordCount, durationSeconds);
    this.questionStartTime = null;
    this.questionWordCount = 0;
    return wpm;
  }

  // ── Getters ───────────────────────────────────────────────────

  getCurrentWPM(): number {
    if (!this.startTime || this.wordCount === 0) return 0;
    const elapsed = (Date.now() - this.startTime) / 1000;
    return calculateWPM(this.wordCount, elapsed);
  }

  getDataPoints(): WPMDataPoint[] {
    return [...this.dataPoints];
  }

  getTotalWordCount(): number {
    return this.wordCount;
  }

  getAverageWPM(): number {
    if (this.dataPoints.length === 0) return this.getCurrentWPM();
    const sum = this.dataPoints.reduce((acc, p) => acc + p.wpm, 0);
    return Math.round(sum / this.dataPoints.length);
  }

  getRating(): WPMRating {
    return rateWPM(this.getCurrentWPM());
  }

  // ── Reset ─────────────────────────────────────────────────────

  reset(): void {
    this.wordCount = 0;
    this.startTime = null;
    this.dataPoints = [];
    this.lastSnapshotTime = 0;
    this.questionStartTime = null;
    this.questionWordCount = 0;
  }
}

// ─────────────────────────────────────────────────────────────────
// WPM trend analysis — for analytics dashboard
// ─────────────────────────────────────────────────────────────────

export function analyseWPMTrend(
  dataPoints: WPMDataPoint[]
): {
  trend:     "improving" | "declining" | "stable";
  avg:       number;
  min:       number;
  max:       number;
  variance:  number;
} {
  if (dataPoints.length === 0) {
    return { trend: "stable", avg: 0, min: 0, max: 0, variance: 0 };
  }

  const values = dataPoints.map((p) => p.wpm);
  const avg = Math.round(values.reduce((a, b) => a + b, 0) / values.length);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const variance = Math.round(
    values.reduce((sum, v) => sum + Math.pow(v - avg, 2), 0) / values.length
  );

  // Trend: compare first third vs last third
  const third = Math.floor(values.length / 3);
  if (third < 1) return { trend: "stable", avg, min, max, variance };

  const earlyAvg = values.slice(0, third).reduce((a, b) => a + b, 0) / third;
  const lateAvg  = values.slice(-third).reduce((a, b) => a + b, 0) / third;
  const delta = lateAvg - earlyAvg;

  let trend: "improving" | "declining" | "stable";
  if (Math.abs(delta) < 10)      trend = "stable";
  else if (delta > 0 && earlyAvg < WPM_RANGES.IDEAL.min) trend = "improving";
  else if (delta < 0 && earlyAvg > WPM_RANGES.IDEAL.max) trend = "improving";
  else if (delta < 0)            trend = "declining";
  else                           trend = "stable";

  return { trend, avg, min, max, variance };
}
