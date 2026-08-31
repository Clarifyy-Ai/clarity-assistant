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

/** User-facing progress stages shown during paper generation. */
export const PAPER_JOB_USER_STAGES = [
  "generating_paper",
  "selecting_questions",
  "validating_paper",
  "completed",
] as const;

export type PaperJobUserStage = (typeof PAPER_JOB_USER_STAGES)[number];

export const PAPER_JOB_STAGE_LABEL: Record<string, string> = {
  queued: "Queued…",
  leased: "Starting generation…",
  checking_availability: "Checking availability…",
  selecting: "Selecting questions…",
  generating: "Generating paper…",
  validating: "Validating paper…",
  assembling: "Assembling paper…",
  retrieving_sources: "Generating paper…",
  analyzing_pattern: "Generating paper…",
  planning_blueprint: "Generating paper…",
  building_blueprint: "Generating paper…",
  generating_paper: "Generating paper…",
  selecting_questions: "Selecting questions…",
  generating_questions: "Generating paper…",
  generating_missing_slots: "Generating paper…",
  validating_questions: "Validating paper…",
  checking_similarity: "Validating paper…",
  validating_paper: "Validating paper…",
  completed: "Completed",
  failed: "We couldn't generate this paper. Try again.",
  failed_retryable: "We couldn't generate this paper. Try again.",
  failed_permanent: "We couldn't generate this paper. Try again.",
  cancelled: "Cancelled",
  expired: "We couldn't generate this paper. Try again.",
};

/** Collapse internal job progress into the four user-facing stages. */
export function mapProgressToUserStage(
  progressStage: string | null | undefined,
  status: string | null | undefined,
): PaperJobUserStage | "failed" | "cancelled" {
  const ui = mapProgressToUiState(progressStage, status);
  if (ui === "READY") return "completed";
  if (ui === "CANCELLED") return "cancelled";
  if (ui === "FAILED_RETRYABLE" || ui === "FAILED_PERMANENT") return "failed";
  if (ui === "VALIDATING") return "validating_paper";
  if (ui === "CHECKING" || ui === "QUEUED") return "generating_paper";
  if (ui === "GENERATING") {
    const stage = String(progressStage ?? status ?? "").trim();
    if (stage === "selecting" || stage === "selecting_questions") return "selecting_questions";
    return "generating_paper";
  }
  return "generating_paper";
}

/** Public generation UI: IDLE → CHECKING → QUEUED → GENERATING → VALIDATING → READY. */
export const PAPER_JOB_UI_STATES = [
  "CHECKING",
  "QUEUED",
  "GENERATING",
  "VALIDATING",
  "READY",
] as const;

export type PaperJobUiState =
  | "IDLE"
  | (typeof PAPER_JOB_UI_STATES)[number]
  | "FAILED_RETRYABLE"
  | "FAILED_PERMANENT"
  | "CANCELLED";

export const PAPER_JOB_UI_LABEL: Record<PaperJobUiState, string> = {
  IDLE: "Idle",
  CHECKING: "Checking availability…",
  QUEUED: "Queued…",
  GENERATING: "Generating paper…",
  VALIDATING: "Validating paper…",
  READY: "Ready",
  FAILED_RETRYABLE: "We couldn't generate this paper. Try again.",
  FAILED_PERMANENT: "We couldn't generate this paper. Try again.",
  CANCELLED: "Cancelled",
};

export function mapProgressToUiState(
  progressStage: string | null | undefined,
  status: string | null | undefined,
): PaperJobUiState {
  const rawStatus = String(status ?? "").trim();
  const rawStage = String(progressStage ?? "").trim();
  if (!rawStatus && !rawStage) return "IDLE";
  const publicStatus = mapPaperJobPublicStatus(rawStatus || rawStage);
  if (publicStatus === "completed") return "READY";
  if (publicStatus === "cancelled") return "CANCELLED";
  if (publicStatus === "failed_permanent" || publicStatus === "expired") {
    return "FAILED_PERMANENT";
  }
  if (publicStatus === "failed_retryable" || publicStatus === "failed") {
    return "FAILED_RETRYABLE";
  }
  const stage = String(progressStage ?? status ?? "").trim();
  if (stage === "checking_availability") return "CHECKING";
  if (stage === "queued") return "QUEUED";
  if (
    stage === "validating" ||
    stage === "validating_questions" ||
    stage === "checking_similarity" ||
    stage === "assembling" ||
    stage === "validating_paper"
  ) {
    return "VALIDATING";
  }
  return "GENERATING";
}

export function paperJobStageLabel(
  progressStage: string | null | undefined,
  status?: string | null,
): string {
  if (status) {
    const user = mapProgressToUserStage(progressStage, status);
    if (user === "failed" || user === "cancelled") {
      return PAPER_JOB_STAGE_LABEL[user] ?? PAPER_JOB_STAGE_LABEL.failed;
    }
    return PAPER_JOB_STAGE_LABEL[user] ?? PAPER_JOB_STAGE_LABEL.generating_paper;
  }
  const key = String(progressStage ?? "").trim();
  return PAPER_JOB_STAGE_LABEL[key] ?? PAPER_JOB_STAGE_LABEL.generating_paper;
}

export const PAPER_JOB_STORAGE_KEY = "clarify_gov_paper_job";

export function saveActivePaperJob(payload: {
  jobId: string;
  examId: string;
  userId: string;
  idempotencyKey?: string;
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
  idempotencyKey?: string;
} | null {
  try {
    const raw = localStorage.getItem(PAPER_JOB_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as {
      jobId?: string;
      examId?: string;
      userId?: string;
      idempotencyKey?: string;
    };
    if (!parsed.jobId || parsed.userId !== userId) return null;
    return {
      jobId: parsed.jobId,
      examId: parsed.examId ?? "",
      userId: parsed.userId,
      idempotencyKey: parsed.idempotencyKey,
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
