/**
 * Deterministic Mock Interview question / answer / next state machine.
 *
 * loading → ready → question_generating → question_ready → question_speaking
 *   → listening → answer_detected → answer_finalizing → answer_saved
 *   → next_question_pending → (ready | completed | failed)
 *
 * Skip may enter from listening / answer_detected / ready.
 * Confirmed silence (silencePolicy) may FINALIZE then REQUEST_NEXT via the
 * same idempotent Next path as the manual button.
 */

export type AnswerNextState =
  | "loading"
  | "ready"
  | "question_generating"
  | "question_ready"
  | "question_speaking"
  | "listening"
  | "answer_detected"
  | "answer_finalizing"
  | "answer_saved"
  | "next_question_pending"
  | "completed"
  | "failed"
  /** @deprecated Alias kept for older call sites / tests */
  | "answer_finalized"
  | "skipped"
  | "follow_up_pending";

export type MockAnswerStatus =
  | "unanswered"
  | "draft"
  | "answered"
  | "skipped"
  | "invalid";

export type AnswerFinalizationOutcome =
  | "VALID_ANSWER"
  | "SKIPPED"
  | "UNANSWERED"
  | "NO_SIGNAL"
  | "FINALIZATION_TIMEOUT"
  | "INVALID";

export type AnswerNextEvent =
  | { type: "RESET" }
  | { type: "READY" }
  | { type: "START_GENERATING" }
  | { type: "QUESTION_READY" }
  | { type: "START_SPEAKING" }
  | { type: "SPEAKING_DONE" }
  | { type: "START_LISTENING" }
  | { type: "ANSWER_DETECTED" }
  | { type: "FINALIZE" }
  | { type: "ANSWER_SAVED" }
  | { type: "SKIP" }
  | { type: "REQUEST_NEXT" }
  | { type: "FOLLOW_UP" }
  | { type: "NEXT_READY" }
  | { type: "COMPLETE" }
  | { type: "FAIL" };

const ALLOWED: Record<AnswerNextState, ReadonlySet<AnswerNextState>> = {
  loading: new Set(["ready", "question_generating", "failed"]),
  ready: new Set([
    "question_generating",
    "question_ready",
    "question_speaking",
    "listening",
    "answer_finalizing",
    "answer_finalized",
    "skipped",
    "next_question_pending",
    "completed",
  ]),
  question_generating: new Set([
    "question_ready",
    "failed",
    "ready",
    "completed",
  ]),
  question_ready: new Set([
    "question_speaking",
    "listening",
    "answer_finalizing",
    "skipped",
    "failed",
  ]),
  question_speaking: new Set([
    "listening",
    "answer_finalizing",
    "skipped",
    "ready",
    "failed",
  ]),
  listening: new Set([
    "answer_detected",
    "answer_finalizing",
    "answer_finalized",
    "skipped",
    "ready",
  ]),
  answer_detected: new Set([
    "answer_finalizing",
    "answer_finalized",
    "skipped",
    "listening",
  ]),
  answer_finalizing: new Set([
    "answer_saved",
    "answer_finalized",
    "next_question_pending",
    "ready",
    "completed",
    "failed",
  ]),
  answer_finalized: new Set([
    "answer_saved",
    "next_question_pending",
    "ready",
    "completed",
  ]),
  answer_saved: new Set([
    "next_question_pending",
    "follow_up_pending",
    "ready",
    "completed",
    "failed",
  ]),
  skipped: new Set(["next_question_pending", "ready", "completed", "answer_saved"]),
  follow_up_pending: new Set(["ready", "next_question_pending", "question_generating", "failed"]),
  next_question_pending: new Set([
    "ready",
    "question_generating",
    "question_ready",
    "failed",
    "completed",
  ]),
  completed: new Set(["loading", "ready"]),
  failed: new Set(["ready", "loading", "next_question_pending", "question_generating"]),
};

export function canTransitionAnswerNext(
  from: AnswerNextState,
  to: AnswerNextState,
): boolean {
  return ALLOWED[from]?.has(to) ?? false;
}

function normalizeLegacy(state: AnswerNextState): AnswerNextState {
  if (state === "answer_finalized") return "answer_finalizing";
  return state;
}

