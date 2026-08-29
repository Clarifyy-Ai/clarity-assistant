import { describe, expect, it } from "vitest";
import {
  createQuestionGenerationSnapshot,
  isQuestionGenerationInFlight,
  reduceQuestionGeneration,
} from "@/lib/mock/questionGenerationFsm";
import {
  assertMockSessionAllowsUpdate,
  isMockSessionMutable,
  isMockSessionTerminal,
  reduceMockSessionLifecycle,
} from "@/lib/mock/mockSessionLifecycle";
import {
  isDuplicateQuestionText,
  validateGeneratedQuestion,
  validateGeneratedQuestionsPayload,
} from "@/lib/mock/validateGeneratedQuestion";
import { selectFallbackQuestion } from "@/lib/mock/selectFallbackQuestion";

describe("questionGenerationFsm", () => {
  it("follows IDLE → PENDING → GENERATING → COMPLETED", () => {
    let snap = createQuestionGenerationSnapshot();
    snap = reduceQuestionGeneration(snap, {
      type: "START",
      operationId: "op-1",
    });
    expect(snap.state).toBe("PENDING");
    expect(snap.operationId).toBe("op-1");
    expect(isQuestionGenerationInFlight(snap.state)).toBe(true);

    snap = reduceQuestionGeneration(snap, { type: "BEGIN_PROVIDER" });
    expect(snap.state).toBe("GENERATING");

    snap = reduceQuestionGeneration(snap, { type: "SUCCESS", source: "ai" });
    expect(snap.state).toBe("COMPLETED");
    expect(snap.source).toBe("ai");
    expect(isQuestionGenerationInFlight(snap.state)).toBe(false);
  });

  it("ignores duplicate START while in-flight", () => {
    let snap = createQuestionGenerationSnapshot();
    snap = reduceQuestionGeneration(snap, {
      type: "START",
      operationId: "op-a",
    });
    const again = reduceQuestionGeneration(snap, {
      type: "START",
      operationId: "op-b",
    });
    expect(again.operationId).toBe("op-a");
    expect(again.state).toBe("PENDING");
  });

  it("cancels in-flight generation", () => {
    let snap = createQuestionGenerationSnapshot();
    snap = reduceQuestionGeneration(snap, {
      type: "START",
      operationId: "op-1",
    });
    snap = reduceQuestionGeneration(snap, { type: "CANCEL" });
    expect(snap.state).toBe("CANCELLED");
  });

  it("records controlled failure", () => {
    let snap = createQuestionGenerationSnapshot();
    snap = reduceQuestionGeneration(snap, {
      type: "START",
      operationId: "op-1",
    });
    snap = reduceQuestionGeneration(snap, {
      type: "FAIL",
      code: "QUESTION_GENERATION_UNAVAILABLE",
    });
    expect(snap.state).toBe("FAILED");
    expect(snap.errorCode).toBe("QUESTION_GENERATION_UNAVAILABLE");
  });
});

describe("mockSessionLifecycle", () => {
  it("transitions ACTIVE → ENDING → ENDED and stays terminal", () => {
    let state = reduceMockSessionLifecycle("ACTIVE", { type: "BEGIN_END" });
    expect(state).toBe("ENDING");
    expect(isMockSessionMutable(state)).toBe(false);

    state = reduceMockSessionLifecycle(state, { type: "CONFIRM_ENDED" });
    expect(state).toBe("ENDED");
    expect(isMockSessionTerminal(state)).toBe(true);

    state = reduceMockSessionLifecycle(state, { type: "BEGIN_END" });
    expect(state).toBe("ENDED");
  });

  it("rejects stale updates after end", () => {
    expect(
      assertMockSessionAllowsUpdate("ENDED", "s1", "s1"),
    ).toBe(false);
    expect(
      assertMockSessionAllowsUpdate("ACTIVE", "s1", "s1"),
    ).toBe(true);
    expect(
      assertMockSessionAllowsUpdate("ACTIVE", "s1", "s2"),
    ).toBe(false);
  });
});

describe("validateGeneratedQuestion", () => {
  it("accepts a valid question for the session", () => {
    const result = validateGeneratedQuestion(
      {
        id: "q1",
        question: "Tell me about a challenging project you led.",
        difficulty: "medium",
        type: "behavioral",
      },
      { sessionId: "sess-1", questionNumber: 1, usedTexts: [] },
    );
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.question.session_id).toBe("sess-1");
      expect(result.question.question_text.length).toBeGreaterThan(8);
    }
  });

  it("rejects empty, duplicate, and wrong-session questions", () => {
    expect(
      validateGeneratedQuestion(
        { question: "Hi" },
        { sessionId: "s", questionNumber: 1, usedTexts: [] },
      ).ok,
    ).toBe(false);

    expect(
      validateGeneratedQuestion(
        { question: "Tell me about a challenging project you led." },
        {
          sessionId: "s",
          questionNumber: 2,
          usedTexts: ["Tell me about a challenging project you led."],
        },
      ).ok,
    ).toBe(false);

    expect(
      validateGeneratedQuestion(
        {
          question: "Describe your leadership style in detail please.",
          session_id: "other",
        },
        { sessionId: "s", questionNumber: 1, usedTexts: [] },
      ).ok,
    ).toBe(false);
  });

  it("parses payload shapes", () => {
    expect(
      validateGeneratedQuestionsPayload({
        questions: [{ question: "A" }],
      }).ok,
    ).toBe(true);
    expect(
      validateGeneratedQuestionsPayload({
        data: { questions: [{ question: "A" }] },
      }).ok,
    ).toBe(true);
    expect(validateGeneratedQuestionsPayload({}).ok).toBe(false);
  });

  it("detects duplicate text", () => {
    expect(
      isDuplicateQuestionText("Hello world", ["hello world"]),
    ).toBe(true);
  });
});

describe("selectFallbackQuestion", () => {
  it("returns an unused approved bank question", () => {
    const first = selectFallbackQuestion({
      type: "behavioural",
      count: 1,
      excludeTexts: [],
    });
    expect(first).not.toBeNull();
    expect(first?.tags).toContain("fallback_bank");

    const second = selectFallbackQuestion({
      type: "behavioural",
      count: 1,
      excludeTexts: [first!.question_text],
    });
    expect(second).not.toBeNull();
    expect(second!.question_text).not.toBe(first!.question_text);
  });
});
