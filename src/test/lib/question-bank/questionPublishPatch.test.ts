import { describe, expect, it } from "vitest";
import {
  assertPublishableForTrigger,
  buildQuestionApprovePatch,
  buildQuestionPublishPatch,
  type PublishableQuestionRow,
} from "@/lib/question-bank/questionPublishPatch";

const readyMcq: PublishableQuestionRow = {
  question_text: "What is 2 + 2?",
  question_type: "MCQ",
  options: [
    { label: "A", text: "Three" },
    { label: "B", text: "Four" },
    { label: "C", text: "Five" },
    { label: "D", text: "Six" },
  ],
  correct_answer: "B",
  explanation: "Basic arithmetic.",
  difficulty: "EASY",
  subject: "Math",
  topic: "Arithmetic",
  license_type: "ORIGINAL",
};

describe("buildQuestionApprovePatch", () => {
  it("sets verify and validation fields required for publish trigger", () => {
    expect(buildQuestionApprovePatch()).toEqual({
      review_status: "approved",
      is_verified: true,
      validation_status: "valid",
    });
  });
});

describe("buildQuestionPublishPatch", () => {
  it("builds full admin publish patch matching validate_question_publication", () => {
    const result = buildQuestionPublishPatch({
      targetStatus: "published",
      isAdmin: true,
    });
    expect(result).toEqual({
      ok: true,
      patch: {
        publish_status: "published",
        is_public: true,
        review_status: "approved",
        is_verified: true,
        validation_status: "valid",
      },
    });
  });

  it("rejects non-admin publish without self-approving fields", () => {
    const result = buildQuestionPublishPatch({
      targetStatus: "published",
      isAdmin: false,
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toMatch(/admin/i);
    }
  });

  it("unpublish and archive only clear public status", () => {
    expect(
      buildQuestionPublishPatch({ targetStatus: "draft", isAdmin: false }),
    ).toEqual({
      ok: true,
      patch: { publish_status: "draft", is_public: false },
    });
    expect(
      buildQuestionPublishPatch({ targetStatus: "archived", isAdmin: true }),
    ).toEqual({
      ok: true,
      patch: { publish_status: "archived", is_public: false },
    });
  });

  it("duplicate admin publish requests produce the same idempotent patch", () => {
    const a = buildQuestionPublishPatch({ targetStatus: "published", isAdmin: true });
    const b = buildQuestionPublishPatch({ targetStatus: "published", isAdmin: true });
    expect(a).toEqual(b);
  });
});

describe("assertPublishableForTrigger", () => {
  it("accepts a complete MCQ row", () => {
    expect(assertPublishableForTrigger(readyMcq)).toBeNull();
  });

  it("rejects UNKNOWN license", () => {
    expect(
      assertPublishableForTrigger({ ...readyMcq, license_type: "UNKNOWN" }),
    ).toMatch(/UNKNOWN/i);
  });

  it("rejects MCQ with fewer than four options", () => {
    expect(
      assertPublishableForTrigger({
        ...readyMcq,
        options: [
          { label: "A", text: "One" },
          { label: "B", text: "Two" },
        ],
      }),
    ).toMatch(/exactly four/i);
  });

  it("rejects missing subject/topic/difficulty", () => {
    expect(
      assertPublishableForTrigger({ ...readyMcq, topic: "", difficulty: "HARD" }),
    ).toMatch(/Subject, topic/i);
  });

  it("rejects invalid correct answer", () => {
    expect(
      assertPublishableForTrigger({ ...readyMcq, correct_answer: "E" }),
    ).toMatch(/Correct answer/i);
  });
});
