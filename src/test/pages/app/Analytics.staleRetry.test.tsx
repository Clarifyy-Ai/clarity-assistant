import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";

const useAnalytics = vi.fn();

vi.mock("@/hooks/useAnalytics", () => ({
  useAnalytics: () => useAnalytics(),
}));

vi.mock("@/store/authStore", () => ({
  useAuthStore: (selector?: (state: { profile: { timezone: string } }) => unknown) => {
    const state = { profile: { timezone: "UTC" } };
    return selector ? selector(state) : state;
  },
}));

vi.mock("@/components/layout/PlanGate", () => ({
  PlanGate: ({ children }: { children: unknown }) => children,
}));

vi.mock("recharts", () => ({
  ResponsiveContainer: ({ children }: { children: unknown }) => children,
  BarChart: () => null,
  Bar: () => null,
  CartesianGrid: () => null,
  Tooltip: () => null,
  XAxis: () => null,
  YAxis: () => null,
}));

import Analytics from "@/pages/app/Analytics";

function staleReadyMock(reload = vi.fn()) {
  return {
    data: {
      total_sessions: 3,
      recent_sessions: [
        {
          session_id: "s-1",
          date: "2026-08-20T10:00:00.000Z",
          started_at: "2026-08-20T10:00:00.000Z",
          mode: "mock",
          company: "Acme",
          overall_score: 72,
          score_status: "scored",
          completion_state: "completed",
          comparable: true,
          filler_rate: 1.2,
          wpm_avg: 118,
          duration_minutes: 25,
          question_count: 5,
        },
        {
          session_id: "s-2",
          date: "2026-08-22T10:00:00.000Z",
          started_at: "2026-08-22T10:00:00.000Z",
          mode: "mock",
          company: "Globex",
          overall_score: 80,
          score_status: "scored",
          completion_state: "completed",
          comparable: true,
          filler_rate: 0.9,
          wpm_avg: 125,
          duration_minutes: 30,
          question_count: 5,
        },
      ],
      avg_confidence_score: 74,
      avg_confidence_delta_30d: 1,
      avg_filler_rate: 1.0,
      avg_wpm: 120,
      confidence_trend: [],
      filler_trend: [],
      weak_spot_radar: [],
    },
    isLoading: false,
    error: "We couldn't refresh your analytics.",
    isStale: true,
    loadStatus: "ready" as const,
    displayTimeZone: "UTC",
    sessionsScored: 2,
    filter: { period: "30d", session_filter: "all", interview_type: "all" },
    filtersActive: false,
    comparison: null,
    setPeriod: vi.fn(),
    setSessionFilter: vi.fn(),
    setInterviewTypeFilter: vi.fn(),
    compareSessions: vi.fn(),
    clearComparison: vi.fn(),
    isComparing: false,
    compareError: null,
    toggleLeaderboardOptIn: vi.fn(),
    downloadCSV: vi.fn(),
    reload,
    avgScore30d: 76,
    scoreDelta: 2,
    sessionsThisWeek: 2,
    sessionsInSelectedPeriod: 2,
    avgWpm: 120,
    avgFillers: 1.0,
    fillerDelta: null,
    wpmDelta: null,
    avgConfidence: 74,
    scoreTrend: [{ date: "2026-08-20T10:00:00.000Z", score: 72 }],
    scoreTrendSource: "sessions" as const,
    dimensionAverages: undefined,
    categoryScores: [],
    fillerBreakdown: {},
    activityByDay: {},
    summary: null,
  };
}

describe("Analytics stale retry — BUG-029", () => {
  beforeEach(() => {
    useAnalytics.mockReset();
  });

  it("keeps the KPI row visible when data is stale and reload is offered", async () => {
    const reload = vi.fn();
    useAnalytics.mockReturnValue(staleReadyMock(reload));

    render(
      <MemoryRouter>
        <Analytics />
      </MemoryRouter>,
    );

    expect(screen.getByTestId("analytics-kpi-row")).toBeInTheDocument();
    expect(screen.getByTestId("analytics-kpi-sessions")).toBeInTheDocument();
    expect(screen.getByTestId("analytics-kpi-sessions")).toHaveTextContent("2");
    expect(screen.getByText("Showing last known data")).toBeInTheDocument();
    expect(screen.getByText(/couldn't refresh your analytics/i)).toBeInTheDocument();

    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: /retry/i }));
    expect(reload).toHaveBeenCalledTimes(1);
  });
});
