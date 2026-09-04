import type {
  AnalyticsDashboardData,
  AnalyticsPeriod,
  DimensionAverages,
  SessionAnalyticsSummary,
} from "@/types/analytics.types";
import { normalizeScoreStatus } from "@/lib/analytics/scoreStatus";

/** Default analytics period when filters are cleared. */
export const DEFAULT_ANALYTICS_PERIOD: AnalyticsPeriod = "30d";

export const SCORECARD_DIMENSION_KEYS = [
  "communication",
  "technical",
  "problem_solving",
  "confidence",
] as const;

export type ScorecardDimensionKey = (typeof SCORECARD_DIMENSION_KEYS)[number];

/** Last N scored sessions shown in the score trend chart. */
export const SCORE_TREND_CHART_LIMIT = 20;

export type ScoreTrendPoint = {
  date: string;
  score: number | null;
  session_id?: string;
};

export type ScoreTrendSource = "scorecards" | "sessions";

export function resolveScoreTrendSource(input: {
  recentSessions: ReadonlyArray<SessionAnalyticsSummary>;
  confidenceTrend: ReadonlyArray<{ date: string; score?: number | null }>;
}): ScoreTrendSource {
  const fromScorecards = input.confidenceTrend.filter((point) => point.date);
  if (fromScorecards.some((point) => isFiniteAnalyticsScore(point.score))) {
    return "scorecards";
  }
  return "sessions";
}

export function scoreTrendBadgeLabel(source: ScoreTrendSource): string {
  return source === "scorecards"
    ? "Scorecard trend"
    : `Last ${SCORE_TREND_CHART_LIMIT} sessions`;
}

