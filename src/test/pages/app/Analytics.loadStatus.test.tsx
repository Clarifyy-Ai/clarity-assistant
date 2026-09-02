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

function baseMock(overrides: Record<string, unknown> = {}) {
  return {
    data: null,
    isLoading: false,
    error: null,
    isStale: false,
    loadStatus: "empty",
    filter: { period: "30d", session_filter: "all", interview_type: "all" },
    filtersActive: false,
    comparison: null,
    displayTimeZone: "UTC",
    sessionsScored: 0,
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
    avgScore30d: null,
    scoreDelta: null,
    sessionsThisWeek: 0,
    sessionsInSelectedPeriod: 0,
    avgWpm: null,
    avgFillers: null,
    fillerDelta: null,
    wpmDelta: null,
    avgConfidence: null,
    scoreTrend: [],
    scoreTrendSource: "sessions" as const,
    dimensionAverages: undefined,
    categoryScores: [],
    fillerBreakdown: {},
    activityByDay: {},
    summary: null,
    ...overrides,
  };
}

describe("Analytics load status — BUG-029 / TC-AN-001", () => {
  beforeEach(() => {
    useAnalytics.mockReset();
  });

  it("shows intentional empty state for accounts with no sessions", () => {
    useAnalytics.mockReturnValue(
      baseMock({
        loadStatus: "empty",
        data: { total_sessions: 0, recent_sessions: [] },
      }),
    );

    render(
      <MemoryRouter>
        <Analytics />
      </MemoryRouter>,
    );

    expect(screen.getByText("No completed sessions yet.")).toBeInTheDocument();
    expect(screen.queryByText(/couldn't load your analytics/i)).not.toBeInTheDocument();
  });

  it("shows retryable error only on backend failure", () => {
    useAnalytics.mockReturnValue(
      baseMock({
        loadStatus: "error",
        error: "We couldn't load your analytics.",
        data: null,
      }),
    );

    render(
      <MemoryRouter>
        <Analytics />
      </MemoryRouter>,
    );

    expect(screen.getByText(/couldn't load your analytics/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /retry/i })).toBeInTheDocument();
    expect(screen.queryByText("No completed sessions yet.")).not.toBeInTheDocument();
  });

  it("shows unscored-session messaging when KPI has sessions but no scores", async () => {
    useAnalytics.mockReturnValue(
      baseMock({
        loadStatus: "ready",
        data: {
          total_sessions: 10,
          recent_sessions: Array.from({ length: 10 }, (_, i) => ({
            session_id: `s-${i}`,
            date: "2026-08-20T10:00:00.000Z",
            mode: "mock",
            company: null,
            overall_score: null,
            score_status: "not_scored",
            filler_rate: null,
            wpm_avg: null,
            duration_minutes: 10,
            question_count: 3,
          })),
        },
        sessionsInSelectedPeriod: 10,
        sessionsScored: 0,
        scoreTrend: Array.from({ length: 10 }, (_, i) => ({
          date: `2026-08-${String(i + 1).padStart(2, "0")}T10:00:00.000Z`,
          score: null,
        })),
      }),
    );

    render(
      <MemoryRouter>
        <Analytics />
      </MemoryRouter>,
    );

    expect(screen.getByTestId("analytics-kpi-sessions")).toHaveTextContent("10");
    expect(screen.getByText(/10 sessions in this period/i)).toBeInTheDocument();
    expect(screen.getByText(/score trends appear once sessions are analyzed/i)).toBeInTheDocument();
  });

  it("shows filter empty state when only period filter yields zero sessions", () => {
    useAnalytics.mockReturnValue(
      baseMock({
        loadStatus: "empty",
        filtersActive: true,
        filter: { period: "7d", session_filter: "all", interview_type: "all" },
        data: { total_sessions: 0, recent_sessions: [] },
      }),
    );

    render(
      <MemoryRouter>
        <Analytics />
      </MemoryRouter>,
    );

    expect(screen.getByText("No sessions match these filters.")).toBeInTheDocument();
    expect(screen.getByTestId("analytics-filter-period")).toBeInTheDocument();
    expect(screen.queryByText("No completed sessions yet.")).not.toBeInTheDocument();
  });

  it("shows filter empty state (not error) when filters yield zero sessions", () => {
    useAnalytics.mockReturnValue(
      baseMock({
        loadStatus: "empty",
        filtersActive: true,
        filter: { period: "30d", session_filter: "mock", interview_type: "technical" },
        data: { total_sessions: 0, recent_sessions: [] },
      }),
    );

    render(
      <MemoryRouter>
        <Analytics />
      </MemoryRouter>,
    );

    expect(screen.getByText("No sessions match these filters.")).toBeInTheDocument();
    expect(screen.getByTestId("analytics-filter-session")).toBeInTheDocument();
    expect(screen.getByTestId("analytics-filter-interview-type")).toBeInTheDocument();
    expect(screen.queryByText(/couldn't load your analytics/i)).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /retry/i })).not.toBeInTheDocument();
    expect(screen.queryByText("No completed sessions yet.")).not.toBeInTheDocument();
  });

  it("distinguishes filter-empty success from HTTP 500 failure", () => {
    useAnalytics.mockReturnValue(
      baseMock({
        loadStatus: "error",
        error: "We couldn't load your analytics.",
        filtersActive: true,
        filter: { period: "30d", session_filter: "live", interview_type: "all" },
        data: null,
      }),
    );

    render(
      <MemoryRouter>
        <Analytics />
      </MemoryRouter>,
    );

    expect(screen.getByText(/couldn't load your analytics/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /retry/i })).toBeInTheDocument();
    expect(screen.queryByText("No sessions match these filters.")).not.toBeInTheDocument();
  });

  it("hides filler breakdown when counts are unknown", async () => {
    const user = userEvent.setup();
    useAnalytics.mockReturnValue(
      baseMock({
        loadStatus: "ready",
        data: {
          total_sessions: 2,
          recent_sessions: [
            {
              session_id: "s-1",
              date: "2026-08-20T10:00:00.000Z",
              mode: "mock",
              company: null,
              overall_score: 70,
              filler_rate: 2,
              wpm_avg: 120,
              duration_minutes: 10,
              question_count: 3,
            },
          ],
        },
        sessionsInSelectedPeriod: 2,
        sessionsScored: 1,
        scoreTrend: [{ date: "2026-08-20T10:00:00.000Z", score: 70 }],
        fillerBreakdown: {},
        avgWpm: 120,
        avgFillers: 2,
        avgConfidence: 70,
      }),
    );

    render(
      <MemoryRouter>
        <Analytics />
      </MemoryRouter>,
    );

    await user.click(screen.getByRole("tab", { name: /speech metrics/i }));
    expect(screen.queryByText("Filler word breakdown")).not.toBeInTheDocument();
  });

  it("speech tab avg confidence uses dimension_averages.confidence not overall score", async () => {
    const user = userEvent.setup();
    useAnalytics.mockReturnValue(
      baseMock({
        loadStatus: "ready",
        data: {
          total_sessions: 1,
          recent_sessions: [
            {
              session_id: "s-1",
              date: "2026-08-20T10:00:00.000Z",
              mode: "mock",
              company: null,
              overall_score: 82,
              filler_rate: 2,
              wpm_avg: 120,
              duration_minutes: 10,
              question_count: 3,
            },
          ],
        },
        avgScore30d: 82,
        sessionsInSelectedPeriod: 1,
        sessionsScored: 1,
        scoreTrend: [{ date: "2026-08-20T10:00:00.000Z", score: 82 }],
        dimensionAverages: {
          communication: 70,
          technical: 68,
          problem_solving: 72,
          confidence: 65,
        },
        avgConfidence: 65,
        avgWpm: 120,
        avgFillers: 2,
      }),
    );

    render(
      <MemoryRouter>
        <Analytics />
      </MemoryRouter>,
    );

    await user.click(screen.getByRole("tab", { name: /speech metrics/i }));
    expect(screen.getByText("65%")).toBeInTheDocument();
    expect(screen.queryByText("82%")).not.toBeInTheDocument();
    expect(screen.getByText("Avg confidence")).toBeInTheDocument();
  });
});
