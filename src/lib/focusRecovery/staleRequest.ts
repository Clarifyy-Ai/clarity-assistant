import { isAbortLikeError } from "./retryClassification";

export class StaleRequestError extends Error {
  readonly generation: number;
  constructor(generation: number) {
    super("Stale request discarded");
    this.name = "StaleRequestError";
    this.generation = generation;
  }
}

export function createGenerationGate(start = 0) {
  let current = start;

  return {
    next(): number {
      current += 1;
      return current;
    },
    current(): number {
      return current;
    },
    isCurrent(generation: number): boolean {
      return generation === current;
    },
    throwIfStale(generation: number): void {
      if (generation !== current) {
        throw new StaleRequestError(generation);
      }
    },
  };
}

export function createAbortableGeneration() {
  const gate = createGenerationGate();
  let controller: AbortController | null = null;

  return {
    begin(): { generation: number; signal: AbortSignal } {
      controller?.abort();
      controller = new AbortController();
      return { generation: gate.next(), signal: controller.signal };
    },
    isCurrent(generation: number): boolean {
      return gate.isCurrent(generation);
    },
    abort(): void {
      controller?.abort();
      controller = null;
    },
    current(): number {
      return gate.current();
    },
  };
}

export function isStaleOrAbortError(error: unknown): boolean {
  return error instanceof StaleRequestError || isAbortLikeError(error);
}

/**
 * Newest valid write wins: ignore a resolved payload if a newer generation
 * started, or if the request was aborted.
 */
export function applyIfCurrent<T>(
  generation: number,
  isCurrent: (generation: number) => boolean,
  apply: (value: T) => void,
): (value: T) => void {
  return (value: T) => {
    if (!isCurrent(generation)) return;
    apply(value);
  };
}

export type DashboardLoadPhase = "idle" | "initial" | "background" | "error";

export interface DashboardLoadState {
  phase: DashboardLoadPhase;
  initialLoading: boolean;
  backgroundRefreshing: boolean;
  error: string | null;
  hasData: boolean;
}

export type DashboardLoadEvent =
  | { type: "start"; hasData: boolean }
  | { type: "success"; hasData: boolean }
  | { type: "error"; message: string; hasData: boolean }
  | { type: "cancel" };

export function createDashboardLoadState(
  hasData = false,
): DashboardLoadState {
  return {
    phase: hasData ? "idle" : "initial",
    initialLoading: !hasData,
    backgroundRefreshing: false,
    error: null,
    hasData,
  };
}

export function reduceDashboardLoadState(
  state: DashboardLoadState,
  event: DashboardLoadEvent,
): DashboardLoadState {
  switch (event.type) {
    case "start": {
      if (event.hasData || state.hasData) {
        return {
          ...state,
          phase: "background",
          initialLoading: false,
          backgroundRefreshing: true,
          hasData: true,
        };
      }
      return {
        ...state,
        phase: "initial",
        initialLoading: true,
        backgroundRefreshing: false,
        error: null,
        hasData: false,
      };
    }
    case "success":
      return {
        phase: "idle",
        initialLoading: false,
        backgroundRefreshing: false,
        error: null,
        hasData: event.hasData,
      };
    case "error":
      return {
        phase: "error",
        initialLoading: false,
        backgroundRefreshing: false,
        error: event.message,
        hasData: event.hasData || state.hasData,
      };
    case "cancel":
      return {
        ...state,
        phase: state.hasData ? "idle" : state.phase,
        initialLoading: state.hasData ? false : state.initialLoading,
        backgroundRefreshing: false,
      };
    default:
      return state;
  }
}
