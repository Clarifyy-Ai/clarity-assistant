export type ScorecardUiStatus =
  | "loading"
  | "pending"
  | "not_scored"
  | "failed"
  | "scored";

/** Durable analytics / compare statuses (edge + client). */
export type AnalyticsScoreStatusLike =
  | "scored"
  | "not_scored"
  | "pending"
  | "failed"
  | "excluded"
  | "processing"
  | "not_eligible"
  | string
  | null
  | undefined;

/**
 * Canonical job-facing labels for scorecard / debrief / analytics.
 * Never coerce a failed or ineligible row into a numeric 0.
 */
export function formatSessionScore(
  score: number | null | undefined,
  status?: AnalyticsScoreStatusLike,
): string {
  const normalized = normalizeScoreStatus(status, score);
  if (normalized === "failed") return "Failed";
  if (normalized === "pending") return "Processing";
  if (normalized === "not_scored") return "Not eligible";
  if (typeof score !== "number" || !Number.isFinite(score)) return "Not eligible";
  return String(score);
}

/** Aggregates must not coerce a missing average into 0. */
export function formatAggregateScore(score: number | null | undefined): string {
  if (typeof score !== "number" || !Number.isFinite(score)) return "—";
  return String(Math.round(score));
}

export function scorecardStatusLabel(status: ScorecardUiStatus): string {
  switch (status) {
    case "loading":
    case "pending":
      return "Processing";
    case "not_scored":
      return "Not eligible";
    case "failed":
      return "Failed";
    case "scored":
      return "Scored";
  }
}

/** Map debrief job / UI status to the same three public labels. */
export function debriefJobStatusLabel(
  status: string | null | undefined,
): "Not eligible" | "Processing" | "Failed" | "Ready" | null {
  const s = String(status ?? "").toLowerCase();
  if (!s) return null;
  if (s === "queued" || s === "processing" || s === "pending" || s === "loading") {
    return "Processing";
  }
  if (s === "failed" || s === "cancelled") return "Failed";
  if (s === "not_scored" || s === "not_eligible" || s === "excluded") {
    return "Not eligible";
  }
  if (s === "completed" || s === "ready") return "Ready";
  return null;
}

/**
 * Normalize mixed edge/client statuses into UI buckets.
 * `failed` wins even when a spurious 0 score is present.
 */
export function normalizeScoreStatus(
  status: AnalyticsScoreStatusLike,
  score?: number | null,
): "scored" | "pending" | "not_scored" | "failed" {
  const raw = String(status ?? "").toLowerCase().trim();
  if (
    raw === "failed" ||
    raw === "failed_retryable" ||
    raw === "failed_permanent"
  ) {
    return "failed";
  }
  if (
    raw === "pending" ||
    raw === "processing" ||
    raw === "loading" ||
    raw === "queued"
  ) {
    return "pending";
  }
  if (
    raw === "not_scored" ||
    raw === "not_eligible" ||
    raw === "excluded" ||
    raw === "incomplete" ||
    raw === "not_requested"
  ) {
    return "not_scored";
  }
  if (raw === "scored" || raw === "completed") return "scored";
  if (typeof score === "number" && Number.isFinite(score) && (!raw || raw === "scored")) {
    return "scored";
  }
  return "not_scored";
}

/** Client-invented Gemini scores are never authoritative. */
export function isAuthoritativeScorecard(status: ScorecardUiStatus): boolean {
  return status === "scored";
}
