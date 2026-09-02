import { useState, useEffect, useCallback, useRef } from "react";
import { fetchEdgeJson } from "@/lib/network/fetchEdge";
import { supabase } from "@/lib/supabase/client";
import { useAuthStore } from "@/store/userStore";
import { subscribeFocusRecovery } from "@/lib/focusRecovery";
import { toSafeUiError } from "@/lib/focusRecovery";
import { ApiClientError } from "@/lib/api/apiClient";
import type {
  AnalyticsDashboardData,
  AnalyticsFilter,
  AnalyticsPeriod,
  AnalyticsSessionFilter,
  SessionComparisonData,
  SessionAnalyticsSummary,
} from "@/types/analytics.types";
import type { InterviewType } from "@/types/session.types";
import {
  compareErrorUserMessage,
  resolveDisplayTimeZone,
  type SessionComparisonPayload,
  type SessionComparisonSide,
} from "@/lib/analytics/sessionComparison";
import {
  buildActivityByDay,
  buildUnifiedScoreTrend,
  countScoredSessions,
  DEFAULT_ANALYTICS_PERIOD,
  normalizeAnalyticsDashboard,
  resolveAnalyticsLoadStatus,
  resolveScoreTrendSource,
} from "@/lib/analytics/dashboardDerivations";

// ─────────────────────────────────────────────────────────────────
// useAnalytics
// Fetches, filters, and computes all analytics dashboard data.
// ─────────────────────────────────────────────────────────────────

