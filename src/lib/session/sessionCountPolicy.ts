/**
 * Canonical counting policy shared by Session History, Dashboard, and Analytics consumers.
 * Interview soft-deleted rows are excluded by the history RPC; counts should match.
 */
export type SessionCountBucket =
  | "history_visible"
  | "completed"
  | "score_eligible"
  | "analytics_eligible";

const COMPLETED = new Set([
  "completed",
  "submitted",
]);

const ACTIVE_OR_OPEN = new Set([
  "active",
  "paused",
  "draft",
  "starting",
  "processing",
  "evaluation_pending",
]);

/** Statuses that appear as a normal history row (not cancelled-only ghost). */
export function isHistoryVisibleStatus(status: string | null | undefined): boolean {
  const s = String(status ?? "").toLowerCase();
  if (!s) return true;
  return s !== "cancelled";
}

export function isCompletedCountStatus(status: string | null | undefined): boolean {
  return COMPLETED.has(String(status ?? "").toLowerCase());
}

export function isScoreEligibleStatus(status: string | null | undefined): boolean {
  const s = String(status ?? "").toLowerCase();
  return s === "completed" || s === "submitted";
}

export function isAnalyticsEligibleStatus(status: string | null | undefined): boolean {
  return isScoreEligibleStatus(status) || ACTIVE_OR_OPEN.has(String(status ?? "").toLowerCase());
}

export function matchesCountBucket(
  status: string | null | undefined,
  bucket: SessionCountBucket,
): boolean {
  switch (bucket) {
    case "history_visible":
      return isHistoryVisibleStatus(status);
    case "completed":
      return isCompletedCountStatus(status);
    case "score_eligible":
      return isScoreEligibleStatus(status);
    case "analytics_eligible":
      return isAnalyticsEligibleStatus(status);
    default:
      return false;
  }
}