/** Calendar day key (YYYY-MM-DD) for a timestamp in the user's display timezone. */
export function localDayKey(iso: string, timeZone: string): string {
  const ms = Date.parse(iso);
  if (!Number.isFinite(ms)) return "";
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date(ms));
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${values.year}-${values.month}-${values.day}`;
}

/** Count completed sessions per local calendar day — same source as the Sessions KPI. */
export function buildActivityByDay(
  sessions: ReadonlyArray<Pick<SessionAnalyticsSummary, "date" | "started_at">>,
  timeZone: string,
): Record<string, number> {
  const out: Record<string, number> = {};
  for (const session of sessions) {
    const anchor = session.started_at ?? session.date;
    if (!anchor) continue;
    const day = localDayKey(anchor, timeZone);
    if (!day) continue;
    out[day] = (out[day] ?? 0) + 1;
  }
  return out;
}

export function heatmapDaysForPeriod(period: AnalyticsPeriod): number {
  switch (period) {
    case "7d":
      return 7;
    case "30d":
      return 30;
    case "90d":
      return 90;
    case "all":
      return 84;
    default:
      return 30;
  }
}

export function heatmapPeriodTitle(period: AnalyticsPeriod): string {
  switch (period) {
    case "7d":
      return "Practice activity — last 7 days";
    case "30d":
      return "Practice activity — last 30 days";
    case "90d":
      return "Practice activity — last 90 days";
    case "all":
      return "Practice activity — all time";
    default:
      return "Practice activity";
  }
}

/** GitHub-style heatmap grid keys (oldest → newest), aligned to display timezone. */
export function buildHeatmapWeekDayKeys(
  timeZone: string,
  totalDays = 84,
): string[][] {
  const days: string[] = [];
  const now = Date.now();
  for (let offset = totalDays - 1; offset >= 0; offset -= 1) {
    days.push(localDayKey(new Date(now - offset * 86_400_000).toISOString(), timeZone));
  }

  const weeks: string[][] = [];
  let week: string[] = [];
  for (const day of days) {
    week.push(day);
    if (week.length === 7) {
      weeks.push(week);
      week = [];
    }
  }
  if (week.length > 0) weeks.push(week);
  return weeks;
}

export function isFiniteAnalyticsScore(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

/** Coerce edge dimension_averages — never 0-fill missing fields. */
export function normalizeDimensionAverages(
  raw: Partial<Record<string, number | null | undefined>> | null | undefined,
): DimensionAverages | null {
  if (!raw || typeof raw !== "object") return null;

  const out = {} as DimensionAverages;
  let hasAny = false;

  for (const key of SCORECARD_DIMENSION_KEYS) {
    const value = raw[key];
    out[key] = isFiniteAnalyticsScore(value) ? value : null;
    if (out[key] !== null) hasAny = true;
  }

  return hasAny ? out : null;
}

/**
 * One score series for charts: prefer scored scorecard trend, else fall back to
 * the same filtered session list that powers the Sessions KPI.
 */
export function buildUnifiedScoreTrend(input: {
  recentSessions: ReadonlyArray<SessionAnalyticsSummary>;
  confidenceTrend: ReadonlyArray<{ date: string; score?: number | null }>;
}): ScoreTrendPoint[] {
  const fromScorecards = input.confidenceTrend
    .filter((point) => point.date)
    .map((point) => ({
      date: point.date,
      score: isFiniteAnalyticsScore(point.score) ? point.score : null,
    }));

  if (fromScorecards.some((point) => isFiniteAnalyticsScore(point.score))) {
    return fromScorecards;
  }

  return input.recentSessions
    .filter((session) => session.date)
    .map((session) => {
      const status = normalizeScoreStatus(session.score_status, session.overall_score);
      return {
        date: session.date,
        session_id: session.session_id,
        // Exclude processing / placeholder / failed rows from the chart series.
        score:
          status === "scored" && isFiniteAnalyticsScore(session.overall_score)
            ? session.overall_score
            : null,
      };
    });
}

export function countScoredSessions(
  sessions: ReadonlyArray<Pick<SessionAnalyticsSummary, "overall_score" | "score_status">>,
): number {
  return sessions.filter((session) => {
    const status = normalizeScoreStatus(session.score_status, session.overall_score);
    return status === "scored" && isFiniteAnalyticsScore(session.overall_score);
  }).length;
}

export function isAnalyticsPayloadEmpty(input: {
  total_sessions?: number | null;
  recent_sessions?: ReadonlyArray<unknown> | null;
}): boolean {
  const listed = input.recent_sessions?.length ?? 0;
  const total = Number(input.total_sessions) || 0;
  return listed === 0 && total === 0;
}

/**
 * Sessions KPI for the selected filter window. Prefer the larger of the
 * listed rows and total_sessions so a truncated recent list cannot zero-out
 * the count while the backend still reports activity.
 */
export function resolvePeriodSessionCount(input: {
  total_sessions?: number | null;
  recent_sessions?: ReadonlyArray<unknown> | null;
}): number {
  const listed = input.recent_sessions?.length ?? 0;
  const total = Number(input.total_sessions) || 0;
  return Math.max(listed, total);
}

export type AnalyticsLoadStatus = "loading" | "ready" | "empty" | "error";

export function resolveAnalyticsLoadStatus(input: {
  isLoading: boolean;
  error: string | null;
  data: { total_sessions?: number; recent_sessions?: unknown[] } | null;
}): AnalyticsLoadStatus {
  if (input.isLoading) return "loading";
  if (input.error && !input.data) return "error";
  if (!input.data || isAnalyticsPayloadEmpty(input.data)) return "empty";
  return "ready";
}

/** Coerce edge payloads into a stable dashboard shape (empty success ≠ error). */
export function normalizeAnalyticsDashboard(
  raw: Partial<AnalyticsDashboardData> | null | undefined,
): AnalyticsDashboardData {
  const recent_sessions = Array.isArray(raw?.recent_sessions) ? raw.recent_sessions : [];
  const total_sessions = Number(raw?.total_sessions) || recent_sessions.length;

  return {
    total_sessions,
    total_practice_hours: raw?.total_practice_hours ?? 0,
    avg_confidence_score: raw?.avg_confidence_score ?? null,
    avg_confidence_delta_30d: raw?.avg_confidence_delta_30d ?? null,
    avg_filler_rate: raw?.avg_filler_rate ?? null,
    avg_filler_delta_30d: raw?.avg_filler_delta_30d ?? null,
    avg_wpm: raw?.avg_wpm ?? null,
    avg_wpm_delta_30d: raw?.avg_wpm_delta_30d ?? null,
    current_streak: raw?.current_streak ?? null,
    longest_streak: raw?.longest_streak ?? null,
    total_xp: raw?.total_xp ?? 0,
    confidence_trend: raw?.confidence_trend ?? [],
    filler_trend: raw?.filler_trend ?? [],
    wpm_trend: raw?.wpm_trend ?? [],
    weak_spot_radar: raw?.weak_spot_radar ?? [],
    dimension_averages: normalizeDimensionAverages(raw?.dimension_averages as unknown as Partial<Record<string, number | null | undefined>>),
    strengths: raw?.strengths ?? [],
    weaknesses: raw?.weaknesses ?? [],
    leaderboard:
      raw?.leaderboard ?? {
        entries: [],
        current_user_rank: null,
        period: "monthly",
        scope: "global",
        is_opted_in: false,
      },
    recent_sessions,
    activity_by_day: raw?.activity_by_day,
    sessions_scored: raw?.sessions_scored ?? countScoredSessions(recent_sessions),
    period_start: raw?.period_start ?? new Date().toISOString(),
    period_end: raw?.period_end ?? new Date().toISOString(),
    generated_at: raw?.generated_at ?? new Date().toISOString(),
  };
}
