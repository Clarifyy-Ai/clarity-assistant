import { useState, useEffect, useCallback, useRef } from "react";
import { fetchEdgeJson } from "@/lib/network/fetchEdge";
import { supabase } from "@/lib/supabase/client";
import { useAuthStore } from "@/store/userStore";
import { subscribeFocusRecovery } from "@/lib/focusRecovery";
import { classifyRequestError, toSafeUiError } from "@/lib/focusRecovery";
import { ApiClientError } from "@/lib/api/apiClient";
import { toast } from "sonner";
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
import { brandExportBasename } from "@/lib/constants/brandStorage";
import {
  ANALYTICS_CSV_HEADERS,
  buildAnalyticsSpreadsheetRows,
} from "@/lib/analytics/analyticsCsv";
import {
  buildActivityByDay,
  buildUnifiedScoreTrend,
  countScoredSessions,
  DEFAULT_ANALYTICS_PERIOD,
  normalizeAnalyticsDashboard,
  resolveAnalyticsLoadStatus,
  resolvePeriodSessionCount,
  resolveScoreTrendSource,
} from "@/lib/analytics/dashboardDerivations";

// ─────────────────────────────────────────────────────────────────
// useAnalytics
// Fetches, filters, and computes all analytics dashboard data.
// ─────────────────────────────────────────────────────────────────

const ANALYTICS_TIMEOUT_MS = 45_000;
const ANALYTICS_RETRY_TIMEOUT_MS = 60_000;

function analyticsLoadKey(
  userId: string | undefined,
  filter: AnalyticsFilter,
): string {
  return `${userId ?? ""}:${filter.period}:${filter.session_filter}:${filter.interview_type}`;
}

function analyticsLoadErrorMessage(err: unknown): string {
  if (classifyRequestError(err).kind === "network") {
    return "Your connection is slow or unstable. Wait a moment and tap Retry — loading can take up to a minute on weak networks.";
  }
  return toSafeUiError(err, "We couldn't load your analytics.");
}

