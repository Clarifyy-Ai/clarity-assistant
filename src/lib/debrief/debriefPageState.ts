/**
 * Explicit Debrief page state machine — never infer from an empty array alone.
 */

import {
  classifyRequestError,
  isAbortLikeError,
} from "@/lib/focusRecovery/retryClassification";

function messageOf(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (typeof error === "string") return error;
  if (error && typeof error === "object" && "message" in error) {
    const msg = (error as { message?: unknown }).message;
    if (typeof msg === "string") return msg;
  }
  return "";
}

export function debriefFetchErrorMessage(error: unknown): string {
  const classified = classifyRequestError(error);
  if (classified.kind === "authentication") {
    return "Your session expired. Please sign in again.";
  }
  if (
    classified.kind === "network" ||
    classified.kind === "infrastructure" ||
    isAbortLikeError(error) ||
    /abort|timeout|timed out|failed to fetch|network|offline/i.test(messageOf(error))
  ) {
    return "Your connection is slow or unstable. Tap Retry — loading can take up to a minute on weak networks.";
  }
  const raw = messageOf(error).trim();
  if (raw) return raw;
  return DEBRIEF_EMPTY_COPY.temporaryFailureDescription;
}

export type DebriefPageState =
  | "initializing"
  | "loading"
  | "available"
  | "processing"
  | "no_eligible_session"
  | "plan_restricted"
  | "temporary_failure"
  | "retrying";

export type DebriefAccessReasonCode =
  | "FEATURE_NOT_AVAILABLE_FOR_PLAN"
  | "SUBSCRIPTION_PAST_DUE"
  | "ACCOUNT_RESTRICTED"
  | "NO_COMPLETED_SESSIONS"
  | "NO_ELIGIBLE_SESSIONS"
  | "DEBRIEF_PROCESSING"
  | "TEMPORARY_BACKEND_FAILURE"
  | null;

export type DebriefListAccess = {
  canViewDebrief: boolean;
  canGenerateDebrief: boolean;
  canRetryDebrief: boolean;
  plan: string;
  reasonCode: DebriefAccessReasonCode;
};

export type DebriefSessionEligibility = {
  totalCompletedSessions: number;
  eligibleSessions: number;
  ineligibleSessions: number;
};

export function resolveDebriefPageState(input: {
  userReady: boolean;
  loading: boolean;
  retrying?: boolean;
  planRestricted?: boolean;
  debriefFetchFailed: boolean;
  pendingFetchFailed: boolean;
  debriefCount: number;
  pendingCount: number;
  processingCount: number;
  failedCount?: number;
  eligibleSessions: number;
  totalCompletedSessions: number;
}): DebriefPageState {
  if (!input.userReady) return "initializing";
  if (input.retrying) return "retrying";
  if (input.loading) return "loading";
  if (input.planRestricted) return "plan_restricted";
  if (input.debriefFetchFailed) return "temporary_failure";
  // Both primary sources failed → failure; pending-only failure is a banner, not full page fail.
  if (
    input.pendingFetchFailed &&
    input.debriefCount === 0 &&
    input.processingCount === 0 &&
    !(input.failedCount ?? 0)
  ) {
    return "temporary_failure";
  }
  if (input.debriefCount > 0) return "available";
  if (input.processingCount > 0) return "processing";
  if (input.pendingCount > 0) return "processing"; // ready-to-generate counts as actionable work
  if ((input.failedCount ?? 0) > 0) return "available"; // show failed rows, not empty
  return "no_eligible_session";
}

export function buildDebriefListAccess(input: {
  planId: string;
  canView?: boolean;
  canGenerate?: boolean;
  planRestricted?: boolean;
  pageState: DebriefPageState;
}): DebriefListAccess {
  const canView = input.canView !== false && !input.planRestricted;
  const canGenerate = input.canGenerate !== false && canView;
  let reasonCode: DebriefAccessReasonCode = null;
  if (input.planRestricted) reasonCode = "FEATURE_NOT_AVAILABLE_FOR_PLAN";
  else if (input.pageState === "temporary_failure") reasonCode = "TEMPORARY_BACKEND_FAILURE";
  else if (input.pageState === "no_eligible_session") reasonCode = "NO_ELIGIBLE_SESSIONS";
  else if (input.pageState === "processing") reasonCode = "DEBRIEF_PROCESSING";

  return {
    canViewDebrief: canView,
    canGenerateDebrief: canGenerate,
    canRetryDebrief: canGenerate,
    plan: input.planId || "free",
    reasonCode,
  };
}

export const DEBRIEF_EMPTY_COPY = {
  noEligibleTitle: "No eligible sessions yet",
  noEligibleDescription:
    "A session is eligible when it is a completed mock, Practice Coach (rehearsal), or practice interview with at least one answer or transcript. Finish a session, then return here to generate a debrief.",
  temporaryFailureTitle: "We couldn’t load your Debriefs",
  temporaryFailureDescription:
    "Something went wrong loading your debrief list. Retry, or open Session History.",
  planRestrictedTitle: "Debriefs are not included in your current plan",
  noMatchingTitle: "No matching debriefs",
} as const;