export function reduceAnswerNext(
  state: AnswerNextState,
  event: AnswerNextEvent,
): AnswerNextState {
  const next = ((): AnswerNextState => {
    switch (event.type) {
      case "RESET":
        return "loading";
      case "READY":
        return "ready";
      case "START_GENERATING":
        return "question_generating";
      case "QUESTION_READY":
        return "question_ready";
      case "START_SPEAKING":
        return "question_speaking";
      case "SPEAKING_DONE":
        return "listening";
      case "START_LISTENING":
        return "listening";
      case "ANSWER_DETECTED":
        return state === "listening" || state === "ready" || state === "question_speaking"
          ? "answer_detected"
          : state;
      case "FINALIZE":
        return "answer_finalizing";
      case "ANSWER_SAVED":
        return "answer_saved";
      case "SKIP":
        return "skipped";
      case "REQUEST_NEXT":
        return "next_question_pending";
      case "FOLLOW_UP":
        return "follow_up_pending";
      case "NEXT_READY":
        return "ready";
      case "COMPLETE":
        return "completed";
      case "FAIL":
        return "failed";
      default:
        return state;
    }
  })();

  if (next === state) return state;
  if (next === normalizeLegacy(state) && state === "answer_finalized") {
    return next;
  }

  if (!canTransitionAnswerNext(state, next) && event.type !== "RESET") {
    // Allow forced finalize/skip/next from most active states for UX reliability.
    if (
      (event.type === "FINALIZE" ||
        event.type === "SKIP" ||
        event.type === "REQUEST_NEXT" ||
        event.type === "FAIL" ||
        event.type === "READY" ||
        event.type === "COMPLETE") &&
      state !== "completed" &&
      state !== "loading"
    ) {
      return next;
    }
    // Allow speaking/listening transitions when question just became active.
    if (
      (event.type === "START_SPEAKING" ||
        event.type === "SPEAKING_DONE" ||
        event.type === "START_LISTENING" ||
        event.type === "QUESTION_READY" ||
        event.type === "START_GENERATING" ||
        event.type === "ANSWER_SAVED") &&
      state !== "completed"
    ) {
      return next;
    }
    return state;
  }
  return next;
}

/**
 * Next is disabled only while a known operation is pending.
 * Listening / speaking / answer_detected must NOT block Next.
 */
export function isAnswerNextBusy(state: AnswerNextState): boolean {
  return (
    state === "loading" ||
    state === "question_generating" ||
    state === "answer_finalizing" ||
    state === "answer_finalized" ||
    state === "answer_saved" ||
    state === "follow_up_pending" ||
    state === "next_question_pending"
  );
}

import type { OverlaySessionState } from "@/lib/overlay/overlaySessionStates";

/** Map answer-next FSM states to mock overlay pipeline states. */
export function overlayPipelineForAnswerNext(
  state: AnswerNextState,
): OverlaySessionState | null {
  switch (state) {
    case "answer_finalizing":
    case "answer_finalized":
    case "answer_saved":
      return "answer_finalizing";
    case "next_question_pending":
    case "question_generating":
    case "follow_up_pending":
      return "next_question_pending";
    default:
      return null;
  }
}

/** Status copy for the mock chrome. */
export function answerNextStatusLabel(state: AnswerNextState): string | null {
  switch (state) {
    case "question_generating":
    case "next_question_pending":
      return "Generating next question…";
    case "follow_up_pending":
      return "Preparing a follow-up…";
    case "question_speaking":
      return "Interviewer speaking…";
    case "listening":
      return "Listening for your answer…";
    case "answer_detected":
      return "Answer detected — press Next when ready";
    case "answer_finalizing":
    case "answer_finalized":
    case "answer_saved":
      return "Saving answer…";
    case "skipped":
      return "Skipped";
    case "ready":
    case "question_ready":
      return "Ready";
    case "failed":
      return "Something went wrong — retry Next";
    default:
      return null;
  }
}

export function deriveMockAnswerStatus(input: {
  skipped?: boolean;
  text?: string | null;
  hadSignal?: boolean;
}): MockAnswerStatus {
  if (input.skipped) return "skipped";
  const text = (input.text ?? "").trim();
  if (!text) {
    return input.hadSignal === false ? "unanswered" : "unanswered";
  }
  if (text.length < 3) return "invalid";
  return "answered";
}

export function deriveFinalizationOutcome(input: {
  skipped?: boolean;
  status: MockAnswerStatus;
  hadSignal?: boolean;
  timedOut?: boolean;
}): AnswerFinalizationOutcome {
  if (input.skipped || input.status === "skipped") return "SKIPPED";
  if (input.timedOut) return "FINALIZATION_TIMEOUT";
  if (input.status === "invalid") return "INVALID";
  if (input.status === "answered") return "VALID_ANSWER";
  if (input.hadSignal === false) return "NO_SIGNAL";
  return "UNANSWERED";
}
