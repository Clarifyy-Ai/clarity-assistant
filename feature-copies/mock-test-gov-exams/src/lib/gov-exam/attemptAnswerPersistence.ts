import {
  resolveExamAttemptPhase,
  type ExamAttemptPhase,
  type LegacyMockTestStatus,
} from "@/lib/gov-exam/examAttemptFsm";
import type { SaveTestAnswerInput } from "@/lib/gov-exam/api";

/** Supported gov-exam player modes that share the same answer persistence path. */
export const GOV_EXAM_PERSISTENCE_MODES = [
  "custom_mock",
  "custom_test",
  "full_mock",
  "official_previous",
  "quick_drill",
  "assessment",
] as const;

export type GovExamPersistenceMode = (typeof GOV_EXAM_PERSISTENCE_MODES)[number];

export type AttemptAnswerSnapshot = {
  status?: string | null;
  started_at?: string | null;
  expires_at?: string | null;
  attempt_phase?: string | null;
};

export type ResponseUiState = {
  answer: string;
  state: string;
};

export const ANSWER_SAVE_BLOCK_CODES = [
  "ATTEMPT_NOT_STARTED",
  "ATTEMPT_EXPIRED",
  "SUBMISSION_CONFLICT",
  "ATTEMPT_INVALIDATED",
] as const;

export type AnswerSaveBlockCode = (typeof ANSWER_SAVE_BLOCK_CODES)[number];

const PERSISTABLE_PHASES: ReadonlySet<ExamAttemptPhase> = new Set([
  "ACTIVE",
  "PAUSED",
  "CONNECTION_LOST",
  "RESTORING",
]);

const TERMINAL_PHASES: ReadonlySet<ExamAttemptPhase> = new Set([
  "SUBMITTING",
  "SUBMITTED",
  "EVALUATING",
  "RESULT_AVAILABLE",
  "AUTO_SUBMITTED",
  "INVALIDATED",
]);

export function resolveGovExamPersistenceMode(
  config: Record<string, unknown> | null | undefined,
): GovExamPersistenceMode | "unknown" {
  if (!config || typeof config !== "object") return "unknown";
  if (config.source === "exam_template") return "assessment";
  if (config.quick_drill === true) return "quick_drill";

  const mode = String(config.mode ?? config.paper_mode ?? config.basis ?? "").toLowerCase();
  if (mode === "official_previous" || mode === "official") return "official_previous";
  if (mode === "custom_mock" || mode === "custom" || mode === "topic") return "custom_mock";
  if (mode === "generated_mock" || mode === "full_mock") return "full_mock";
  if (config.paper_class === "custom_practice") return "custom_mock";
  if (Array.isArray(config.source_types) && config.source_types.length > 0) {
    return "custom_test";
  }
  return "unknown";
}

export function isMarkedForReview(state: string): boolean {
  return state === "marked" || state === "answered-marked";
}

export function isAnswerAttempted(response: ResponseUiState): boolean {
  return Boolean(response.answer) || response.state !== "unattempted";
}

/** Authoritative client guard — server RPC remains the source of truth. */
export function canPersistExamAnswers(attempt: AttemptAnswerSnapshot | null | undefined): boolean {
  if (!attempt) return false;
  const status = String(attempt.status ?? "").toUpperCase() as LegacyMockTestStatus;
  if (status === "COMPLETED" || status === "ABANDONED") return false;
  if (status !== "IN_PROGRESS") return false;
  if (!attempt.started_at) return false;

  const phase = resolveExamAttemptPhase(attempt);
  return PERSISTABLE_PHASES.has(phase);
}

export function answerSaveBlockReason(
  attempt: AttemptAnswerSnapshot | null | undefined,
): AnswerSaveBlockCode | null {
  if (!attempt) return "ATTEMPT_NOT_STARTED";
  const status = String(attempt.status ?? "").toUpperCase();
  if (status === "COMPLETED") return "SUBMISSION_CONFLICT";
  if (status === "ABANDONED") return "ATTEMPT_INVALIDATED";
  if (status === "DRAFT" || !attempt.started_at) return "ATTEMPT_NOT_STARTED";

  const phase = resolveExamAttemptPhase(attempt);
  if (TERMINAL_PHASES.has(phase)) {
    return phase === "INVALIDATED" ? "ATTEMPT_INVALIDATED" : "SUBMISSION_CONFLICT";
  }
  if (!PERSISTABLE_PHASES.has(phase)) return "ATTEMPT_NOT_STARTED";
  return null;
}

export function isTerminalAnswerSaveRejection(code: string | null | undefined): code is AnswerSaveBlockCode {
  if (!code) return false;
  return (ANSWER_SAVE_BLOCK_CODES as readonly string[]).includes(code.toUpperCase());
}

export function buildPersistableAnswerRows(
  questions: Array<{ id: string }>,
  responses: Record<string, ResponseUiState>,
  timeSpentByQuestion: Record<string, number>,
  clientUpdatedAt: string,
  answerVersions: Record<string, number> = {},
): SaveTestAnswerInput[] {
  return questions.map((question) => {
    const response = responses[question.id] ?? { answer: "", state: "unattempted" };
    const marked = isMarkedForReview(response.state);
    return {
      questionId: question.id,
      userAnswer: response.answer || null,
      isAttempted: isAnswerAttempted(response),
      isMarkedReview: marked,
      timeSpentSeconds: timeSpentByQuestion[question.id] ?? 0,
      clientUpdatedAt,
      version: answerVersions[question.id] ?? 0,
    };
  });
}

export function mergeServerAnswerVersions(
  current: Record<string, number>,
  serverVersions: Record<string, number>,
): Record<string, number> {
  return { ...current, ...serverVersions };
}

/** Block autosave while submit is in flight or answers are terminal-locked. */
export function shouldBlockAnswerAutosave(locks: {
  submitting: boolean;
  answersLocked: boolean;
}): boolean {
  return locks.answersLocked || locks.submitting;
}
