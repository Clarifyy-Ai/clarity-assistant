import { useState, useEffect, useCallback } from "react";
import { fetchEdgeJson } from "@/lib/network/fetchEdge";
import { supabase } from "@/lib/supabase/client";
import { useAuthStore } from "@/store/userStore";
import type {
  AnalyticsDashboardData,
  AnalyticsFilter,
  AnalyticsPeriod,
  AnalyticsSessionFilter,
  SessionComparisonData,
  SessionAnalyticsSummary,
  LeaderboardEntry,
} from "@/types/analytics.types";
import type { InterviewType } from "@/types/session.types";

// ─────────────────────────────────────────────────────────────────
// useAnalytics
// Fetches, filters, and computes all analytics dashboard data.
// ─────────────────────────────────────────────────────────────────

export function useAnalytics() {
  const { user } = useAuthStore();

  const [data,         setData]         = useState<AnalyticsDashboardData | null>(null);
  const [isLoading,    setIsLoading]    = useState(true);
  const [error,        setError]        = useState<string | null>(null);
  const [filter,       setFilterState]  = useState<AnalyticsFilter>({
    period:         "30d",
    session_filter: "all",
    interview_type: "all",
  });
  const [comparison,   setComparison]   = useState<SessionComparisonData | null>(null);

  // ── Load on mount + filter change ────────────────────────────

  useEffect(() => {
    if (!user) return;
    loadAnalytics();
  }, [user?.id, filter.period, filter.session_filter, filter.interview_type]);

  async function loadAnalytics(): Promise<void> {
    setIsLoading(true);
    setError(null);

    try {
      const result = await fetchEdgeJson<AnalyticsDashboardData>(
        "analytics-dashboard",
        { filter },
      );
      if (result?.recent_sessions) {
        result.recent_sessions = result.recent_sessions.filter(
          (s) => !(s as { tags?: string[] }).tags?.includes("private"),
        );
      }
      setData(result);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load analytics");
    } finally {
      setIsLoading(false);
    }
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
    try {
      const [a, b] = await Promise.all([
        fetchSessionSummary(sessionAId),
        fetchSessionSummary(sessionBId),
      ]);
      if (!a || !b) return;

      const result: SessionComparisonData = {
        session_a:         a,
        session_b:         b,
        score_delta:       b.overall_score   - a.overall_score,
        filler_delta:      b.filler_rate     - a.filler_rate,
        wpm_delta:         b.wpm_avg         - a.wpm_avg,
        improvement_areas: computeImprovements(a, b),
        regression_areas:  computeRegressions(a, b),
      };

      setComparison(result);
    } catch { /* non-fatal */ }
  }, []);

  async function fetchSessionSummary(
    sessionId: string
  ): Promise<SessionAnalyticsSummary | null> {
    const { data } = await supabase
      .from("scorecards")
      .select(`
        session_id,
        overall_score,
        filler_rate,
        wpm_avg,
        sessions!inner(
          created_at, mode, interview_type, company, duration_seconds,
          session_questions(count)
        )
      `)
      .eq("session_id", sessionId)
      .maybeSingle();

    if (!data) return null;
    const d = data as any;
    const session = d.sessions;

    return {
      session_id:       sessionId,
      date:             session.created_at,
      mode:             session.mode,
      interview_type:   session.interview_type,
      company:          session.company,
      overall_score:    d.overall_score,
      filler_rate:      d.filler_rate,
      wpm_avg:          d.wpm_avg,
      duration_minutes: Math.round(session.duration_seconds / 60),
      question_count:   session.session_questions?.[0]?.count ?? 0,
    };
  }

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

    const rows = data.recent_sessions.map((s) => [
      new Date(s.date).toLocaleDateString(),
      s.mode,
      s.interview_type,
      s.company ?? "—",
      s.overall_score,
      s.filler_rate.toFixed(2),
      s.wpm_avg,
      s.duration_minutes,
      s.question_count,
    ]);

    const csv = [headers, ...rows]
      .map((row) => row.join(","))
      .join("\n");

    const blob = new Blob([csv], { type: "text/csv" });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement("a");
    a.href     = url;
    a.download = `clarify-ai-analytics-${filter.period}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }, [data, filter.period]);

  const avgScore30d   = data?.avg_confidence_score ?? 0;
  const scoreDelta    = data?.avg_confidence_delta_30d ?? null;
  const avgWpm        = data?.avg_wpm ?? 0;
  const avgFillers    = data ? Math.round(data.avg_filler_rate * 10) / 10 : 0;
  const fillerDelta   = data?.avg_filler_delta_30d ?? null;
  const wpmDelta      = null;
  const avgConfidence = data?.avg_confidence_score ?? 0;

  const sessionsThisWeek = (() => {
    if (!data?.recent_sessions) return 0;
    const weekAgo = new Date();
    weekAgo.setDate(weekAgo.getDate() - 7);
    return data.recent_sessions.filter(
      (s) => new Date(s.date) >= weekAgo
    ).length;
  })();

  const scoreTrend = (data?.confidence_trend ?? []).map((p) => ({
    date: p.date,
    score: p.score,
  }));

  const dimensionAverages: Record<string, number> | undefined = data?.weak_spot_radar
    ? Object.fromEntries(data.weak_spot_radar.map((w) => [w.label, w.avg_score]))
    : undefined;

  const categoryScores = (data?.weak_spot_radar ?? []).map((w) => ({
    category: w.label,
    avg_score: w.avg_score,
    count: w.session_count,
  }));

  const fillerBreakdown: Record<string, number> = {};
  if (data?.filler_trend) {
    for (const fp of data.filler_trend) {
      if (fp.top_filler) {
        fillerBreakdown[fp.top_filler] =
          (fillerBreakdown[fp.top_filler] ?? 0) + fp.total_fillers;
      }
    }
  }

  const activityByDay: Record<string, number> = {};
  if (data?.recent_sessions) {
    for (const s of data.recent_sessions) {
      const day = s.date.slice(0, 10);
      activityByDay[day] = (activityByDay[day] ?? 0) + 1;
    }
  }

  return {
    data,
    isLoading,
    error,
    filter,
    comparison,

    setPeriod,
    setSessionFilter,
    setInterviewTypeFilter,

    compareSessions,
    clearComparison: () => setComparison(null),

    toggleLeaderboardOptIn,
    downloadCSV,
    reload: loadAnalytics,

    avgScore30d,
    scoreDelta,
    sessionsThisWeek,
    avgWpm,
    avgFillers,
    fillerDelta,
    wpmDelta,
    avgConfidence,
    scoreTrend,
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

// ─────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────

function computeImprovements(
  a: SessionAnalyticsSummary,
  b: SessionAnalyticsSummary
): string[] {
  const improvements: string[] = [];
  if (b.overall_score > a.overall_score + 5)  improvements.push("Overall score");
  if (b.filler_rate   < a.filler_rate   - 0.5) improvements.push("Fewer filler words");
  if (b.wpm_avg >= 110 && a.wpm_avg < 110)     improvements.push("Speaking pace");
  return improvements;
}

function computeRegressions(
  a: SessionAnalyticsSummary,
  b: SessionAnalyticsSummary
): string[] {
  const regressions: string[] = [];
  if (b.overall_score < a.overall_score - 5)   regressions.push("Overall score");
  if (b.filler_rate   > a.filler_rate   + 0.5)  regressions.push("Filler word rate");
  if (b.wpm_avg > 180 && a.wpm_avg <= 180)      regressions.push("Speaking too fast");
  return regressions;
}
