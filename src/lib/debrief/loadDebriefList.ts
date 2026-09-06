/**
 * Client loader for Debrief list — prefers Edge list-session-debriefs, falls back to PostgREST.
 */
import { ApiClientError } from "@/lib/api/apiClient";
import { fetchEdgeJson } from "@/lib/network/fetchEdge";
import {
  sessionDebriefsDB,
  sessionsDB,
} from "@/lib/supabase/database";
import {
  listActiveDebriefJobsForUser,
  listRetryableFailedDebriefJobsForUser,
  type SessionDebriefJob,
} from "@/lib/debrief/debriefJob";
import type {
  DebriefListDebrief,
  DebriefListFailedJob,
  DebriefListProcessingJob,
  DebriefListSession,
} from "@/lib/debrief/debriefList";
import type {
  DebriefListAccess,
  DebriefSessionEligibility,
} from "@/lib/debrief/debriefPageState";

const LIST_TIMEOUT_MS = 45_000;
const LIST_RETRY_TIMEOUT_MS = 60_000;

async function fetchDebriefListFromEdge(): Promise<EdgeListPayload> {
  try {
    return await fetchEdgeJson<EdgeListPayload>("list-session-debriefs", {}, {
      timeoutMs: LIST_TIMEOUT_MS,
    });
  } catch (firstErr) {
    if (
      firstErr instanceof ApiClientError &&
      (firstErr.code === "FEATURE_NOT_AVAILABLE_FOR_PLAN" ||
        firstErr.code === "CAPABILITY_REQUIRED")
    ) {
      throw firstErr;
    }
    return await fetchEdgeJson<EdgeListPayload>("list-session-debriefs", {}, {
      timeoutMs: LIST_RETRY_TIMEOUT_MS,
    });
  }
}

export type DebriefListLoadResult = {
  source: "edge" | "client";
  access: DebriefListAccess;
  sessionEligibility: DebriefSessionEligibility;
  debriefs: DebriefListDebrief[];
  pendingSessions: DebriefListSession[];
  processingJobs: DebriefListProcessingJob[];
  failedJobs: DebriefListFailedJob[];
  pendingWarning: string | null;
  correlationId?: string | null;
};

type EdgeListPayload = {
  correlationId?: string;
  access?: DebriefListAccess;
  sessionEligibility?: DebriefSessionEligibility;
  debriefs?: DebriefListDebrief[];
  processingJobs?: DebriefListProcessingJob[];
  failedJobs?: DebriefListFailedJob[];
  pendingEligible?: DebriefListSession[];
  code?: string;
  message?: string;
};

function defaultAccess(planId: string): DebriefListAccess {
  return {
    canViewDebrief: true,
    canGenerateDebrief: true,
    canRetryDebrief: true,
    plan: planId || "free",
    reasonCode: null,
  };
}

export async function loadDebriefListPage(input: {
  userId: string;
  planId: string;
}): Promise<DebriefListLoadResult> {
  try {
    const edge = await fetchDebriefListFromEdge();
    if (edge?.access) {
      return {
        source: "edge",
        access: edge.access,
        sessionEligibility: edge.sessionEligibility ?? {
          totalCompletedSessions: 0,
          eligibleSessions: 0,
          ineligibleSessions: 0,
        },
        debriefs: edge.debriefs ?? [],
        pendingSessions: edge.pendingEligible ?? [],
        processingJobs: edge.processingJobs ?? [],
        failedJobs: edge.failedJobs ?? [],
        pendingWarning: null,
        correlationId: edge.correlationId ?? null,
      };
    }
  } catch (err) {
    // Prefer client fallback unless this is an explicit plan denial.
    if (
      err instanceof ApiClientError &&
      (err.code === "FEATURE_NOT_AVAILABLE_FOR_PLAN" ||
        err.code === "CAPABILITY_REQUIRED")
    ) {
      return {
        source: "edge",
        access: {
          ...defaultAccess(input.planId),
          canViewDebrief: false,
          canGenerateDebrief: false,
          canRetryDebrief: false,
          reasonCode: "FEATURE_NOT_AVAILABLE_FOR_PLAN",
        },
        sessionEligibility: {
          totalCompletedSessions: 0,
          eligibleSessions: 0,
          ineligibleSessions: 0,
        },
        debriefs: [],
        pendingSessions: [],
        processingJobs: [],
        failedJobs: [],
        pendingWarning: null,
      };
    }
    // Fall through to client path.
  }

  let pendingWarning: string | null = null;
  let pendingSessions: DebriefListSession[] = [];
  let eligibility: DebriefSessionEligibility = {
    totalCompletedSessions: 0,
    eligibleSessions: 0,
    ineligibleSessions: 0,
  };

  const debriefs = await sessionDebriefsDB.listSummariesByUserId(input.userId);

  try {
    const pendingResult = await sessionsDB.listDebriefPendingWithEligibility(
      input.userId,
    );
    pendingSessions = pendingResult.pending;
    eligibility = pendingResult.eligibility;
  } catch (err) {
    pendingWarning =
      err instanceof Error
        ? err.message
        : "Could not load sessions ready for debrief.";
  }

  let processingJobs: DebriefListProcessingJob[] = [];
  try {
    processingJobs = await listActiveDebriefJobsForUser(input.userId);
  } catch {
    // Non-fatal — list still works without processing badges.
  }

  let failedJobs: DebriefListFailedJob[] = [];
  try {
    const failed = await listRetryableFailedDebriefJobsForUser(input.userId);
    failedJobs = failed.map((j) => ({
      jobId: j.jobId,
      sessionId: j.sessionId,
      updatedAt: j.updatedAt,
      errorCode: j.errorCode,
      errorMessage: j.errorMessage,
    }));
  } catch {
    // Non-fatal — list still works without failed-job rows.
  }

  return {
    source: "client",
    access: defaultAccess(input.planId),
    sessionEligibility: eligibility,
    debriefs,
    pendingSessions,
    processingJobs,
    failedJobs,
    pendingWarning,
  };
}

/** @deprecated typing helper for callers that still expect SessionDebriefJob */
export type { SessionDebriefJob };
