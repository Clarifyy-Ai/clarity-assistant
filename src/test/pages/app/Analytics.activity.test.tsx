/**
 * @vitest-environment jsdom
 */
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

import Analytics from "@/pages/app/Analytics";

function baseMock(overrides: Record<string, unknown> = {}) {
  return {
    data: {
      total_sessions: 2,
      recent_sessions: [
        {
          session_id: "s1",
          date: "2026-09-01T10:00:00.000Z",
          mode: "mock",
          interview_type: "behavioural",
          company: "Acme",
          overall_score: 80,
          score_status: "scored",
          filler_rate: 1,
          wpm_avg: 120,
          duration_minutes: 20,
          question_count: 5,
          answered_count: 5,
        },
      ],
    },
    isLoading: false,
    error: null,
    isStale: false,
    loadStatus: "ready",
    filter: { period: "30d", session_filter: "all", interview_type: "all" },
    filtersActive: false,
    comparison: null,
    displayTimeZone: "UTC",
    sessionsScored: 1,
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
    avgScore30d: 80,
    scoreDelta: null,
    sessionsThisWeek: 1,
    sessionsInSelectedPeriod: 1,
    avgWpm: 120,
    avgFillers: 1,
    fillerDelta: null,
    wpmDelta: null,
    avgConfidence: null,
    scoreTrend: [{ date: "2026-09-01T10:00:00.000Z", score: 80 }],
    scoreTrendSource: "scorecards" as const,
    dimensionAverages: undefined,
    categoryScores: [],
    fillerBreakdown: {},
    activityByDay: {},
    summary: null,
    ...overrides,
  };
}

describe("Analytics Activity tab — BUG 20", () => {
  beforeEach(() => {
    useAnalytics.mockReset();
  });

  it("shows a true empty state when activityByDay has no sessions", async () => {
    const user = userEvent.setup();
    useAnalytics.mockReturnValue(baseMock({ activityByDay: {} }));

    render(
      <MemoryRouter>
        <Analytics />
      </MemoryRouter>,
    );

    await user.click(screen.getByRole("tab", { name: /^Activity$/i }));
    expect(screen.getByTestId("activity-heatmap-empty")).toBeInTheDocument();
    expect(screen.getByText(/No practice activity in this period/i)).toBeInTheDocument();
    expect(screen.queryByTestId("activity-heatmap")).not.toBeInTheDocument();
  });

  it("renders the heatmap when activityByDay has counts", async () => {
    const user = userEvent.setup();
    const today = new Date().toISOString().slice(0, 10);
    useAnalytics.mockReturnValue(
      baseMock({
        activityByDay: { [today]: 2 },
      }),
    );

    render(
      <MemoryRouter>
        <Analytics />
      </MemoryRouter>,
    );

    await user.click(screen.getByRole("tab", { name: /^Activity$/i }));
    expect(screen.getByTestId("activity-heatmap")).toBeInTheDocument();
    expect(screen.queryByTestId("activity-heatmap-empty")).not.toBeInTheDocument();
  });

  it("renders CSS score bars without Recharts when switching from Score trends", async () => {
    const user = userEvent.setup();
    useAnalytics.mockReturnValue(baseMock());

    render(
      <MemoryRouter>
        <Analytics />
      </MemoryRouter>,
    );

    expect(screen.getByTestId("score-trend-bars")).toBeInTheDocument();
    expect(screen.getByTestId("score-trend-chart")).toBeInTheDocument();

    await user.click(screen.getByRole("tab", { name: /^Activity$/i }));
    expect(screen.getByTestId("activity-heatmap-empty")).toBeInTheDocument();
    // Page must remain mounted (no ErrorBoundary blank of whole Analytics)
    expect(screen.getByRole("tab", { name: /^Activity$/i })).toBeInTheDocument();
  });
});
