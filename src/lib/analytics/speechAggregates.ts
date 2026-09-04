/**
 * Speech KPI helpers for analytics.
 * Overall score stays scorecard-only; WPM/filler may fall back to session fields.
 */

export type SpeechScorecardLike = {
  overall_score?: number | null;
  wpm_avg?: number | null;
  filler_rate?: number | null;
  details?: Record<string, unknown> | null;
};

export type SpeechSessionLike = {
  avg_wpm?: number | null;
  filler_words?: number | null;
  started_at?: string | null;
  ended_at?: string | null;
};

export function scorecardSpeechMetric(
  scorecard: SpeechScorecardLike | null | undefined,
  key: "wpm_avg" | "filler_rate",
): number | null {
  if (!scorecard) return null;
  const direct = scorecard[key];
  if (typeof direct === "number" && Number.isFinite(direct)) return direct;
  const details = scorecard.details;
  if (details && typeof details === "object") {
    const nested = details[key];
    if (typeof nested === "number" && Number.isFinite(nested)) return nested;
  }
  return null;
}

export function sessionDurationSeconds(
  session: Pick<SpeechSessionLike, "started_at" | "ended_at">,
): number | null {
  if (!session.started_at || !session.ended_at) return null;
  const start = Date.parse(session.started_at);
  const end = Date.parse(session.ended_at);
  if (!Number.isFinite(start) || !Number.isFinite(end)) return null;
  const seconds = Math.round((end - start) / 1000);
  return seconds >= 0 ? seconds : null;
}

/** Fillers per minute from absolute filler_words + duration. */
export function sessionFillerRatePerMinute(
  session: SpeechSessionLike,
): number | null {
  const fillers = session.filler_words;
  const duration = sessionDurationSeconds(session);
  if (typeof fillers !== "number" || !Number.isFinite(fillers) || fillers < 0) {
    return null;
  }
  if (duration == null || duration <= 0) return null;
  const minutes = duration / 60;
  if (minutes <= 0) return null;
  return Math.round((fillers / minutes) * 100) / 100;
}

export function resolveSessionWpm(
  scorecard: SpeechScorecardLike | null | undefined,
  session: SpeechSessionLike,
): number | null {
  const fromCard = scorecardSpeechMetric(scorecard, "wpm_avg");
  if (fromCard != null) return fromCard;
  return typeof session.avg_wpm === "number" && Number.isFinite(session.avg_wpm)
    ? session.avg_wpm
    : null;
}

export function resolveSessionFillerRate(
  scorecard: SpeechScorecardLike | null | undefined,
  session: SpeechSessionLike,
): number | null {
  const fromCard = scorecardSpeechMetric(scorecard, "filler_rate");
  if (fromCard != null) return fromCard;
  return sessionFillerRatePerMinute(session);
}

export function averageFinite(values: Array<number | null | undefined>): number | null {
  const nums = values.filter((v): v is number => typeof v === "number" && Number.isFinite(v));
  if (nums.length === 0) return null;
  return nums.reduce((a, b) => a + b, 0) / nums.length;
}

export function averageWpmWithSessionFallback(
  pairs: Array<{ scorecard?: SpeechScorecardLike | null; session: SpeechSessionLike }>,
): number | null {
  const avg = averageFinite(pairs.map((p) => resolveSessionWpm(p.scorecard, p.session)));
  return avg == null ? null : Math.round(avg);
}

export function averageFillerRateWithSessionFallback(
  pairs: Array<{ scorecard?: SpeechScorecardLike | null; session: SpeechSessionLike }>,
): number | null {
  const avg = averageFinite(pairs.map((p) => resolveSessionFillerRate(p.scorecard, p.session)));
  return avg == null ? null : Math.round(avg * 100) / 100;
}

export function unscoredSessionsStatusCopy(
  sessionsInPeriod: number,
  sessionsScored: number,
): string {
  if (sessionsInPeriod <= 0) return "No session data yet.";
  if (sessionsScored === 0) {
    return `${sessionsInPeriod} completed session${sessionsInPeriod === 1 ? "" : "s"} in this range; 0 scored — finish a session with answers or retry analysis.`;
  }
  return `Score trends appear once more sessions are scored.`;
}
