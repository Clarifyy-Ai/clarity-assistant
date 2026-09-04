/**
 * Shared durable-job progress contract — no invented percentages.
 * `progress` is optional and only set when a real measurable source exists.
 */

export type JobProgressStatus =
  | "queued"
  | "processing"
  | "completed"
  | "failed"
  | "cancelled"
  | "expired";

export type JobProgress = {
  jobId: string;
  status: JobProgressStatus;
  /** Machine stage key (domain-specific). */
  stage: string;
  /** Optional 0–100 from backend or browser upload bytes — never invented. */
  progress?: number;
  /** Human-readable status line. */
  message?: string;
  startedAt: string;
  updatedAt: string;
  completedAt?: string;
  errorCode?: string;
  errorMessage?: string;
  retryable?: boolean;
  cancelled?: boolean;
};

export type JobStageStep = {
  id: string;
  label: string;
  state: "pending" | "active" | "done" | "failed" | "cancelled";
};

export function isJobProgressTerminal(status: JobProgressStatus): boolean {
  return (
    status === "completed" ||
    status === "failed" ||
    status === "cancelled" ||
    status === "expired"
  );
}

export function normalizeJobStatus(raw: string | null | undefined): JobProgressStatus {
  const s = String(raw ?? "")
    .trim()
    .toLowerCase();
  if (s === "completed" || s === "ready" || s === "done") return "completed";
  if (s === "cancelled" || s === "canceled") return "cancelled";
  if (s === "expired") return "expired";
  if (
    s === "failed" ||
    s === "failed_retryable" ||
    s === "failed_permanent" ||
    s === "error"
  ) {
    return "failed";
  }
  if (s === "queued" || s === "pending" || s === "accepted") return "queued";
  return "processing";
}

/** Clamp real progress only; returns undefined for non-finite / out-of-range invents. */
export function coerceRealProgress(value: unknown): number | undefined {
  if (typeof value !== "number" || !Number.isFinite(value)) return undefined;
  if (value < 0 || value > 100) return undefined;
  return Math.round(value);
}
