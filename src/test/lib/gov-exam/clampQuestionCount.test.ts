import { describe, expect, it } from "vitest";
import {
  clampGovQuestionCount,
  parseGovQuestionCount,
  GOV_QUESTION_COUNT_ABS_MAX,
} from "@/lib/gov-exam/questionCount";

describe("parseGovQuestionCount (TC-GOV-009)", () => {
  it("accepts valid range", () => {
    expect(parseGovQuestionCount("25", 100)).toEqual({ valid: true, value: 25 });
    expect(parseGovQuestionCount("100", 100)).toEqual({ valid: true, value: 100 });
  });

  it("rejects below min and above max", () => {
    expect(parseGovQuestionCount("4", 100).valid).toBe(false);
    expect(parseGovQuestionCount("101", 100).valid).toBe(false);
  });

  it("rejects scientific notation instead of overflowing", () => {
    expect(parseGovQuestionCount("5e55", 100).valid).toBe(false);
    expect(parseGovQuestionCount("1e2", 100).valid).toBe(false);
  });
});

describe("clampGovQuestionCount (legacy)", () => {
  it("clamps invalid to min", () => {
    expect(clampGovQuestionCount("5e55", GOV_QUESTION_COUNT_ABS_MAX)).toBe(5);
  });
});
