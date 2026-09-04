import type { ExamPaperAvailability } from "@/lib/gov-exam/api";

/** Discriminated availability preflight — timers only run in `checking`. */
export type GovPaperAvailabilitySession =
  | { phase: "idle" }
  | {
      phase: "checking";
      requestKey: string;
      startTime: number;
    }
  | {
      phase: "ready";
      requestKey: string;
      result: ExamPaperAvailability;
      completedAt: number;
    }
  | {
      phase: "failed";
      requestKey: string;
      code: string;
      message: string;
      failedAt: number;
      retryable: boolean;
    };

/** Generation / poll lifecycle — timers only run in `active`. */
export type GovPaperGenerationSession =
  | { phase: "idle" }
  | {
      phase: "active";
      jobId: string;
      startTime: number;
      idempotencyKey?: string;
    }
  | {
      phase: "completed";
      jobId: string;
      mockTestId?: string | null;
      completedAt: number;
    }
  | {
      phase: "failed";
      jobId: string;
      errorCode?: string | null;
      errorMessage?: string | null;
      failedAt: number;
      retryable: boolean;
    };

export function initialAvailabilitySession(): GovPaperAvailabilitySession {
  return { phase: "idle" };
}

export function initialGenerationSession(): GovPaperGenerationSession {
  return { phase: "idle" };
}

export function availabilityRequestKey(input: {
  examId: string;
  stageId: string;
  mode: string;
  language: string;
  questionCount: number;
  basis: string;
  topicsKey: string;
}): string {
  return [
    input.examId,
    input.stageId,
    input.mode,
    input.language,
    String(input.questionCount),
    input.basis,
    input.topicsKey,
  ].join("::");
}

export function beginAvailabilityCheck(
  requestKey: string,
  nowMs = Date.now(),
): GovPaperAvailabilitySession {
  return { phase: "checking", requestKey, startTime: nowMs };
}

export function completeAvailabilityCheck(
  session: GovPaperAvailabilitySession,
  requestKey: string,
  result: ExamPaperAvailability,
  nowMs = Date.now(),
): GovPaperAvailabilitySession {
  if (session.phase === "checking" && session.requestKey !== requestKey) {
    return session;
  }
  return { phase: "ready", requestKey, result, completedAt: nowMs };
}

export function failAvailabilityCheck(
  session: GovPaperAvailabilitySession,
  requestKey: string,
  code: string,
  message: string,
  retryable = true,
  nowMs = Date.now(),
): GovPaperAvailabilitySession {
  if (session.phase === "checking" && session.requestKey !== requestKey) {
    return session;
  }
  return {
    phase: "failed",
    requestKey,
    code,
    message,
    failedAt: nowMs,
    retryable,
  };
}

export function resetAvailabilitySession(): GovPaperAvailabilitySession {
  return initialAvailabilitySession();
}

export function availabilityResult(
  session: GovPaperAvailabilitySession,
): ExamPaperAvailability | null {
  return session.phase === "ready" ? session.result : null;
}

export function isAvailabilityChecking(session: GovPaperAvailabilitySession): boolean {
  return session.phase === "checking";
}

export function availabilityCheckingElapsedMs(
  session: GovPaperAvailabilitySession | null | undefined,
  nowMs = Date.now(),
): number | null {
  if (!session || session.phase !== "checking") return null;
  const startTime = session.startTime;
  if (typeof startTime !== "number" || !Number.isFinite(startTime)) return null;
  return Math.max(0, nowMs - startTime);
}

export function beginGenerationSession(
  jobId: string,
  options?: { idempotencyKey?: string; nowMs?: number },
): GovPaperGenerationSession {
  const nowMs = options?.nowMs ?? Date.now();
  return {
    phase: "active",
    jobId,
    startTime: nowMs,
    idempotencyKey: options?.idempotencyKey,
  };
}

export function completeGenerationSession(
  session: GovPaperGenerationSession,
  jobId: string,
  mockTestId?: string | null,
  nowMs = Date.now(),
): GovPaperGenerationSession {
  if (session.phase === "active" && session.jobId !== jobId) {
    return session;
  }
  return { phase: "completed", jobId, mockTestId, completedAt: nowMs };
}

export function failGenerationSession(
  session: GovPaperGenerationSession,
  jobId: string,
  error: { errorCode?: string | null; errorMessage?: string | null; retryable?: boolean },
  nowMs = Date.now(),
): GovPaperGenerationSession {
  if (session.phase === "active" && session.jobId !== jobId) {
    return session;
  }
  return {
    phase: "failed",
    jobId,
    errorCode: error.errorCode ?? null,
    errorMessage: error.errorMessage ?? null,
    failedAt: nowMs,
    retryable: error.retryable !== false,
  };
}

export function resetGenerationSession(): GovPaperGenerationSession {
  return initialGenerationSession();
}

export function isGenerationTimerActive(
  session: GovPaperGenerationSession | null | undefined,
): boolean {
  if (!session || session.phase !== "active") return false;
  return typeof session.startTime === "number" && Number.isFinite(session.startTime);
}

/** Safe elapsed seconds for UI — never throws; never reads startTime unless phase is `active`. */
export function generationElapsedSeconds(
  session: GovPaperGenerationSession | null | undefined,
  nowMs = Date.now(),
): number | null {
  if (!session || session.phase !== "active") return null;
  const startTime = session.startTime;
  if (typeof startTime !== "number" || !Number.isFinite(startTime)) return null;
  return Math.max(0, Math.floor((nowMs - startTime) / 1000));
}

export function formatGenerationElapsed(seconds: number | null): string | null {
  if (seconds == null) return null;
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${mins}:${String(secs).padStart(2, "0")}`;
}
