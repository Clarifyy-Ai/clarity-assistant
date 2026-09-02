/**
 * Shared JavaScript solve(input) runner for Coding Lab (client practice + edge scoring).
 * Contract: user code defines solve(input) and returns a JSON-serializable value synchronously.
 */

export type SolveTestCase = {
  id: string;
  name: string;
  input: unknown;
  expected: unknown;
};

export type SolveCaseResult = {
  id: string;
  name: string;
  passed: boolean;
  actual?: unknown;
  error?: string;
  error_kind?: "runtime" | "wrong_answer" | "timeout" | "compare";
  input_preview?: string;
  stdout?: string;
  stderr?: string;
};

export type SolveExecutionStatus =
  | "passed"
  | "failed"
  | "compile_error"
  | "runtime_error"
  | "timeout"
  | "blocked"
  | "service_error";

export type SolveRunOutcome = {
  ok: boolean;
  results: SolveCaseResult[];
  execution_status: SolveExecutionStatus;
  blockedReason?: string;
  primary_error?: string;
};

const DEFAULT_TIMEOUT_MS = 800;

const BLOCKED_PATTERN =
  /\bimport\s+|require\s*\(|fetch\s*\(|XMLHttpRequest|process\.|Deno\./;
const INFINITE_LOOP_PATTERN = /\bwhile\s*\(\s*true\s*\)|\bfor\s*\(\s*;\s*;\s*\)/;

type ConsoleCapture = {
  stdout: string[];
  stderr: string[];
  restore: () => void;
};

/** Temporarily capture console.log / console.error during a case run. */
export function captureConsole(): ConsoleCapture {
  const stdout: string[] = [];
  const stderr: string[] = [];
  const prevLog = console.log;
  const prevError = console.error;
  console.log = (...args: unknown[]) => {
    stdout.push(args.map((a) => formatConsoleArg(a)).join(" "));
  };
  console.error = (...args: unknown[]) => {
    stderr.push(args.map((a) => formatConsoleArg(a)).join(" "));
  };
  return {
    stdout,
    stderr,
    restore: () => {
      console.log = prevLog;
      console.error = prevError;
    },
  };
}

function formatConsoleArg(value: unknown): string {
  if (typeof value === "string") return value;
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

function joinCapture(lines: string[]): string | undefined {
  const text = lines.join("\n").trim();
  return text || undefined;
}

/** Parse JSON-looking strings from legacy/double-encoded test case rows. */
export function normalizeSolveValue(value: unknown): unknown {
  if (typeof value !== "string") return value;
  const trimmed = value.trim();
  if (!trimmed) return value;
  if (
    (trimmed.startsWith("[") && trimmed.endsWith("]")) ||
    (trimmed.startsWith("{") && trimmed.endsWith("}")) ||
    trimmed === "null" ||
    /^-?\d+(\.\d+)?([eE][+-]?\d+)?$/.test(trimmed) ||
    trimmed === "true" ||
    trimmed === "false"
  ) {
    try {
      return JSON.parse(trimmed);
    } catch {
      return value;
    }
  }
  return value;
}

export function previewSolveValue(value: unknown, maxLen = 80): string {
  try {
    const text = JSON.stringify(value);
    if (typeof text === "string" && text.length <= maxLen) return text;
    if (typeof text === "string") return `${text.slice(0, maxLen - 1)}…`;
  } catch {
    // fall through
  }
  return String(value);
}

export function stableJsonEqual(actual: unknown, expected: unknown): boolean {
  try {
    return JSON.stringify(actual) === JSON.stringify(expected);
  } catch (error) {
    throw error instanceof Error ? error : new Error("Could not compare outputs.");
  }
}

export function compileJavascriptSolve(
  source: string,
): { ok: true; solve: (input: unknown) => unknown } | { ok: false; error: string } {
  const trimmed = typeof source === "string" ? source.trim() : "";
  if (!trimmed) {
    return { ok: false, error: "No source to run." };
  }
  if (INFINITE_LOOP_PATTERN.test(trimmed)) {
    return { ok: false, error: "Execution timed out." };
  }
  if (BLOCKED_PATTERN.test(trimmed)) {
    return {
      ok: false,
      error: "Network, imports, and host APIs are not allowed.",
    };
  }

  try {
    // eslint-disable-next-line no-new-func
    const factory = new Function(
      `${trimmed}\n;return (typeof solve === "function" ? solve : null);`,
    );
    const solve = factory();
    if (typeof solve === "function") {
      return { ok: true, solve: solve as (input: unknown) => unknown };
    }
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : "Could not compile.",
    };
  }

  return {
    ok: false,
    error: 'Define solve(input). Example: function solve(input) { return input; }',
  };
}

type RunCaseContext = {
  solve: (input: unknown) => unknown;
  timeoutMs: number;
};

function runSingleCase(
  testCase: SolveTestCase,
  ctx: RunCaseContext,
): { result: SolveCaseResult; sawRuntime: boolean; sawTimeout: boolean } {
  const input = normalizeSolveValue(testCase.input);
  const expected = normalizeSolveValue(testCase.expected);
  const inputPreview = previewSolveValue(input);
  const capture = captureConsole();
  const started = Date.now();
  let sawRuntime = false;
  let sawTimeout = false;

  try {
    const raw = ctx.solve(input);
    if (raw instanceof Promise) {
      sawRuntime = true;
      const message =
        "solve() must return synchronously (returned a Promise). Remove async/await.";
      return {
        sawRuntime,
        sawTimeout,
        result: {
          id: testCase.id,
          name: testCase.name,
          passed: false,
          error: message,
          error_kind: "runtime",
          input_preview: inputPreview,
          stdout: joinCapture(capture.stdout),
          stderr: joinCapture(capture.stderr),
        },
      };
    }
    if (Date.now() - started > ctx.timeoutMs) {
      sawTimeout = true;
      const message = "Timed out.";
      return {
        sawRuntime,
        sawTimeout,
        result: {
          id: testCase.id,
          name: testCase.name,
          passed: false,
          error: message,
          error_kind: "timeout",
          input_preview: inputPreview,
          stdout: joinCapture(capture.stdout),
          stderr: joinCapture(capture.stderr),
        },
      };
    }
    let passed = false;
    try {
      passed = stableJsonEqual(raw, expected);
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Could not compare outputs.";
      sawRuntime = true;
      return {
        sawRuntime,
        sawTimeout,
        result: {
          id: testCase.id,
          name: testCase.name,
          passed: false,
          actual: raw,
          error: message,
          error_kind: "compare",
          input_preview: inputPreview,
          stdout: joinCapture(capture.stdout),
          stderr: joinCapture(capture.stderr),
        },
      };
    }
    return {
      sawRuntime,
      sawTimeout,
      result: {
        id: testCase.id,
        name: testCase.name,
        passed,
        actual: raw,
        input_preview: inputPreview,
        stdout: joinCapture(capture.stdout),
        stderr: joinCapture(capture.stderr),
        ...(passed
          ? {}
          : {
              error: `Expected ${previewSolveValue(expected)}, got ${previewSolveValue(raw)}`,
              error_kind: "wrong_answer" as const,
            }),
      },
    };
  } catch (error) {
    sawRuntime = true;
    const message = error instanceof Error ? error.message : "Runtime error";
    return {
      sawRuntime,
      sawTimeout,
      result: {
        id: testCase.id,
        name: testCase.name,
        passed: false,
        error: message,
        error_kind: "runtime",
        input_preview: inputPreview,
        stdout: joinCapture(capture.stdout),
        stderr: joinCapture(capture.stderr),
      },
    };
  } finally {
    capture.restore();
  }
}

export function runJavascriptSolveTests(
  source: string,
  cases: SolveTestCase[],
  timeoutMs = DEFAULT_TIMEOUT_MS,
): SolveRunOutcome {
  if (!Array.isArray(cases) || cases.length === 0) {
    return {
      ok: false,
      results: [],
      execution_status: "service_error",
      blockedReason: "No test cases were available to run.",
      primary_error: "No test cases were available to run.",
    };
  }

  const compiled = compileJavascriptSolve(source);
  if (!compiled.ok) {
    const isBlocked = compiled.error.includes("not allowed");
    return {
      ok: false,
      results: [],
      execution_status: isBlocked ? "blocked" : "compile_error",
      blockedReason: compiled.error,
      primary_error: compiled.error,
    };
  }

  let sawRuntime = false;
  let sawTimeout = false;
  let primaryError: string | undefined;
  const ctx: RunCaseContext = { solve: compiled.solve, timeoutMs };

  const results: SolveCaseResult[] = cases.map((testCase) => {
    const outcome = runSingleCase(testCase, ctx);
    if (outcome.sawRuntime) sawRuntime = true;
    if (outcome.sawTimeout) sawTimeout = true;
    if (!outcome.result.passed && !primaryError && outcome.result.error) {
      primaryError = `${outcome.result.name}: ${outcome.result.error}${
        outcome.result.input_preview ? ` (input ${outcome.result.input_preview})` : ""
      }`;
    }
    return outcome.result;
  });

  const allPassed = results.every((r) => r.passed);
  const execution_status: SolveExecutionStatus = sawTimeout
    ? "timeout"
    : sawRuntime
      ? "runtime_error"
      : allPassed
        ? "passed"
        : "failed";

  if (!primaryError) {
    const firstFail = results.find((r) => !r.passed);
    if (firstFail?.error) {
      primaryError = `${firstFail.name}: ${firstFail.error}${
        firstFail.input_preview ? ` (input ${firstFail.input_preview})` : ""
      }`;
    }
  }

  return {
    ok: allPassed,
    results,
    execution_status,
    primary_error: primaryError,
  };
}

/** Canonical reference solution for seeded "Sum the numbers" assessment. */
export const SUM_NUMBERS_REFERENCE_SOLVE = `function solve(input) {
  const nums = Array.isArray(input) ? input : [];
  return nums.reduce((sum, n) => sum + n, 0);
}
`;
