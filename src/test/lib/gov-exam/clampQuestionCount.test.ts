import { describe, expect, it } from "vitest";
import {
  clampGovQuestionCount,
  parseGovQuestionCount,
  syncQuestionCountForBasis,
  GOV_QUESTION_COUNT_ABS_MAX,
  GOV_QUESTION_COUNT_CUSTOM_DEFAULT,
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

describe("syncQuestionCountForBasis (TC-GOV-009)", () => {
  it("locks Full Mock / exact bases to the pattern total", () => {
    expect(syncQuestionCountForBasis("full_sim", 100, "25")).toEqual({
      count: 100,
      input: "100",
    });
    expect(syncQuestionCountForBasis("hybrid", 80, "25")).toEqual({
      count: 80,
      input: "80",
    });
    expect(syncQuestionCountForBasis("official_previous", 150, "40")).toEqual({
      count: 150,
      input: "150",
    });
  });

  it("falls back to 100 when the pattern total is missing", () => {
    expect(syncQuestionCountForBasis("full_sim", null, "25")).toEqual({
      count: 100,
      input: "100",
    });
    expect(syncQuestionCountForBasis("full_sim", undefined, "25")).toEqual({
      count: 100,
      input: "100",
    });
  });

  it("resets Custom / quick / topic to 25 when input still equals the full-mock total", () => {
    expect(syncQuestionCountForBasis("latest_pattern", 100, "100")).toEqual({
      count: GOV_QUESTION_COUNT_CUSTOM_DEFAULT,
      input: "25",
    });
    expect(syncQuestionCountForBasis("quick", 100, "100")).toEqual({
      count: 25,
      input: "25",
    });
    expect(syncQuestionCountForBasis("topic", 100, "100")).toEqual({
      count: 25,
      input: "25",
    });
    expect(syncQuestionCountForBasis("latest_pattern", null, "100")).toEqual({
      count: 25,
      input: "25",
    });
  });

  it("does not clobber a user-chosen custom count", () => {
    expect(syncQuestionCountForBasis("latest_pattern", 100, "40")).toEqual({
      count: 40,
      input: "40",
    });
    expect(syncQuestionCountForBasis("topic", 100, "20")).toEqual({
      count: 20,
      input: "20",
    });
    expect(syncQuestionCountForBasis("quick", 80, "30")).toEqual({
      count: 30,
      input: "30",
    });
  });

  it("clamps the custom default within min/max when the pattern is small", () => {
    expect(syncQuestionCountForBasis("latest_pattern", 10, "10")).toEqual({
      count: 10,
      input: "10",
    });
  });

  it("resets invalid custom input to the default", () => {
    expect(syncQuestionCountForBasis("latest_pattern", 100, "abc")).toEqual({
      count: 25,
      input: "25",
    });
  });
});
