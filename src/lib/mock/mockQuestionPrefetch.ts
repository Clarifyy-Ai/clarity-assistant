import type { SessionQuestion } from "@/types/session.types";

export type MockPrefetchSlot = {
  questionNumber: number;
  operationId: string;
  promise: Promise<SessionQuestion>;
};

/**
 * In-flight Q(n+1) prefetch keyed by question number.
 * Separate abort from user-visible generation so Next can await the same promise.
 */
export function createMockPrefetchController() {
  const slots = new Map<number, MockPrefetchSlot>();
  let abort = new AbortController();

  return {
    getAbortSignal(): AbortSignal {
      return abort.signal;
    },
    get(questionNumber: number): MockPrefetchSlot | undefined {
      return slots.get(questionNumber);
    },
    set(slot: MockPrefetchSlot): void {
      slots.set(slot.questionNumber, slot);
    },
    consume(questionNumber: number): MockPrefetchSlot | undefined {
      const slot = slots.get(questionNumber);
      if (slot) slots.delete(questionNumber);
      return slot;
    },
    abortAll(): AbortSignal {
      abort.abort();
      slots.clear();
      abort = new AbortController();
      return abort.signal;
    },
  };
}

export type MockPrefetchController = ReturnType<typeof createMockPrefetchController>;
