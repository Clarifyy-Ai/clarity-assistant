import { describe, expect, it } from "vitest";
import {
  countAnswerStates,
  deriveAnswerStatus,
  findInvalidAnswerIndex,
  initAnswerSlots,
  packPracticeAnswers,
  safeTrim,
} from "@/lib/practice/workspaceAnswers";

describe("practice workspace answer helpers", () => {
  it("never trims undefined/null", () => {
    expect(safeTrim(undefined)).toBe("");
    expect(safeTrim(null)).toBe("");
    expect(safeTrim(12)).toBe("");
    expect(safeTrim("  hi  ")).toBe("hi");
  });

  it("init slots are dense (no holes)", () => {
    const slots = initAnswerSlots(3);
    expect(slots.answers).toEqual(["", "", ""]);
    expect(slots.skipped).toEqual([false, false, false]);
    expect(findInvalidAnswerIndex(slots.answers, slots.skipped)).toBe(-1);
  });

  it("finish validation tolerates sparse historical arrays", () => {
    const answers = [] as string[];
    answers[2] = "short";
    const skipped = [] as boolean[];
    expect(() => findInvalidAnswerIndex(answers, skipped)).not.toThrow();
    expect(findInvalidAnswerIndex(answers, skipped)).toBe(2);
  });

  it("pack maps skipped and unanswered distinctly", () => {
    const packed = packPracticeAnswers(
      [{ question: "Q1" }, { question: "Q2" }, { question: "Q3" }],
      ["", "This is a long enough answer for scoring.", "no"],
      [true, false, false],
    );
    expect(packed[0]?.status).toBe("skipped");
    expect(packed[1]?.status).toBe("answered");
    expect(packed[2]?.status).toBe("invalid");
  });

  it("counts answer states", () => {
    expect(
      countAnswerStates(3, ["", "long enough answer here", ""], [true, false, false]),
    ).toEqual({ answered: 1, skipped: 1, unanswered: 1, invalid: 0 });
  });

  it("deriveAnswerStatus treats skip as first-class", () => {
    expect(deriveAnswerStatus("anything", true)).toBe("skipped");
    expect(deriveAnswerStatus("", false)).toBe("unanswered");
  });
});
