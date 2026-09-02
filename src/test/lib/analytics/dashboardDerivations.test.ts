import { describe, expect, it } from "vitest";
import {
  buildActivityByDay,
  buildHeatmapWeekDayKeys,
  buildUnifiedScoreTrend,
  countScoredSessions,
  DEFAULT_ANALYTICS_PERIOD,
  heatmapDaysForPeriod,
  heatmapPeriodTitle,
  isAnalyticsPayloadEmpty,
  localDayKey,
  normalizeAnalyticsDashboard,
  normalizeDimensionAverages,
  resolveAnalyticsLoadStatus,
  resolveScoreTrendSource,
  scoreTrendBadgeLabel,
  SCORECARD_DIMENSION_KEYS,
} from "@/lib/analytics/dashboardDerivations";

describe("localDayKey + buildActivityByDay", () => {
  it("buckets sessions in the display timezone (not UTC slice)", () => {
    // 2026-01-01 23:30 UTC → 2026-01-02 in Asia/Kolkata (+5:30)
    const iso = "2026-01-01T23:30:00.000Z";
    expect(localDayKey(iso, "UTC")).toBe("2026-01-01");
    expect(localDayKey(iso, "Asia/Kolkata")).toBe("2026-01-02");

    const activity = buildActivityByDay(
      [{ date: iso }, { date: iso }],
      "Asia/Kolkata",
    );
    expect(activity["2026-01-02"]).toBe(2);
    expect(activity["2026-01-01"]).toBeUndefined();
  });

  it("matches heatmap grid keys for the same timezone", () => {
    const iso = new Date().toISOString();
    const dayKey = localDayKey(iso, "UTC");
    const activity = buildActivityByDay([{ date: iso }], "UTC");
    const weeks = buildHeatmapWeekDayKeys("UTC", 7);
    const gridKeys = new Set(weeks.flat());
    expect(gridKeys.has(dayKey)).toBe(true);
    expect(activity[dayKey]).toBe(1);
  });
});

describe("buildUnifiedScoreTrend", () => {
  const sessions = [
    {
      session_id: "a",
      date: "2026-02-01T10:00:00.000Z",
      overall_score: null,
      score_status: "not_scored" as const,
    },
    {
      session_id: "b",
      date: "2026-02-02T10:00:00.000Z",
      overall_score: 82,
      score_status: "scored" as const,
    },
  ];

  it("falls back to recent_sessions when confidence_trend has no scores", () => {
    const trend = buildUnifiedScoreTrend({
      recentSessions: sessions,
      confidenceTrend: [],
    });
    expect(trend).toHaveLength(2);
    expect(trend[0].score).toBeNull();
    expect(trend[1].score).toBe(82);
  });

  it("prefers confidence_trend when it contains scored points", () => {
    const trend = buildUnifiedScoreTrend({
      recentSessions: sessions,
      confidenceTrend: [{ date: "2026-02-03T10:00:00.000Z", score: 90 }],
    });
    expect(trend).toHaveLength(1);
    expect(trend[0].score).toBe(90);
  });
});

describe("score trend source + badge copy", () => {
  it("detects scorecard vs session trend sources", () => {
    expect(
      resolveScoreTrendSource({
        recentSessions: [{ session_id: "a", date: "2026-01-01", overall_score: 70 }],
        confidenceTrend: [],
      }),
    ).toBe("sessions");

    expect(
      resolveScoreTrendSource({
        recentSessions: [{ session_id: "a", date: "2026-01-01", overall_score: 70 }],
        confidenceTrend: [{ date: "2026-01-02", score: 88 }],
      }),
    ).toBe("scorecards");
  });

  it("labels badge copy for each trend source", () => {
    expect(scoreTrendBadgeLabel("scorecards")).toBe("Scorecard trend");
    expect(scoreTrendBadgeLabel("sessions")).toBe("Last 20 sessions");
  });
});

describe("heatmap period helpers", () => {
  it("maps analytics period to grid length and title copy", () => {
    expect(DEFAULT_ANALYTICS_PERIOD).toBe("30d");
    expect(heatmapDaysForPeriod("7d")).toBe(7);
    expect(heatmapDaysForPeriod("30d")).toBe(30);
    expect(heatmapDaysForPeriod("90d")).toBe(90);
    expect(heatmapPeriodTitle("7d")).toMatch(/7 days/);
    expect(heatmapPeriodTitle("30d")).toMatch(/30 days/);
    expect(heatmapPeriodTitle("all")).toMatch(/all time/);
    expect(buildHeatmapWeekDayKeys("UTC", heatmapDaysForPeriod("7d")).flat()).toHaveLength(7);
  });
});

describe("analytics load status", () => {
  it("distinguishes empty success from backend failure", () => {
    expect(
      resolveAnalyticsLoadStatus({
        isLoading: false,
        error: null,
        data: { total_sessions: 0, recent_sessions: [] },
      }),
    ).toBe("empty");

    expect(
      resolveAnalyticsLoadStatus({
        isLoading: false,
        error: "We couldn't load your analytics.",
        data: null,
      }),
    ).toBe("error");

    expect(
      resolveAnalyticsLoadStatus({
        isLoading: false,
        error: null,
        data: { total_sessions: 10, recent_sessions: [{ session_id: "x" }] },
      }),
    ).toBe("ready");
  });

  it("counts scored sessions for chart messaging", () => {
    expect(
      countScoredSessions([
        { overall_score: null, score_status: "not_scored" },
        { overall_score: 70, score_status: "scored" },
      ]),
    ).toBe(1);
    expect(isAnalyticsPayloadEmpty({ total_sessions: 0, recent_sessions: [] })).toBe(true);
    expect(isAnalyticsPayloadEmpty({ total_sessions: 3, recent_sessions: [] })).toBe(false);
  });

  it("normalizes partial edge payloads without treating them as errors", () => {
    const normalized = normalizeAnalyticsDashboard({
      recent_sessions: [],
    });
    expect(normalized.total_sessions).toBe(0);
    expect(normalized.recent_sessions).toEqual([]);
    expect(normalized.sessions_scored).toBe(0);
    expect(normalized.dimension_averages).toBeNull();
    expect(normalized.avg_wpm_delta_30d).toBeNull();
  });
});

describe("normalizeDimensionAverages", () => {
  it("averages only present scorecard dimensions — never 0-fills missing fields", () => {
    const result = normalizeDimensionAverages({
      communication: 80,
      technical: null,
      problem_solving: undefined,
      confidence: 65,
    });
    expect(result).toEqual({
      communication: 80,
      technical: null,
      problem_solving: null,
      confidence: 65,
    });
  });

  it("returns null when every dimension is absent", () => {
    expect(normalizeDimensionAverages({})).toBeNull();
    expect(normalizeDimensionAverages(null)).toBeNull();
    expect(
      normalizeDimensionAverages({
        communication: null,
        technical: undefined,
        problem_solving: NaN,
        confidence: null,
      }),
    ).toBeNull();
  });

  it("is wired through normalizeAnalyticsDashboard", () => {
    const normalized = normalizeAnalyticsDashboard({
      recent_sessions: [{ session_id: "x" }],
      dimension_averages: {
        communication: 72,
        technical: 68,
        problem_solving: 70,
        confidence: 74,
      },
      avg_wpm_delta_30d: 5,
    });
    expect(normalized.dimension_averages).toEqual({
      communication: 72,
      technical: 68,
      problem_solving: 70,
      confidence: 74,
    });
    expect(normalized.avg_wpm_delta_30d).toBe(5);
    expect(SCORECARD_DIMENSION_KEYS).toHaveLength(4);
  });
});
