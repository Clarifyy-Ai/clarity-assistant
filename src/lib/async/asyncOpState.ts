/**
 * Client FSM for non-durable AI / sync operations.
 * Stages are named labels only — never invent percentages.
 */

export type AsyncOpStatus =
  | "idle"
  | "starting"
  | "processing"
  | "completed"
  | "failed"
  | "cancelled"
  | "timeout"
  | "retryable_error";

export type AsyncOpState = {
  status: AsyncOpStatus;
  stage: string;
  message: string;
  startedAt: number | null;
  errorCode?: string;
  retryable?: boolean;
};

export type AsyncOpEvent =
  | { type: "START"; stage?: string; message?: string }
  | { type: "STAGE"; stage: string; message?: string }
  | { type: "COMPLETE"; message?: string }
  | { type: "FAIL"; message: string; errorCode?: string; retryable?: boolean }
  | { type: "CANCEL" }
  | { type: "TIMEOUT"; message?: string }
  | { type: "RESET" };

export function createAsyncOpState(
  partial?: Partial<AsyncOpState>,
): AsyncOpState {
  return {
    status: "idle",
    stage: "",
    message: "",
    startedAt: null,
    ...partial,
  };
}

export function reduceAsyncOp(
  state: AsyncOpState,
  event: AsyncOpEvent,
): AsyncOpState {
  switch (event.type) {
    case "RESET":
      return createAsyncOpState();
    case "START":
      return {
        status: "starting",
        stage: event.stage ?? "starting",
        message: event.message ?? "Starting…",
        startedAt: Date.now(),
      };
    case "STAGE":
      return {
        ...state,
        status: state.status === "idle" ? "processing" : "processing",
        stage: event.stage,
        message: event.message ?? state.message,
        startedAt: state.startedAt ?? Date.now(),
      };
    case "COMPLETE":
      return {
        ...state,
        status: "completed",
        stage: "completed",
        message: event.message ?? "Done",
      };
    case "FAIL":
      return {
        ...state,
        status: event.retryable === false ? "failed" : "retryable_error",
        message: event.message,
        errorCode: event.errorCode,
        retryable: event.retryable !== false,
      };
    case "CANCEL":
      return {
        ...state,
        status: "cancelled",
        stage: "cancelled",
        message: "Cancelled",
        retryable: false,
      };
    case "TIMEOUT":
      return {
        ...state,
        status: "timeout",
        message:
          event.message ??
          "Taking longer than expected. You can continue waiting or retry.",
        retryable: true,
      };
    default:
      return state;
  }
}

export function isAsyncOpBusy(status: AsyncOpStatus): boolean {
  return status === "starting" || status === "processing";
}
