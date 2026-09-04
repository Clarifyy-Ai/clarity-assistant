import { describe, expect, it } from "vitest";
import {
  DEFAULT_TIMEOUT_MS,
  MAX_OUTPUT_JSON_CHARS,
  MAX_SOURCE_CHARS,
  MAX_STDERR_CHARS,
  MAX_STDOUT_CHARS,
  SUM_NUMBERS_REFERENCE_SOLVE,
  limitSolveOutput,
  normalizeSolveValue,
  runJavascriptSolveTests,
} from "@/lib/coding/javascriptSolveRunner";
import { formatCodingExecutionSummary } from "@/lib/coding/sampleResult";

const SUM_CASES = [
  { id: "sample-1", name: "sample-1", input: [1, 2, 3], expected: 6 },
  { id: "sample-2", name: "sample-2", input: [], expected: 0 },
];

describe("javascriptSolveRunner contracts", () => {
  it("exports clear timeout and output limits", () => {
    expect(DEFAULT_TIMEOUT_MS).toBe(800);
    expect(MAX_SOURCE_CHARS).toBe(50_000);
    expect(MAX_STDOUT_CHARS).toBe(4_000);
    expect(MAX_STDERR_CHARS).toBe(4_000);
    expect(MAX_OUTPUT_JSON_CHARS).toBe(8_000);
  });

  it("passes the provided Sum the numbers reference solution", () => {
    const outcome = runJavascriptSolveTests(SUM_NUMBERS_REFERENCE_SOLVE, SUM_CASES);
    expect(outcome.execution_status).toBe("passed");
    expect(outcome.ok).toBe(true);
    expect(outcome.results.every((r) => r.passed)).toBe(true);
  });

  it("passes multi-case execution with two-number sum stub", () => {
    const outcome = runJavascriptSolveTests(
      "function solve(input) { return input[0] + input[1]; }",
      [
        { id: "a", name: "sample", input: [2, 3], expected: 5 },
        { id: "b", name: "hidden", input: [9, 1], expected: 10 },
      ],
    );
    expect(outcome.execution_status).toBe("passed");
    expect(outcome.results).toHaveLength(2);
  });

  it("normalizes JSON string inputs from legacy rows", () => {
    const outcome = runJavascriptSolveTests(SUM_NUMBERS_REFERENCE_SOLVE, [
      { id: "legacy", name: "legacy", input: "[1,2,3]", expected: "6" },
    ]);
    expect(outcome.execution_status).toBe("passed");
    expect(normalizeSolveValue("[1,2,3]")).toEqual([1, 2, 3]);
    expect(normalizeSolveValue("6")).toBe(6);
  });

  it("reports syntax errors as compile_error", () => {
    const outcome = runJavascriptSolveTests("function solve(input) { return", SUM_CASES);
    expect(outcome.execution_status).toBe("compile_error");
    expect(outcome.primary_error).toMatch(/compile|Unexpected/i);
  });

  it("reports runtime exceptions with case input context", () => {
    const outcome = runJavascriptSolveTests(
      "function solve(input) { return input.reduce((a,b)=>a+b); }",
      SUM_CASES,
    );
    expect(outcome.execution_status).toBe("runtime_error");
    expect(outcome.primary_error).toMatch(/sample-2/i);
    expect(outcome.primary_error).toMatch(/empty array|initial value/i);
  });

  it("flags infinite loops as timeout", () => {
    const outcome = runJavascriptSolveTests("function solve(input) { while(true){} }", SUM_CASES);
    expect(outcome.execution_status).toBe("compile_error");
    expect(outcome.blockedReason).toMatch(/timed out/i);
  });

  it("handles large but serializable output within the max", () => {
    const big = Array.from({ length: 500 }, (_, i) => i);
    const outcome = runJavascriptSolveTests("function solve(input) { return input; }", [
      { id: "big", name: "big", input: big, expected: big },
    ]);
    expect(outcome.execution_status).toBe("passed");
  });

  it("fail-closes when solve() output exceeds MAX_OUTPUT_JSON_CHARS", () => {
    const oversized = "x".repeat(MAX_OUTPUT_JSON_CHARS + 10);
    expect(limitSolveOutput(oversized).ok).toBe(false);
    const outcome = runJavascriptSolveTests(
      `function solve(input) { return ${JSON.stringify(oversized)}; }`,
      [{ id: "huge", name: "huge", input: null, expected: null }],
    );
    expect(outcome.execution_status).toBe("runtime_error");
    expect(outcome.primary_error).toMatch(/max size/i);
  });

  it("rejects source longer than MAX_SOURCE_CHARS", () => {
    const huge = `function solve(input) { return ${JSON.stringify("y".repeat(MAX_SOURCE_CHARS))}; }`;
    const outcome = runJavascriptSolveTests(huge, SUM_CASES);
    expect(outcome.execution_status).toBe("compile_error");
    expect(outcome.primary_error).toMatch(/max length/i);
  });

  it("maps empty test inventory to service_error", () => {
    const outcome = runJavascriptSolveTests(SUM_NUMBERS_REFERENCE_SOLVE, []);
    expect(outcome.execution_status).toBe("service_error");
    expect(formatCodingExecutionSummary({ execution_status: "service_error", message: outcome.primary_error })).toMatch(
      /temporarily unavailable|No test cases/i,
    );
  });

  it("identity starter is a wrong answer, not a runtime error", () => {
    const outcome = runJavascriptSolveTests(
      "function solve(input) { return input; }",
      SUM_CASES,
    );
    expect(outcome.execution_status).toBe("failed");
    expect(outcome.primary_error).toMatch(/Expected 6, got/i);
  });

  it("captures stdout and stderr without affecting pass/fail", () => {
    const outcome = runJavascriptSolveTests(
      `function solve(input) {
        console.log("debug", input);
        console.error("warn");
        const nums = Array.isArray(input) ? input : [];
        return nums.reduce((sum, n) => sum + n, 0);
      }`,
      SUM_CASES,
    );
    expect(outcome.execution_status).toBe("passed");
    expect(outcome.results[0]?.stdout).toMatch(/debug/);
    expect(outcome.results[0]?.stderr).toMatch(/warn/);
  });
});
