import { describe, expect, it } from "vitest";
import { createMockPrefetchController } from "@/lib/mock/mockQuestionPrefetch";
import type { SessionQuestion } from "@/types/session.types";

function fakeQuestion(n: number): SessionQuestion {
  return {
    id: `q-${n}`,
    session_id: "sess",
    question_number: n,
    question_text: `Question ${n}?`,
    question_type: "behavioural",
    expected_duration_seconds: 120,
    difficulty: "medium",
    tags: [],
    company_specific: false,
  };
}

describe("mock question prefetch", () => {
  it("Next consumes the same operation id that prefetch stored", async () => {
    const prefetch = createMockPrefetchController();
    const operationId = "gq:sess:q2";
    prefetch.set({
      questionNumber: 2,
      operationId,
      promise: Promise.resolve(fakeQuestion(2)),
    });

    const slot = prefetch.consume(2);
    expect(slot?.operationId).toBe(operationId);
    expect(prefetch.get(2)).toBeUndefined();
    await expect(slot?.promise).resolves.toMatchObject({ question_number: 2 });
  });

  it("abortAll drops in-flight slots and rotates the abort signal", () => {
    const prefetch = createMockPrefetchController();
    const first = prefetch.getAbortSignal();
    prefetch.set({
      questionNumber: 3,
      operationId: "gq:sess:q3",
      promise: new Promise(() => {}),
    });
    const next = prefetch.abortAll();
    expect(first.aborted).toBe(true);
    expect(next.aborted).toBe(false);
    expect(prefetch.get(3)).toBeUndefined();
  });
});
