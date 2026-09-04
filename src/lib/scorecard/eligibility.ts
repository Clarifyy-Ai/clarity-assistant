/**
 * Typed scorecard eligibility — shared by UI, hooks, and contract tests.
 * Edge mirrors these codes in supabase/functions/_shared/scorecardEligibility.ts.
 */

export const SCORECARD_ELIGIBILITY_CODES = [
  "SCORECARD_ELIGIBLE",
  "NOT_ELIGIBLE_NO_ANSWERS",
  "NOT_ELIGIBLE_INCOMPLETE_SESSION",
  "EVALUATION_FAILED",
  "EVALUATION_PROCESSING",
  "FEATURE_NOT_AVAILABLE_FOR_PLAN",
  "INSUFFICIENT_CREDITS",
] as const;

export type ScorecardEligibilityCode = (typeof SCORECARD_ELIGIBILITY_CODES)[number];

/** Durable DB evaluation_status values (Phase 3). */
export const SCORECARD_EVALUATION_STATUSES = [
  "not_requested",
  "not_eligible",
  "queued",
  "processing",
  "completed",
  "failed_retryable",
  "failed_permanent",
] as const;

export type ScorecardEvaluationStatus = (typeof SCORECARD_EVALUATION_STATUSES)[number];

export const SCORECARD_ELIGIBILITY_MESSAGES: Record<ScorecardEligibilityCode, string> = {
  SCORECARD_ELIGIBLE: "This session can be scored.",
  NOT_ELIGIBLE_NO_ANSWERS:
    "No answers were recorded for this session, so a scorecard cannot be generated. Re-run the session and answer at least one question.",
  NOT_ELIGIBLE_INCOMPLETE_SESSION:
    "A scorecard can only be generated for a completed session.",
  EVALUATION_FAILED:
    "Scorecard evaluation failed. Retry when you are ready — scores are not invented in the browser.",
  EVALUATION_PROCESSING:
    "Scorecard evaluation is still processing. This page will refresh when it finishes.",
  FEATURE_NOT_AVAILABLE_FOR_PLAN:
    "Scorecards are not available on your current plan.",
  INSUFFICIENT_CREDITS:
    "Not enough credits to generate a scorecard. Buy credits to continue — this is not the same as having no sessions.",
};

export type ScorecardEligibilityResult = {
  code: ScorecardEligibilityCode;
  eligible: boolean;
  message: string;
};

export function isScorecardEligibilityCode(value: unknown): value is ScorecardEligibilityCode {
  return (
    typeof value === "string" &&
    (SCORECARD_ELIGIBILITY_CODES as readonly string[]).includes(value)
  );
}

export function scorecardEligibilityMessage(
  code: ScorecardEligibilityCode | string | null | undefined,
  fallback?: string | null,
): string {
  if (isScorecardEligibilityCode(code)) {
    return SCORECARD_ELIGIBILITY_MESSAGES[code];
  }
  const trimmed = typeof fallback === "string" ? fallback.trim() : "";
  return trimmed || SCORECARD_ELIGIBILITY_MESSAGES.NOT_ELIGIBLE_NO_ANSWERS;
}

/** Map durable evaluation_status (+ optional overall) into an eligibility code. */
export function eligibilityFromEvaluationStatus(
  evaluationStatus: string | null | undefined,
  overallScore?: number | null,
): ScorecardEligibilityCode | null {
  const raw = String(evaluationStatus ?? "").toLowerCase().trim();
  if (!raw) return null;
  if (raw === "queued" || raw === "processing") return "EVALUATION_PROCESSING";
  if (raw === "failed_retryable" || raw === "failed_permanent") return "EVALUATION_FAILED";
  if (raw === "not_eligible") return "NOT_ELIGIBLE_NO_ANSWERS";
  if (raw === "completed" && typeof overallScore === "number" && Number.isFinite(overallScore)) {
    return "SCORECARD_ELIGIBLE";
  }
  if (raw === "completed") return "EVALUATION_FAILED";
  if (raw === "not_requested") return null;
  return null;
}

/**
 * Resolve whether a session may be scored (or why it is blocked / in-flight).
 * Plan gate is optional so client-side checks can omit it when unknown.
 */
export function resolveScorecardEligibility(input: {
  sessionCompleted: boolean;
  scorableAnswerCount: number;
  planAllowed?: boolean;
  evaluationStatus?: string | null;
  overallScore?: number | null;
}): ScorecardEligibilityResult {
  if (input.planAllowed === false) {
    return {
      code: "FEATURE_NOT_AVAILABLE_FOR_PLAN",
      eligible: false,
      message: SCORECARD_ELIGIBILITY_MESSAGES.FEATURE_NOT_AVAILABLE_FOR_PLAN,
    };
  }

  const fromEval = eligibilityFromEvaluationStatus(
    input.evaluationStatus,
    input.overallScore,
  );
  if (fromEval === "EVALUATION_PROCESSING" || fromEval === "EVALUATION_FAILED") {
    return {
      code: fromEval,
      eligible: false,
      message: SCORECARD_ELIGIBILITY_MESSAGES[fromEval],
    };
  }

  if (!input.sessionCompleted) {
    return {
      code: "NOT_ELIGIBLE_INCOMPLETE_SESSION",
      eligible: false,
      message: SCORECARD_ELIGIBILITY_MESSAGES.NOT_ELIGIBLE_INCOMPLETE_SESSION,
    };
  }

  if (input.scorableAnswerCount <= 0) {
    return {
      code: "NOT_ELIGIBLE_NO_ANSWERS",
      eligible: false,
      message: SCORECARD_ELIGIBILITY_MESSAGES.NOT_ELIGIBLE_NO_ANSWERS,
    };
  }

  return {
    code: "SCORECARD_ELIGIBLE",
    eligible: true,
    message: SCORECARD_ELIGIBILITY_MESSAGES.SCORECARD_ELIGIBLE,
  };
}

/** Analytics / compare score_status buckets. */
export type AnalyticsScorecardStatus =
  | "scored"
  | "not_scored"
  | "pending"
  | "failed"
  | "excluded";

export function analyticsScoreStatusFromEvaluation(input: {
  evaluationStatus?: string | null;
  overallScore?: number | null;
  answeredCount?: number | null;
}): AnalyticsScorecardStatus {
  const raw = String(input.evaluationStatus ?? "").toLowerCase().trim();
  const hasScore =
    typeof input.overallScore === "number" && Number.isFinite(input.overallScore);

  if (raw === "queued" || raw === "processing") return "pending";
  if (raw === "failed_retryable" || raw === "failed_permanent") return "failed";
  if (raw === "completed" && hasScore) return "scored";
  if (raw === "completed" && !hasScore) return "failed";
  if (raw === "not_eligible") return "excluded";
  if (hasScore) return "scored";
  if (typeof input.answeredCount === "number" && input.answeredCount <= 0) {
    return "excluded";
  }
  return "not_scored";
}

/** HTTP status for Edge eligibility / evaluation error codes. */
export function httpStatusForScorecardEligibility(
  code: ScorecardEligibilityCode | string,
): number {
  switch (code) {
    case "FEATURE_NOT_AVAILABLE_FOR_PLAN":
      return 403;
    case "NOT_ELIGIBLE_NO_ANSWERS":
    case "NOT_ELIGIBLE_INCOMPLETE_SESSION":
      return 422;
    case "EVALUATION_PROCESSING":
      return 202;
    case "EVALUATION_FAILED":
      return 422;
    case "SCORECARD_ELIGIBLE":
      return 200;
    default:
      return 422;
  }
}
