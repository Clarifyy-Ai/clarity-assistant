/**
 * Durable question-generation operation state machine for mock interviews.
 *
 * IDLE → PENDING → GENERATING → COMPLETED
 * Failure / cancel: FAILED | FALLBACK_AVAILABLE | CANCELLED
 */

export type QuestionGenerationState =
  | "IDLE"
  | "PENDING"
  | "GENERATING"
  | "COMPLETED"
  | "FAILED"
  | "FALLBACK_AVAILABLE"
  | "CANCELLED";

export type QuestionGenerationEvent =
  | { type: "START"; operationId: string }
  | { type: "BEGIN_PROVIDER" }
  | { type: "SUCCESS"; source: "ai" | "fallback" }
  | { type: "FAIL"; code?: string }
  | { type: "FALLBACK_READY" }
  | { type: "CANCEL" }
  | { type: "RESET" };

export interface QuestionGenerationSnapshot {
  state: QuestionGenerationState;
  operationId: string | null;
  source: "ai" | "fallback" | null;
  errorCode: string | null;
}

export function createQuestionGenerationSnapshot(
  state: QuestionGenerationState = "IDLE",
): QuestionGenerationSnapshot {
  return {
    state,
    operationId: null,
    source: null,
    errorCode: null,
  };
}

const ALLOWED: Record<QuestionGenerationState, ReadonlySet<QuestionGenerationState>> = {
  IDLE: new Set(["PENDING", "IDLE"]),
  PENDING: new Set(["GENERATING", "CANCELLED", "FAILED", "FALLBACK_AVAILABLE"]),
  GENERATING: new Set([
    "COMPLETED",
    "FAILED",
    "FALLBACK_AVAILABLE",
    "CANCELLED",
  ]),
  COMPLETED: new Set(["IDLE", "PENDING"]),
  FAILED: new Set(["IDLE", "PENDING"]),
  FALLBACK_AVAILABLE: new Set(["IDLE", "PENDING", "COMPLETED"]),
  CANCELLED: new Set(["IDLE", "PENDING"]),
};

export function canTransitionQuestionGeneration(
  from: QuestionGenerationState,
  to: QuestionGenerationState,
): boolean {
  return ALLOWED[from]?.has(to) ?? false;
}

export function reduceQuestionGeneration(
  snapshot: QuestionGenerationSnapshot,
  event: QuestionGenerationEvent,
): QuestionGenerationSnapshot {
  switch (event.type) {
    case "RESET":
      return createQuestionGenerationSnapshot("IDLE");

    case "START": {
      if (
        snapshot.state === "PENDING" ||
        snapshot.state === "GENERATING"
      ) {
        // Duplicate start while in-flight — keep current operation.
        return snapshot;
      }
      return {
        state: "PENDING",
        operationId: event.operationId,
        source: null,
        errorCode: null,
      };
    }

    case "BEGIN_PROVIDER": {
      if (snapshot.state !== "PENDING" && snapshot.state !== "GENERATING") {
        return snapshot;
      }
      return { ...snapshot, state: "GENERATING" };
    }

    case "SUCCESS": {
      if (
        snapshot.state !== "PENDING" &&
        snapshot.state !== "GENERATING" &&
        snapshot.state !== "FALLBACK_AVAILABLE"
      ) {
        return snapshot;
      }
      return {
        ...snapshot,
        state: "COMPLETED",
        source: event.source,
        errorCode: null,
      };
    }

    case "FALLBACK_READY": {
      if (snapshot.state !== "PENDING" && snapshot.state !== "GENERATING") {
        return snapshot;
      }
      return {
        ...snapshot,
        state: "FALLBACK_AVAILABLE",
        source: "fallback",
      };
    }

    case "FAIL": {
      if (
        snapshot.state !== "PENDING" &&
        snapshot.state !== "GENERATING" &&
        snapshot.state !== "FALLBACK_AVAILABLE"
      ) {
        return snapshot;
      }
      return {
        ...snapshot,
        state: "FAILED",
        errorCode: event.code ?? "QUESTION_GENERATION_UNAVAILABLE",
      };
    }

    case "CANCEL": {
      if (snapshot.state !== "PENDING" && snapshot.state !== "GENERATING") {
        return snapshot.state === "IDLE"
          ? snapshot
          : { ...snapshot, state: "CANCELLED" };
      }
      return {
        ...snapshot,
        state: "CANCELLED",
        errorCode: null,
      };
    }

    default:
      return snapshot;
  }
}

export function isQuestionGenerationInFlight(
  state: QuestionGenerationState,
): boolean {
  return state === "PENDING" || state === "GENERATING";
}

export function isQuestionGenerationTerminal(
  state: QuestionGenerationState,
): boolean {
  return (
    state === "COMPLETED" ||
    state === "FAILED" ||
    state === "CANCELLED" ||
    state === "FALLBACK_AVAILABLE"
  );
}
