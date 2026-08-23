/**
 * Map persisted gov_paper_generation_jobs status/retryable to the public
 * job contract used by the frontend (failed_retryable / failed_permanent).
 */
export function mapPaperJobPublicStatus(
  status: string | null | undefined,
  retryable?: boolean | null,
): string {
  const s = String(status ?? "").trim();
  if (s === "failed_retryable" || s === "failed_permanent") return s;
  if (s === "failed") {
    return retryable === false ? "failed_permanent" : "failed_retryable";
  }
  if (s === "expired") return "failed_permanent";
  return s || "queued";
}

export function isPaperJobTerminal(status: string | null | undefined): boolean {
  const s = mapPaperJobPublicStatus(status);
  return (
    s === "completed" ||
    s === "cancelled" ||
    s === "failed_retryable" ||
    s === "failed_permanent" ||
    s === "failed" ||
    s === "expired"
  );
}

export const PAPER_JOB_STORAGE_KEY = "clarify_gov_paper_job";

export function saveActivePaperJob(payload: {
  jobId: string;
  examId: string;
  userId: string;
}): void {
  try {
    localStorage.setItem(
      PAPER_JOB_STORAGE_KEY,
      JSON.stringify({ ...payload, savedAt: Date.now() }),
    );
  } catch {
    /* ignore */
  }
}

export function loadActivePaperJob(userId: string): {
  jobId: string;
  examId: string;
  userId: string;
} | null {
  try {
    const raw = localStorage.getItem(PAPER_JOB_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as {
      jobId?: string;
      examId?: string;
      userId?: string;
    };
    if (!parsed.jobId || parsed.userId !== userId) return null;
    return {
      jobId: parsed.jobId,
      examId: parsed.examId ?? "",
      userId: parsed.userId,
    };
  } catch {
    return null;
  }
}

export function clearActivePaperJob(): void {
  try {
    localStorage.removeItem(PAPER_JOB_STORAGE_KEY);
  } catch {
    /* ignore */
  }
}
