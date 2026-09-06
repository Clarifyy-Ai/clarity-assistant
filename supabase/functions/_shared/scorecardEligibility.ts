/**
 * Typed scorecard eligibility — keep in sync with src/lib/scorecard/eligibility.ts.
 */

export type ScorecardEligibilityCode =
  | "SCORECARD_ELIGIBLE"
  | "NOT_ELIGIBLE_NO_ANSWERS"
  | "NOT_ELIGIBLE_INCOMPLETE_SESSION"
  | "EVALUATION_FAILED"
  | "EVALUATION_PROCESSING"
  | "FEATURE_NOT_AVAILABLE_FOR_PLAN"
  | "INSUFFICIENT_CREDITS";

export type ScorecardEvaluationStatus =
  | "not_requested"
  | "not_eligible"
  | "queued"
  | "processing"
  | "completed"
  | "failed_retryable"
  | "failed_permanent";

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

export function scorecardEligibilityMessage(
  code: ScorecardEligibilityCode,
): string {
  return SCORECARD_ELIGIBILITY_MESSAGES[code];
}

/** Minimum substantive answer length before scorecard charge (junk/idk excluded). */
const MIN_SCORABLE_ANSWER_CHARS = 10;

const JUNK_ANSWER_PATTERN =
  /^(idk|i dont know|i do not know|dont know|do not know|no idea|not sure|n a|na|none|skip|pass|no comment)$/;

/** True when answer text is empty, skipped, or too short/non-substantive to score. */
export function isNonScorableAnswer(answer: unknown): boolean {
  const text = String(answer ?? "")
    .replace(/\s+/g, " ")
    .trim();
  if (!text || text === "(skipped)") return true;
  const normalized = text
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, "")
    .replace(/\s+/g, " ")
    .trim();
  return normalized.length < MIN_SCORABLE_ANSWER_CHARS ||
    JUNK_ANSWER_PATTERN.test(normalized);
}

/** Count answers that are non-empty and substantive enough to charge/score. */
export function countScorableAnswers(
  rows: Array<{ answer?: unknown }>,
): number {
  return rows.filter((row) => !isNonScorableAnswer(row.answer)).length;
}

export function resolveScorecardEligibility(input: {
  sessionCompleted: boolean;
  scorableAnswerCount: number;
  planAllowed?: boolean;
  evaluationStatus?: string | null;
  overallScore?: number | null;
}): { code: ScorecardEligibilityCode; eligible: boolean; message: string } {
  if (input.planAllowed === false) {
    return {
      code: "FEATURE_NOT_AVAILABLE_FOR_PLAN",
      eligible: false,
      message: SCORECARD_ELIGIBILITY_MESSAGES.FEATURE_NOT_AVAILABLE_FOR_PLAN,
    };
  }

  const raw = String(input.evaluationStatus ?? "").toLowerCase().trim();
  if (raw === "queued" || raw === "processing") {
    return {
      code: "EVALUATION_PROCESSING",
      eligible: false,
      message: SCORECARD_ELIGIBILITY_MESSAGES.EVALUATION_PROCESSING,
    };
  }
  if (raw === "failed_retryable" || raw === "failed_permanent") {
    return {
      code: "EVALUATION_FAILED",
      eligible: false,
      message: SCORECARD_ELIGIBILITY_MESSAGES.EVALUATION_FAILED,
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

export function httpStatusForScorecardEligibility(
  code: ScorecardEligibilityCode,
): number {
  switch (code) {
    case "FEATURE_NOT_AVAILABLE_FOR_PLAN":
      return 403;
    case "EVALUATION_PROCESSING":
      return 202;
    case "SCORECARD_ELIGIBLE":
      return 200;
    case "NOT_ELIGIBLE_NO_ANSWERS":
    case "NOT_ELIGIBLE_INCOMPLETE_SESSION":
    case "EVALUATION_FAILED":
    default:
      return 422;
  }
}
