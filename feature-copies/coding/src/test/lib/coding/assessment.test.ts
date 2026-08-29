import { describe, expect, it } from "vitest";
import {
  assertNoHiddenCasesExposed,
  remainingSubmissions,
  scoreJavascriptSolve,
  stripHiddenTestCases,
} from "@/lib/coding/assessment";

const cases = [
  { id: "visible", name: "sample", input: [2, 3], expected: 5, is_hidden: false },
  { id: "hidden", name: "secret", input: [9, 1], expected: 10, is_hidden: true },
];

describe("coding assessment contracts", () => {
  it("keeps hidden cases out of the client-visible sample list", () => {
    expect(stripHiddenTestCases(cases)).toEqual([
      { id: "visible", name: "sample", input: [2, 3], expected: 5 },
    ]);
    expect(assertNoHiddenCasesExposed(stripHiddenTestCases(cases))).toBe(true);
  });

  it("uses bounded remaining submission math", () => {
    expect(remainingSubmissions(3, 5)).toBe(2);
    expect(remainingSubmissions(6, 5)).toBe(0);
  });

  it("scores the submitted solve function against authoritative cases", () => {
    expect(
      scoreJavascriptSolve("function solve(input) { return input[0] + input[1]; }", cases),
    ).toMatchObject({
      passed_tests: 2,
      failed_tests: 0,
      score: 100,
      execution_status: "passed",
    });
  });
});
