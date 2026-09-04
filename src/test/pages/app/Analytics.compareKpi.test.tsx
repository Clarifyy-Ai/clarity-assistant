import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import type { AnalyticsDashboardData } from "@/types/analytics.types";

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

function sessionRow(
  id: string,
  comparable: boolean,
): AnalyticsDashboardData["recent_sessions"][number] {
  return {
    session_id: id,
    date: "2026-08-20T10:00:00.000Z",
    started_at: "2026-08-20T10:00:00.000Z",
    mode: "mock",
    company: comparable ? `Co-${id}` : `Skip-${id}`,
    title: comparable ? `Mock — Co-${id}` : `Incomplete — ${id}`,
    overall_score: comparable ? 70 : null,
    score_status: comparable ? "scored" : "not_scored",
    completion_state: comparable ? "completed" : "incomplete",
    comparable,
    filler_rate: comparable ? 1 : null,
    wpm_avg: comparable ? 120 : null,
    duration_minutes: comparable ? 20 : null,
    question_count: comparable ? 4 : null,
  };
}

function analyticsState(overrides?: {
  period?: "7d" | "30d" | "90d" | "all";
  recent_sessions?: AnalyticsDashboardData["recent_sessions"];
  total_sessions?: number;
}) {
  const recent_sessions =
    overrides?.recent_sessions ??
    [
      ...Array.from({ length: 8 }, (_, i) => sessionRow(`skip-${i}`, false)),
      sessionRow("cmp-a", true),
      sessionRow("cmp-b", true),
    ];
  return {
    data: {
      total_sessions: overrides?.total_sessions ?? 10,
      recent_sessions,
      avg_confidence_score: 76,
      avg_confidence_delta_30d: 2,
      avg_filler_rate: 0.8,
      avg_wpm: 120,
      confidence_trend: [],
      filler_trend: [],
      weak_spot_radar: [],
    },
    isLoading: false,
    error: null,
    isStale: false,
    loadStatus: "ready" as const,
    displayTimeZone: "UTC",
    sessionsScored: 2,
    filter: { period: overrides?.period ?? "30d", session_filter: "all", interview_type: "all" },
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
    reload: vi.fn(),
    avgScore30d: 76,
    scoreDelta: 2,
    sessionsThisWeek: 2,
    sessionsInSelectedPeriod: recent_sessions.length,
    avgWpm: 120,
    avgFillers: 0.8,
    fillerDelta: null,
    wpmDelta: null,
    avgConfidence: 76,
    scoreTrend: [],
    dimensionAverages: undefined,
    categoryScores: [],
    fillerBreakdown: {},
    activityByDay: {},
    summary: null,
  };
}

describe("Analytics session KPI scope — BUG-028 / TC-REP-003", () => {
  beforeEach(() => {
    useAnalytics.mockReset();
    useAnalytics.mockReturnValue(analyticsState());
  });

  it("shows the period-scoped count of 10 on trend tabs", () => {
    render(
      <MemoryRouter>
        <Analytics />
      </MemoryRouter>,
    );
    const kpi = screen.getByTestId("analytics-kpi-sessions");
    expect(kpi).toHaveAttribute("data-kpi-scope", "period");
    expect(kpi).toHaveTextContent("10");
    expect(kpi).toHaveTextContent("Sessions in last 30 days");
    expect(kpi).not.toHaveTextContent(/sessions overall/i);
  });

  it("switches the KPI to the two selected sessions on Compare", async () => {
    const user = userEvent.setup();
    render(
      <MemoryRouter>
        <Analytics />
      </MemoryRouter>,
    );
    await user.click(screen.getByRole("tab", { name: "Compare" }));
    const kpi = screen.getByTestId("analytics-kpi-sessions");
    expect(kpi).toHaveAttribute("data-kpi-scope", "compare");
    expect(kpi).toHaveTextContent("2");
    expect(kpi).toHaveTextContent("Sessions in this comparison");
    expect(kpi).not.toHaveTextContent("10");
    expect(kpi).not.toHaveTextContent(/overall/i);
  });

  it("uses the 7-day label when the date range changes", () => {
    useAnalytics.mockReturnValue(
      analyticsState({
        period: "7d",
        recent_sessions: [sessionRow("a", true), sessionRow("b", true), sessionRow("c", false)],
      }),
    );
    render(
      <MemoryRouter>
        <Analytics />
      </MemoryRouter>,
    );
    const kpi = screen.getByTestId("analytics-kpi-sessions");
    expect(kpi).toHaveTextContent("3");
    expect(kpi).toHaveTextContent("Sessions in last 7 days");
  });

  it("shows one selected comparable session on Compare", async () => {
    const user = userEvent.setup();
    useAnalytics.mockReturnValue(
      analyticsState({
        recent_sessions: [
          ...Array.from({ length: 9 }, (_, i) => sessionRow(`skip-${i}`, false)),
          sessionRow("only-one", true),
        ],
      }),
    );
    render(
      <MemoryRouter>
        <Analytics />
      </MemoryRouter>,
    );
    await user.click(screen.getByRole("tab", { name: "Compare" }));
    const kpi = screen.getByTestId("analytics-kpi-sessions");
    expect(kpi).toHaveAttribute("data-kpi-scope", "compare");
    expect(kpi).toHaveTextContent("1");
    expect(kpi).toHaveTextContent("Sessions in this comparison");
    expect(kpi).not.toHaveTextContent("10");
  });

  it("shows an empty comparison count when nothing is comparable", async () => {
    const user = userEvent.setup();
    useAnalytics.mockReturnValue(
      analyticsState({
        recent_sessions: Array.from({ length: 10 }, (_, i) => sessionRow(`skip-${i}`, false)),
      }),
    );
    render(
      <MemoryRouter>
        <Analytics />
      </MemoryRouter>,
    );
    await user.click(screen.getByRole("tab", { name: "Compare" }));
    const kpi = screen.getByTestId("analytics-kpi-sessions");
    expect(kpi).toHaveTextContent("0");
    expect(kpi).toHaveTextContent("Sessions in this comparison");
    expect(kpi).toHaveTextContent(/no comparable sessions/i);
    expect(kpi).not.toHaveTextContent(/^10$|10 sessions/i);
    expect(screen.getByTestId("compare-empty-state")).toHaveTextContent(
      "Complete another interview to compare sessions.",
    );
    expect(screen.getByRole("button", { name: /Start mock interview/i })).toBeInTheDocument();
  });

  it("shows one-more-session empty copy when only one comparable exists", async () => {
    const user = userEvent.setup();
    useAnalytics.mockReturnValue(
      analyticsState({
        recent_sessions: [
          ...Array.from({ length: 9 }, (_, i) => sessionRow(`skip-${i}`, false)),
          sessionRow("only-one", true),
        ],
      }),
    );
    render(
      <MemoryRouter>
        <Analytics />
      </MemoryRouter>,
    );
    await user.click(screen.getByRole("tab", { name: "Compare" }));
    expect(screen.getByTestId("compare-empty-state")).toHaveTextContent(
      "Complete one more scored interview to unlock comparison.",
    );
    expect(screen.getByRole("button", { name: /Start mock interview/i })).toBeInTheDocument();
  });
});