export function useAnalytics() {
  const { user } = useAuthStore();

  const [data,         setData]         = useState<AnalyticsDashboardData | null>(null);
  const [isLoading,    setIsLoading]    = useState(true);
  const [error,        setError]        = useState<string | null>(null);
  const [isStale,      setIsStale]      = useState(false);
  const [filter,       setFilterState]  = useState<AnalyticsFilter>({
    period:         DEFAULT_ANALYTICS_PERIOD,
    session_filter: "all",
    interview_type: "all",
  });
  const [comparison,   setComparison]   = useState<SessionComparisonData | null>(null);
  const [isComparing,  setIsComparing]  = useState(false);
  const [compareError, setCompareError] = useState<string | null>(null);

  const hasDataRef = useRef(false);
  const analyticsInflightRef = useRef<Promise<void> | null>(null);
  const compareInflightRef = useRef(false);

  // ── Load on mount + filter change ────────────────────────────

  useEffect(() => {
    if (!user) return;
    void loadAnalytics();
    // loadAnalytics closes over current filter; re-run when the user or filters change.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id, filter.period, filter.session_filter, filter.interview_type]);

  useEffect(() => {
    return subscribeFocusRecovery((plan) => {
      if (plan.revalidate.includes("analytics")) {
        void loadAnalytics();
      }
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id]);

  async function loadAnalytics(): Promise<void> {
    if (analyticsInflightRef.current) return analyticsInflightRef.current;

    analyticsInflightRef.current = (async () => {
      if (!hasDataRef.current) {
        setIsLoading(true);
      }
      setError(null);

      try {
        const result = normalizeAnalyticsDashboard(
          await fetchEdgeJson<AnalyticsDashboardData>(
            "analytics-dashboard",
            {
              filter,
              timezone: resolveDisplayTimeZone(
                useAuthStore.getState().profile?.timezone,
              ),
            },
            { timeoutMs: 25_000 },
          ),
        );
        if (result?.recent_sessions) {
          result.recent_sessions = result.recent_sessions.filter(
            (s) => !(s as { tags?: string[] }).tags?.includes("private"),
          );
        }
        setData(result);
        setComparison(null);
        setCompareError(null);
        hasDataRef.current = true;
        setIsStale(false);
      } catch (err) {
        // Keep last-known data so optional 503s do not blank the shell.
        setError(toSafeUiError(err, "We couldn't load your analytics."));
        setData((prev) => {
          setIsStale(Boolean(prev));
          return prev;
        });
      } finally {
        setIsLoading(false);
        analyticsInflightRef.current = null;
      }
    })();
    return analyticsInflightRef.current;
  }

  // ── Filter setters ────────────────────────────────────────────

  const setPeriod = useCallback((period: AnalyticsPeriod) => {
    setFilterState((f) => ({ ...f, period }));
  }, []);

  const setSessionFilter = useCallback((session_filter: AnalyticsSessionFilter) => {
    setFilterState((f) => ({ ...f, session_filter }));
  }, []);

  const setInterviewTypeFilter = useCallback((interview_type: InterviewType | "all") => {
    setFilterState((f) => ({ ...f, interview_type }));
  }, []);

  // ── Session comparison ────────────────────────────────────────

  const compareSessions = useCallback(async (
    sessionAId: string,
    sessionBId: string
  ): Promise<void> => {
    if (compareInflightRef.current) return;
    compareInflightRef.current = true;
    setIsComparing(true);
    setCompareError(null);
    setComparison(null);
    try {
      const timeZone = resolveDisplayTimeZone(
        useAuthStore.getState().profile?.timezone,
      );
      const payload = await fetchEdgeJson<SessionComparisonPayload>(
        "compare-sessions",
        {
          session_a_id: sessionAId,
          session_b_id: sessionBId,
          timezone: timeZone,
        },
        { timeoutMs: 20_000 },
      );
      setComparison(payloadToComparison(payload));
    } catch (err) {
      const code = err instanceof ApiClientError ? err.code : null;
      const raw = err instanceof Error ? err.message : "";
      setCompareError(compareErrorUserMessage(code, raw));
      setComparison(null);
    } finally {
      compareInflightRef.current = false;
      setIsComparing(false);
    }
  }, []);

  // ── Leaderboard opt-in ────────────────────────────────────────

  const toggleLeaderboardOptIn = useCallback(async (optIn: boolean): Promise<void> => {
    if (!user) return;
    await supabase
      .from("profiles")
      .update({ leaderboard_opt_in: optIn } as any)
      .eq("id", user.id);

    // Reload analytics to refresh leaderboard
    await loadAnalytics();
  }, [user]);

  // ── Download CSV ──────────────────────────────────────────────

  const downloadCSV = useCallback(async (): Promise<void> => {
    if (!data?.recent_sessions.length) return;

    const headers = [
      "Date", "Mode", "Interview Type", "Company",
      "Overall Score", "Filler Rate", "WPM", "Duration (min)", "Questions",
    ];

    const escapeCsv = (value: unknown) => {
      const text = value === null || value === undefined ? "" : String(value);
      return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
    };
    const rows = data.recent_sessions.map((s) => [
      new Date(s.date).toLocaleDateString(),
      s.mode ?? "",
      s.interview_type ?? "",
      s.company ?? "",
      s.overall_score ?? "",
      typeof s.filler_rate === "number" ? s.filler_rate.toFixed(2) : "",
      s.wpm_avg ?? "",
      s.duration_minutes ?? "",
      s.question_count ?? "",
    ]);

    const csv = [headers, ...rows]
      .map((row) => row.map(escapeCsv).join(","))
      .join("\n");

    const blob = new Blob([csv], { type: "text/csv" });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement("a");
    a.href     = url;
    a.download = `clarify-ai-analytics-${filter.period}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }, [data, filter.period]);

  const avgScore30d   = data?.avg_confidence_score ?? null;
  const scoreDelta    = data?.avg_confidence_delta_30d ?? null;
  const avgWpm        = data?.avg_wpm ?? null;
  const avgFillers    = typeof data?.avg_filler_rate === "number"
    ? Math.round(data.avg_filler_rate * 10) / 10
    : null;
  const fillerDelta   = data?.avg_filler_delta_30d ?? null;
  const wpmDelta      = data?.avg_wpm_delta_30d ?? null;
  const avgConfidence = data?.dimension_averages?.confidence ?? null;

  const sessionsThisWeek = (() => {
    if (!data?.recent_sessions) return 0;
    const weekAgo = new Date();
    weekAgo.setDate(weekAgo.getDate() - 7);
    return data.recent_sessions.filter(
      (s) => new Date(s.date) >= weekAgo
    ).length;
  })();
  const displayTimeZone = resolveDisplayTimeZone(
    useAuthStore.getState().profile?.timezone,
  );

  const sessionsInSelectedPeriod =
    data?.recent_sessions?.length ?? data?.total_sessions ?? 0;

  const sessionsScored =
    data?.sessions_scored ??
    countScoredSessions(data?.recent_sessions ?? []);

  const scoreTrend = buildUnifiedScoreTrend({
    recentSessions: data?.recent_sessions ?? [],
    confidenceTrend: data?.confidence_trend ?? [],
  });

  const scoreTrendSource = resolveScoreTrendSource({
    recentSessions: data?.recent_sessions ?? [],
    confidenceTrend: data?.confidence_trend ?? [],
  });

  const activityByDay =
    data?.activity_by_day ??
    buildActivityByDay(data?.recent_sessions ?? [], displayTimeZone);

  const loadStatus = resolveAnalyticsLoadStatus({
    isLoading,
    error,
    data,
  });

  const dimensionAverages = data?.dimension_averages ?? undefined;

  const categoryScores = (data?.weak_spot_radar ?? []).map((w) => ({
    category: w.label,
    avg_score: w.avg_score,
    count: w.session_count,
  }));

  const fillerBreakdown: Record<string, number> = {};
  if (data?.filler_trend) {
    for (const fp of data.filler_trend) {
      if (
        fp.top_filler &&
        typeof fp.total_fillers === "number" &&
        Number.isFinite(fp.total_fillers)
      ) {
        fillerBreakdown[fp.top_filler] =
          (fillerBreakdown[fp.top_filler] ?? 0) + fp.total_fillers;
      }
    }
  }

  const filtersActive =
    filter.period !== DEFAULT_ANALYTICS_PERIOD ||
    filter.session_filter !== "all" ||
    filter.interview_type !== "all";

  return {
    data,
    isLoading,
    error,
    isStale,
    loadStatus,
    filter,
    filtersActive,
    comparison,
    displayTimeZone,
    sessionsScored,

    setPeriod,
    setSessionFilter,
    setInterviewTypeFilter,

    compareSessions,
    clearComparison: () => {
      setComparison(null);
      setCompareError(null);
    },
    isComparing,
    compareError,

    toggleLeaderboardOptIn,
    downloadCSV,
    reload: loadAnalytics,

    avgScore30d,
    scoreDelta,
    sessionsThisWeek,
    sessionsInSelectedPeriod,
    avgWpm,
    avgFillers,
    fillerDelta,
    wpmDelta,
    avgConfidence,
    scoreTrend,
    scoreTrendSource,
    dimensionAverages,
    categoryScores,
    fillerBreakdown,
    activityByDay,

    summary: data
      ? {
          totalSessions:      data.total_sessions,
          practiceHours:      data.total_practice_hours,
          avgScore:           data.avg_confidence_score,
          scoreDelta:         data.avg_confidence_delta_30d,
          currentStreak:      data.current_streak,
          longestStreak:      data.longest_streak,
          avgFillerRate:      data.avg_filler_rate,
          avgWPM:             data.avg_wpm,
        }
      : null,
  };
}

function sideToSummary(side: SessionComparisonSide): SessionAnalyticsSummary {
  return {
    session_id: side.session_id,
    date: side.started_at ?? side.created_at,
    started_at: side.started_at,
    ended_at: side.ended_at,
    mode: side.session_type ?? "mock",
    company: side.company,
    title: side.title,
    status: side.status,
    completion_state: side.completion_state,
    overall_score: side.overall_score,
    score_status: side.score_state,
    filler_rate: side.speech.filler_rate,
    wpm_avg: side.speech.wpm_avg,
    duration_minutes: side.duration_minutes,
    duration_seconds: side.duration_seconds,
    question_count: side.question_count,
    answered_count: side.answered_count,
    unanswered_count: side.unanswered_count,
    comparable: side.completion_state === "completed" && side.score_state === "scored",
  };
}

function payloadToComparison(payload: SessionComparisonPayload): SessionComparisonData {
  const session_a = sideToSummary(payload.baseline);
  const session_b = sideToSummary(payload.comparison);
  return {
    source_version: payload.source_version,
    baseline_rule: payload.baseline_rule,
    timezone: payload.timezone,
    baseline: session_a,
    comparison: session_b,
    session_a,
    session_b,
    score_delta: payload.deltas.overall_score,
    filler_delta: payload.deltas.filler_rate,
    wpm_delta: payload.deltas.wpm_avg,
    improvement_areas: payload.improvement_areas,
    regression_areas: payload.regression_areas,
    deltas: payload.deltas,
  };
}
