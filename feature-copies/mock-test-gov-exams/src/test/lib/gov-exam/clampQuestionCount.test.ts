import { describe, expect, it } from "vitest";

const QUESTION_COUNT_MIN = 5;
const QUESTION_COUNT_ABS_MAX = 100;

/** Mirrors GenerateGovPaper clampQuestionCount for regression (TC-GOV-009). */
function clampQuestionCount(raw: unknown, max: number): number {
  if (typeof raw === "string") {
    const trimmed = raw.trim();
    if (!trimmed || /[eE.+-]/.test(trimmed)) return QUESTION_COUNT_MIN;
    const n = Number.parseInt(trimmed, 10);
    if (!Number.isFinite(n)) return QUESTION_COUNT_MIN;
    return Math.min(Math.max(QUESTION_COUNT_MIN, n), Math.max(QUESTION_COUNT_MIN, max));
  }
  const n = typeof raw === "number" ? raw : Number(raw);
  if (!Number.isFinite(n) || !Number.isInteger(n)) return QUESTION_COUNT_MIN;
  return Math.min(Math.max(QUESTION_COUNT_MIN, Math.floor(n)), Math.max(QUESTION_COUNT_MIN, max));
}

describe("clampQuestionCount (TC-GOV-009)", () => {
  it("clamps below min and above max", () => {
    expect(clampQuestionCount("1", 100)).toBe(5);
    expect(clampQuestionCount("999", 100)).toBe(100);
    expect(clampQuestionCount(25, 100)).toBe(25);
  });

  it("rejects scientific notation instead of overflowing", () => {
    expect(clampQuestionCount("5e55", 100)).toBe(5);
    expect(clampQuestionCount("1e2", 100)).toBe(5);
  });
});
