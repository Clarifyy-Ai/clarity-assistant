import { beforeEach, describe, expect, it, vi } from "vitest";
import { ApiClientError } from "@/lib/api/apiClient";

const fetchEdgeJson = vi.fn();
const listSummariesByUserId = vi.fn();
const listDebriefPendingWithEligibility = vi.fn();
const listActiveDebriefJobsForUser = vi.fn();
const listRetryableFailedDebriefJobsForUser = vi.fn();

vi.mock("@/lib/network/fetchEdge", () => ({
  fetchEdgeJson: (...args: unknown[]) => fetchEdgeJson(...args),
}));

vi.mock("@/lib/supabase/database", () => ({
  sessionDebriefsDB: {
    listSummariesByUserId: (...args: unknown[]) => listSummariesByUserId(...args),
  },
  sessionsDB: {
    listDebriefPendingWithEligibility: (...args: unknown[]) =>
      listDebriefPendingWithEligibility(...args),
  },
}));

vi.mock("@/lib/debrief/debriefJob", () => ({
  listActiveDebriefJobsForUser: (...args: unknown[]) =>
    listActiveDebriefJobsForUser(...args),
  listRetryableFailedDebriefJobsForUser: (...args: unknown[]) =>
    listRetryableFailedDebriefJobsForUser(...args),
}));

import { loadDebriefListPage } from "@/lib/debrief/loadDebriefList";
import { resolveDebriefPageState } from "@/lib/debrief/debriefPageState";

