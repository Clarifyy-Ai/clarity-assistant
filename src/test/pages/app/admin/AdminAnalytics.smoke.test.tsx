import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const { adminAnalyticsDB } = vi.hoisted(() => ({
  adminAnalyticsDB: {
    countSessionsSince: vi.fn(),
    countSignupsSince: vi.fn(),
    getDauMauSeries: vi.fn(),
    countSignupsOnDay: vi.fn(),
    getPerfStats: vi.fn(),
    getModelCostLogsSince: vi.fn(),
    countMockTestsCreatedSince: vi.fn(),
    countMockTestsSubmittedSince: vi.fn(),
    getQuestionExamTypesSince: vi.fn(),
    getSupportThreadStats: vi.fn(),
  },
}));

vi.mock("@/lib/supabase/database", () => ({
  adminAnalyticsDB,
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

import AdminAnalytics from "@/pages/app/admin/AdminAnalytics";

describe("AdminAnalytics smoke", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    adminAnalyticsDB.countSessionsSince.mockResolvedValue(12);
    adminAnalyticsDB.countSignupsSince.mockResolvedValue(3);
    adminAnalyticsDB.getDauMauSeries.mockResolvedValue([{ dau: 5 }]);
    adminAnalyticsDB.countSignupsOnDay.mockResolvedValue(1);
    adminAnalyticsDB.getPerfStats.mockResolvedValue([]);
    adminAnalyticsDB.getModelCostLogsSince.mockResolvedValue([]);
    adminAnalyticsDB.countMockTestsCreatedSince.mockResolvedValue(0);
    adminAnalyticsDB.countMockTestsSubmittedSince.mockResolvedValue(0);
    adminAnalyticsDB.getQuestionExamTypesSince.mockResolvedValue([]);
    adminAnalyticsDB.getSupportThreadStats.mockResolvedValue({
      open: 0,
      resolved: 0,
      avgResolutionHours: 0,
    });
  });

  it("shows overview error empty with retry instead of skeleton on failure", async () => {
    adminAnalyticsDB.countSessionsSince.mockRejectedValueOnce(new Error("Overview DB down"));

    render(<AdminAnalytics />);

    await waitFor(() => {
      expect(screen.getByText("Overview DB down")).toBeInTheDocument();
    });
    expect(screen.getByText("Overview stats unavailable")).toBeInTheDocument();
    expect(screen.queryByText("Daily active users")).not.toBeInTheDocument();
    expect(screen.getAllByRole("button", { name: /retry/i }).length).toBeGreaterThanOrEqual(1);
  });

  it("shows mock tab empty state and support retry on failure", async () => {
    const user = userEvent.setup();
    render(<AdminAnalytics />);

    await user.click(screen.getByRole("tab", { name: /mock tests/i }));
    await waitFor(() => {
      expect(screen.getByText("No new questions in this period")).toBeInTheDocument();
    });

    adminAnalyticsDB.getSupportThreadStats.mockRejectedValueOnce(new Error("DB unavailable"));
    await user.click(screen.getByRole("tab", { name: /support/i }));

    await waitFor(() => {
      expect(screen.getByText("DB unavailable")).toBeInTheDocument();
    });
    expect(screen.getByText("Support stats unavailable")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /retry loading this section/i })).toBeInTheDocument();
  });

  it("retries mock tab load when error empty retry is clicked", async () => {
    const user = userEvent.setup();
    render(<AdminAnalytics />);

    adminAnalyticsDB.countMockTestsCreatedSince.mockRejectedValueOnce(new Error("Mock stats failed"));
    await user.click(screen.getByRole("tab", { name: /mock tests/i }));

    await waitFor(() => {
      expect(screen.getByText("Mock stats failed")).toBeInTheDocument();
    });
    expect(screen.getByText("Mock test stats unavailable")).toBeInTheDocument();

    adminAnalyticsDB.countMockTestsCreatedSince.mockResolvedValueOnce(2);
    adminAnalyticsDB.countMockTestsSubmittedSince.mockResolvedValueOnce(1);
    adminAnalyticsDB.getQuestionExamTypesSince.mockResolvedValueOnce(["upsc"]);

    await user.click(screen.getByRole("button", { name: /^retry$/i }));

    await waitFor(() => {
      expect(screen.getByText("Tests created")).toBeInTheDocument();
    });
    expect(screen.queryByText("Mock stats failed")).not.toBeInTheDocument();
  });
});
