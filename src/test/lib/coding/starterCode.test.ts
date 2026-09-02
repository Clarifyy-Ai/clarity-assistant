import { describe, expect, it } from "vitest";
import {
  IMMUTABLE_SOLVE_STARTER,
  resolveJavascriptSolveStarter,
} from "@/lib/coding/starterCode";
import { runJavascriptSolveTests } from "@/lib/coding/javascriptSolveRunner";

const SAMPLE_CASE = [
  { id: "s1", name: "sample", input: [1, 2, 3], expected: 6 },
];

describe("resolveJavascriptSolveStarter", () => {
  it("replaces empty or invalid starters with the identity template", () => {
    expect(resolveJavascriptSolveStarter("")).toBe(IMMUTABLE_SOLVE_STARTER);
    expect(resolveJavascriptSolveStarter("console.log(1)")).toBe(IMMUTABLE_SOLVE_STARTER);
  });

  it("rewrites reduce-without-initial-value starters so sample runs do not throw", () => {
    const unsafe = "function solve(input) { return input.reduce((a,b)=>a+b); }\n";
    expect(resolveJavascriptSolveStarter(unsafe)).toBe(IMMUTABLE_SOLVE_STARTER);
  });

  it("keeps empty-array-safe reduce starters", () => {
    const safe =
      "function solve(input) {\n  const nums = Array.isArray(input) ? input : [];\n  return nums.reduce((sum, n) => sum + n, 0);\n}\n";
    expect(resolveJavascriptSolveStarter(safe)).toBe(safe);
  });

  it("default starter compiles and runs without throwing on sample input", () => {
    const starter = resolveJavascriptSolveStarter(undefined);
    const outcome = runJavascriptSolveTests(starter, SAMPLE_CASE);
    expect(outcome.execution_status).not.toBe("compile_error");
    expect(outcome.execution_status).not.toBe("runtime_error");
  });
});
