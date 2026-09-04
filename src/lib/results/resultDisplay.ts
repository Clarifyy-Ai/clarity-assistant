/**
 * Honest result display — missing evidence must never become a believable 0.
 * A genuine zero is only shown when `hasEvidence` is true and the value is 0.
 */

import { scorecardEligibilityMessage } from "@/lib/scorecard/eligibility";

export const RESULT_UNAVAILABLE = "Not available";
export const RESULT_NOT_EVALUATED = "Not evaluated";
export const RESULT_INSUFFICIENT = "Insufficient evidence";

/** Numeric score for display when evidence exists; otherwise unavailable label. */
export function formatNullableNumber(
  value: number | null | undefined,
  options?: {
    hasEvidence?: boolean;
    unavailableLabel?: string;
    digits?: number;
    suffix?: string;
  },
): string {
  const hasEvidence = options?.hasEvidence !== false;
  const label = options?.unavailableLabel ?? RESULT_UNAVAILABLE;
  if (!hasEvidence) return label;
  if (typeof value !== "number" || !Number.isFinite(value)) return label;
  const digits = options?.digits ?? 0;
  const formatted =
    digits > 0 ? value.toFixed(digits) : String(Math.round(value));
  return `${formatted}${options?.suffix ?? ""}`;
}

export function formatPercentOrUnavailable(
  value: number | null | undefined,
  hasEvidence = true,
): string {
  return formatNullableNumber(value, {
    hasEvidence,
    suffix: "%",
    unavailableLabel: RESULT_UNAVAILABLE,
  });
}

export function formatMarksOrUnavailable(
  total: number | null | undefined,
  max: number | null | undefined,
  hasEvidence = true,
): string {
  if (!hasEvidence) return RESULT_UNAVAILABLE;
  if (typeof total !== "number" || !Number.isFinite(total)) return RESULT_UNAVAILABLE;
  if (typeof max === "number" && Number.isFinite(max) && max > 0) {
    return `${Math.round(total)}/${Math.round(max)}`;
  }
  return String(Math.round(total));
}

/**
 * Coerce only when evidence proves a numeric result.
 * Missing → null (UI must show unavailable, not 0).
 */
export function finiteOrNull(value: unknown): number | null {
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

/** Match score from gap analysis — never `|| 0` for missing. */
export function formatMatchScore(value: unknown): string {
  if (value == null || value === "") return RESULT_UNAVAILABLE;
  const n = finiteOrNull(value);
  if (n == null) return RESULT_UNAVAILABLE;
  return `${Math.round(n)}%`;
}

export function unscoredReasonLabel(input: {
  evaluationStatus?: string | null;
  eligibilityReason?: string | null;
  fallback?: string;
}): string {
  const reason = String(input.eligibilityReason ?? "").trim();
  if (reason) {
    return scorecardEligibilityMessage(reason, reason);
  }
  const status = String(input.evaluationStatus ?? "").toLowerCase().trim();
  if (status === "processing" || status === "pending" || status === "queued") {
    return "Scorecard is still processing";
  }
  if (status === "failed" || status === "failed_retryable" || status === "failed_permanent") {
    return "Evaluation failed";
  }
  if (status === "not_eligible" || status === "not_scored" || status === "excluded") {
    return "Not eligible for scoring";
  }
  return input.fallback ?? RESULT_NOT_EVALUATED;
}