describe("loadDebriefListPage (BUG-21)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    listSummariesByUserId.mockResolvedValue([]);
    listDebriefPendingWithEligibility.mockResolvedValue({
      pending: [],
      eligibility: {
        totalCompletedSessions: 0,
        eligibleSessions: 0,
        ineligibleSessions: 0,
      },
    });
    listActiveDebriefJobsForUser.mockResolvedValue([]);
    listRetryableFailedDebriefJobsForUser.mockResolvedValue([]);
  });

  it("Pro: maps Edge pending rehearsal into pendingSessions", async () => {
    fetchEdgeJson.mockResolvedValue({
      access: {
        canViewDebrief: true,
        canGenerateDebrief: true,
        canRetryDebrief: true,
        plan: "pro",
        reasonCode: null,
      },
      sessionEligibility: {
        totalCompletedSessions: 1,
        eligibleSessions: 1,
        ineligibleSessions: 0,
      },
      debriefs: [],
      processingJobs: [],
      failedJobs: [],
      pendingEligible: [
        {
          id: "r1",
          type: "rehearsal",
          title: "Practice Coach",
          overall_score: 78,
          created_at: "2026-09-03T10:00:00Z",
          hasTranscript: true,
          status: "completed",
        },
      ],
      correlationId: "c1",
    });

    const result = await loadDebriefListPage({ userId: "u1", planId: "pro" });
    expect(result.source).toBe("edge");
    expect(result.pendingSessions).toHaveLength(1);
    expect(result.pendingSessions[0]?.type).toBe("rehearsal");
    expect(
      resolveDebriefPageState({
        userReady: true,
        loading: false,
        debriefFetchFailed: false,
        pendingFetchFailed: false,
        debriefCount: 0,
        pendingCount: result.pendingSessions.length,
        processingCount: 0,
        failedCount: 0,
        eligibleSessions: 1,
        totalCompletedSessions: 1,
      }),
    ).toBe("processing");
  });

  it("Max: completed debriefs surface as available", async () => {
    fetchEdgeJson.mockResolvedValue({
      access: {
        canViewDebrief: true,
        canGenerateDebrief: true,
        canRetryDebrief: true,
        plan: "enterprise",
        reasonCode: null,
      },
      sessionEligibility: {
        totalCompletedSessions: 1,
        eligibleSessions: 1,
        ineligibleSessions: 0,
      },
      debriefs: [
        {
          id: "d1",
          created_at: "2026-08-30T10:25:00Z",
          overall_grade: "B+",
          priority_focus: "Structure",
          session_id: "s1",
        },
      ],
      processingJobs: [],
      failedJobs: [],
      pendingEligible: [],
    });

    const result = await loadDebriefListPage({ userId: "u1", planId: "enterprise" });
    expect(result.debriefs).toHaveLength(1);
    expect(
      resolveDebriefPageState({
        userReady: true,
        loading: false,
        debriefFetchFailed: false,
        pendingFetchFailed: false,
        debriefCount: result.debriefs.length,
        pendingCount: 0,
        processingCount: 0,
        failedCount: 0,
        eligibleSessions: 1,
        totalCompletedSessions: 1,
      }),
    ).toBe("available");
  });

  it("processing jobs map to processing page state", async () => {
    fetchEdgeJson.mockResolvedValue({
      access: {
        canViewDebrief: true,
        canGenerateDebrief: true,
        canRetryDebrief: true,
        plan: "pro",
        reasonCode: null,
      },
      sessionEligibility: {
        totalCompletedSessions: 1,
        eligibleSessions: 1,
        ineligibleSessions: 0,
      },
      debriefs: [],
      processingJobs: [
        {
          jobId: "j1",
          sessionId: "r1",
          status: "processing",
          updatedAt: "2026-09-03T11:00:00Z",
        },
      ],
      failedJobs: [],
      pendingEligible: [],
    });

    const result = await loadDebriefListPage({ userId: "u1", planId: "pro" });
    expect(result.processingJobs).toHaveLength(1);
    expect(
      resolveDebriefPageState({
        userReady: true,
        loading: false,
        debriefFetchFailed: false,
        pendingFetchFailed: false,
        debriefCount: 0,
        pendingCount: 0,
        processingCount: result.processingJobs.length,
        failedCount: 0,
        eligibleSessions: 1,
        totalCompletedSessions: 1,
      }),
    ).toBe("processing");
  });

  it("failed jobs map to available (not empty)", async () => {
    fetchEdgeJson.mockResolvedValue({
      access: {
        canViewDebrief: true,
        canGenerateDebrief: true,
        canRetryDebrief: true,
        plan: "pro",
        reasonCode: null,
      },
      sessionEligibility: {
        totalCompletedSessions: 1,
        eligibleSessions: 1,
        ineligibleSessions: 0,
      },
      debriefs: [],
      processingJobs: [],
      failedJobs: [
        {
          jobId: "jf1",
          sessionId: "r1",
          updatedAt: "2026-09-03T11:00:00Z",
          errorCode: "AI_TIMEOUT",
          errorMessage: "Timed out",
        },
      ],
      pendingEligible: [],
    });

    const result = await loadDebriefListPage({ userId: "u1", planId: "pro" });
    expect(result.failedJobs).toHaveLength(1);
    expect(
      resolveDebriefPageState({
        userReady: true,
        loading: false,
        debriefFetchFailed: false,
        pendingFetchFailed: false,
        debriefCount: 0,
        pendingCount: 0,
        processingCount: 0,
        failedCount: result.failedJobs.length,
        eligibleSessions: 1,
        totalCompletedSessions: 1,
      }),
    ).toBe("available");
  });

  it("no session → no_eligible_session", async () => {
    fetchEdgeJson.mockResolvedValue({
      access: {
        canViewDebrief: true,
        canGenerateDebrief: true,
        canRetryDebrief: true,
        plan: "pro",
        reasonCode: null,
      },
      sessionEligibility: {
        totalCompletedSessions: 0,
        eligibleSessions: 0,
        ineligibleSessions: 0,
      },
      debriefs: [],
      processingJobs: [],
      failedJobs: [],
      pendingEligible: [],
    });

    const result = await loadDebriefListPage({ userId: "u1", planId: "pro" });
    expect(
      resolveDebriefPageState({
        userReady: true,
        loading: false,
        debriefFetchFailed: false,
        pendingFetchFailed: false,
        debriefCount: result.debriefs.length,
        pendingCount: result.pendingSessions.length,
        processingCount: result.processingJobs.length,
        failedCount: result.failedJobs.length,
        eligibleSessions: 0,
        totalCompletedSessions: 0,
      }),
    ).toBe("no_eligible_session");
  });

  it("plan restriction denies view", async () => {
    fetchEdgeJson.mockRejectedValue(
      new ApiClientError({
        message: "Not available",
        status: 403,
        code: "FEATURE_NOT_AVAILABLE_FOR_PLAN",
      }),
    );

    const result = await loadDebriefListPage({ userId: "u1", planId: "free" });
    expect(result.access.canViewDebrief).toBe(false);
    expect(result.access.reasonCode).toBe("FEATURE_NOT_AVAILABLE_FOR_PLAN");
    expect(result.failedJobs).toEqual([]);
  });

  it("edge access payload can deny view without throwing", async () => {
    fetchEdgeJson.mockResolvedValue({
      access: {
        canViewDebrief: false,
        canGenerateDebrief: false,
        canRetryDebrief: false,
        plan: "free",
        reasonCode: "FEATURE_NOT_AVAILABLE_FOR_PLAN",
      },
      sessionEligibility: {
        totalCompletedSessions: 0,
        eligibleSessions: 0,
        ineligibleSessions: 0,
      },
      debriefs: [],
      processingJobs: [],
      failedJobs: [],
      pendingEligible: [],
    });

    const result = await loadDebriefListPage({ userId: "u1", planId: "free" });
    expect(result.access.canViewDebrief).toBe(false);
  });

  it("client fallback loads failed jobs when Edge unreachable", async () => {
    fetchEdgeJson.mockRejectedValue(new Error("network"));
    listRetryableFailedDebriefJobsForUser.mockResolvedValue([
      {
        jobId: "jf1",
        sessionId: "r1",
        errorCode: "AI_TIMEOUT",
        errorMessage: "Timed out",
        updatedAt: "2026-09-03T11:00:00Z",
      },
    ]);
    listDebriefPendingWithEligibility.mockResolvedValue({
      pending: [
        {
          id: "r1",
          type: "rehearsal",
          title: "Practice Coach",
          overall_score: 70,
          created_at: "2026-09-03T10:00:00Z",
          hasTranscript: true,
          status: "completed",
        },
      ],
      eligibility: {
        totalCompletedSessions: 1,
        eligibleSessions: 1,
        ineligibleSessions: 0,
      },
    });

    const result = await loadDebriefListPage({ userId: "u1", planId: "pro" });
    expect(result.source).toBe("client");
    expect(result.failedJobs).toHaveLength(1);
    expect(result.pendingSessions[0]?.type).toBe("rehearsal");
  });
});