export function useAnalytics() {
  const user = useAuthStore((s) => s.user);
  const authLoading = useAuthStore((s) => s.isLoading);

  const [data,         setData]         = useState<AnalyticsDashboardData | null>(null);
  const [isLoading,    setIsLoading]    = useState(true);
  const [isReloading,  setIsReloading]  = useState(false);
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
  const analyticsInflightKeyRef = useRef<string>("");
  const loadGenerationRef = useRef(0);
  const compareInflightRef = useRef(false);

  // ── Load on mount + filter change ────────────────────────────

  useEffect(() => {
    if (authLoading) return;
    if (!user?.id) {
      setIsLoading(false);
      setIsReloading(false);
      return;
    }
    void loadAnalytics();
    // loadAnalytics closes over current filter; re-run when the user or filters change.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authLoading, user?.id, filter.period, filter.session_filter, filter.interview_type]);

  useEffect(() => {
    return subscribeFocusRecovery((plan) => {
      if (plan.revalidate.includes("analytics")) {
        void loadAnalytics();
      }
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id]);

  async function loadAnalytics(): Promise<void> {
    const loadKey = analyticsLoadKey(user?.id, filter);
    if (analyticsInflightRef.current && analyticsInflightKeyRef.current === loadKey) {
      return analyticsInflightRef.current;
    }
    // Supersede an in-flight request for a different filter set.
    if (analyticsInflightRef.current && analyticsInflightKeyRef.current !== loadKey) {
      loadGenerationRef.current += 1;
    }

    const generation = ++loadGenerationRef.current;
    analyticsInflightKeyRef.current = loadKey;
    const requestFilter = filter;
    const timeZone = resolveDisplayTimeZone(
      useAuthStore.getState().profile?.timezone,
    );

    analyticsInflightRef.current = (async () => {
      if (!hasDataRef.current) {
        setIsLoading(true);
      } else {
        setIsReloading(true);
      }
      setError(null);

      const applyResult = (raw: Partial<AnalyticsDashboardData> | null | undefined) => {
        if (generation !== loadGenerationRef.current) return;
        const result = normalizeAnalyticsDashboard(raw);
        if (result.recent_sessions) {
          result.recent_sessions = result.recent_sessions.filter(
            (s) => !(s as { tags?: string[] }).tags?.includes("private"),
          );
        }
        setData(result);
        setComparison(null);
        setCompareError(null);
        hasDataRef.current = true;
        setIsStale(false);
      };

      try {
        applyResult(
          await fetchEdgeJson<AnalyticsDashboardData>(
            "analytics-dashboard",
            { filter: requestFilter, timezone: timeZone },
            { timeoutMs: ANALYTICS_TIMEOUT_MS },
          ),
        );
      } catch (err) {
        const retryable =
          err instanceof ApiClientError
            ? err.status === 503 || err.status === 504 || err.status === 429
            : /timeout|network|fetch failed|failed to fetch/i.test(
                err instanceof Error ? err.message : String(err ?? ""),
              );

        if (retryable && generation === loadGenerationRef.current) {
          try {
            applyResult(
              await fetchEdgeJson<AnalyticsDashboardData>(
                "analytics-dashboard",
                { filter: requestFilter, timezone: timeZone },
                { timeoutMs: ANALYTICS_RETRY_TIMEOUT_MS },
              ),
            );
            return;
          } catch {
            /* fall through to error state */
          }
        }

        if (generation !== loadGenerationRef.current) return;

        // Keep last-known data so optional 503s do not blank the shell.
        setError(analyticsLoadErrorMessage(err));
        setData((prev) => {
          setIsStale(Boolean(prev));
          return prev;
        });
      } finally {
        if (generation === loadGenerationRef.current) {
          setIsLoading(false);
          setIsReloading(false);
        }
        if (analyticsInflightKeyRef.current === loadKey) {
          analyticsInflightRef.current = null;
        }
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

  const clearFilters = useCallback(() => {
    setFilterState({
      period: DEFAULT_ANALYTICS_PERIOD,
      session_filter: "all",
      interview_type: "all",
    });
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
      // Soft-refresh scorecards when the quality gate was bumped (free Edge repair).
      // Failures are non-fatal — compare still uses whatever is stored.
      await Promise.allSettled([
        fetchEdgeJson("generate-scorecard", { session_id: sessionAId }, { timeoutMs: 90_000 }),
        fetchEdgeJson("generate-scorecard", { session_id: sessionBId }, { timeoutMs: 90_000 }),
      ]);
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

  // ── Download Excel workbook ───────────────────────────────────

  const downloadCSV = useCallback(async (): Promise<void> => {
    const sessions = data?.recent_sessions ?? [];
    if (sessions.length === 0) {
      toast.error("No sessions match the current filters to export.");
      return;
    }

    const timeZone = resolveDisplayTimeZone(
      useAuthStore.getState().profile?.timezone,
    );
    const XLSX = await import("xlsx");
    const rows = buildAnalyticsSpreadsheetRows(sessions, { timeZone });
    const sheet = XLSX.utils.aoa_to_sheet([ANALYTICS_CSV_HEADERS, ...rows]);
    sheet["!cols"] = [
      { wch: 12 }, { wch: 24 }, { wch: 22 }, { wch: 24 }, { wch: 14 },
      { wch: 15 }, { wch: 13 }, { wch: 10 }, { wch: 12 },
    ];
    sheet["!autofilter"] = { ref: `A1:I${rows.length + 1}` };
    sheet["!freeze"] = { xSplit: 0, ySplit: 1 };
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, sheet, "Skills Analytics");
    XLSX.writeFile(workbook, `${brandExportBasename("analytics", filter.period)}.xlsx`);
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

  const sessionsInSelectedPeriod = resolvePeriodSessionCount(data ?? {});

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

  const activityByDay = (() => {
    const fromServer = data?.activity_by_day;
    if (fromServer && Object.keys(fromServer).length > 0) return fromServer;
    return buildActivityByDay(data?.recent_sessions ?? [], displayTimeZone);
  })();

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

  const exportSessionCount = data?.recent_sessions?.length ?? 0;

  return {
    data,
    isLoading,
    isReloading,
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
    clearFilters,

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
    exportSessionCount,

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
