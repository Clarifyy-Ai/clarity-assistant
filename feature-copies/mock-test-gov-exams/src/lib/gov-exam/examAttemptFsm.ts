/**
 * Government exam player attempt phases.
 * `mock_tests.status` stays DRAFT | IN_PROGRESS | COMPLETED | ABANDONED for
 * compatibility; `attempt_phase` is the canonical player FSM.
 */

export const EXAM_ATTEMPT_PHASES = [
  "NOT_STARTED",
  "INSTRUCTIONS",
  "ACTIVE",
  "PAUSED",
  "SUBMITTING",
  "SUBMITTED",
  "EVALUATING",
  "RESULT_AVAILABLE",
  "CONNECTION_LOST",
  "RESTORING",
  "AUTO_SUBMITTED",
  "INVALIDATED",
] as const;

export type ExamAttemptPhase = (typeof EXAM_ATTEMPT_PHASES)[number];

export type LegacyMockTestStatus = "DRAFT" | "IN_PROGRESS" | "COMPLETED" | "ABANDONED";

const TRANSITIONS: Record<ExamAttemptPhase, readonly ExamAttemptPhase[]> = {
  NOT_STARTED: ["INSTRUCTIONS", "INVALIDATED"],
  INSTRUCTIONS: ["ACTIVE", "NOT_STARTED", "INVALIDATED"],
  ACTIVE: [
    "PAUSED",
    "SUBMITTING",
    "CONNECTION_LOST",
    "AUTO_SUBMITTED",
    "INVALIDATED",
  ],
  PAUSED: ["ACTIVE", "SUBMITTING", "CONNECTION_LOST", "AUTO_SUBMITTED", "INVALIDATED"],
  SUBMITTING: ["SUBMITTED", "AUTO_SUBMITTED", "CONNECTION_LOST", "RESTORING"],
  SUBMITTED: ["EVALUATING"],
  EVALUATING: ["RESULT_AVAILABLE"],
  RESULT_AVAILABLE: [],
  CONNECTION_LOST: ["RESTORING", "AUTO_SUBMITTED", "INVALIDATED"],
  RESTORING: ["ACTIVE", "SUBMITTING", "INSTRUCTIONS", "INVALIDATED"],
  AUTO_SUBMITTED: ["EVALUATING", "RESULT_AVAILABLE"],
  INVALIDATED: [],
};

const LEGACY_TO_PHASE: Record<LegacyMockTestStatus, ExamAttemptPhase> = {
  DRAFT: "NOT_STARTED",
  IN_PROGRESS: "ACTIVE",
  COMPLETED: "RESULT_AVAILABLE",
  ABANDONED: "INVALIDATED",
};

const PHASE_TO_LEGACY: Record<ExamAttemptPhase, LegacyMockTestStatus> = {
  NOT_STARTED: "DRAFT",
  INSTRUCTIONS: "DRAFT",
  ACTIVE: "IN_PROGRESS",
  PAUSED: "IN_PROGRESS",
  SUBMITTING: "IN_PROGRESS",
  SUBMITTED: "COMPLETED",
  EVALUATING: "COMPLETED",
  RESULT_AVAILABLE: "COMPLETED",
  CONNECTION_LOST: "IN_PROGRESS",
  RESTORING: "IN_PROGRESS",
  AUTO_SUBMITTED: "COMPLETED",
  INVALIDATED: "ABANDONED",
};

export function isExamAttemptPhase(value: unknown): value is ExamAttemptPhase {
  return typeof value === "string" && (EXAM_ATTEMPT_PHASES as readonly string[]).includes(value);
}

export function phaseFromLegacyStatus(status: string | null | undefined): ExamAttemptPhase {
  if (isExamAttemptPhase(status)) return status;
  const key = String(status ?? "DRAFT") as LegacyMockTestStatus;
  return LEGACY_TO_PHASE[key] ?? "NOT_STARTED";
}

export function legacyStatusFromPhase(phase: ExamAttemptPhase): LegacyMockTestStatus {
  return PHASE_TO_LEGACY[phase];
}

export function canTransitionExamPhase(from: ExamAttemptPhase, to: ExamAttemptPhase): boolean {
  return TRANSITIONS[from].includes(to);
}

export function transitionExamPhase(from: ExamAttemptPhase, to: ExamAttemptPhase): ExamAttemptPhase {
  if (!canTransitionExamPhase(from, to)) {
    throw new Error(`Illegal exam attempt transition: ${from} → ${to}`);
  }
  return to;
}

export function resolveExamAttemptPhase(row: {
  attempt_phase?: string | null;
  status?: string | null;
}): ExamAttemptPhase {
  if (isExamAttemptPhase(row.attempt_phase)) return row.attempt_phase;
  return phaseFromLegacyStatus(row.status);
}

/** Pause is client UX only unless the exam pattern explicitly allows it. */
export function isPauseAllowed(patternAllowsPause: boolean | null | undefined): boolean {
  return patternAllowsPause === true;
}
