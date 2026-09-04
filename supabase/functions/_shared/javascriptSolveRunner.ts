/**
 * Edge copy of javascriptSolveRunner — keep in sync with src/lib/coding/javascriptSolveRunner.ts
 *
 * Honesty: JavaScript/TypeScript practice execution with soft limits — NOT a secure multi-language sandbox (PARTIAL).
 * Sync wall-clock timeout is cooperative (checked after solve returns); infinite-loop patterns
 * are blocked at compile. True interrupt requires a Worker (browser practice path).
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

/** Per-case wall-clock budget (ms). Sync loops are not truly interruptible without a Worker. */
export const DEFAULT_TIMEOUT_MS = 800;
/** Hard cap on source length accepted for compile/run. */
export const MAX_SOURCE_CHARS = 50_000;
/** Max captured stdout characters retained per case. */
export const MAX_STDOUT_CHARS = 4_000;
/** Max captured stderr characters retained per case. */
export const MAX_STDERR_CHARS = 4_000;
/** Max JSON-serialized actual/expected preview / retained output size. */
export const MAX_OUTPUT_JSON_CHARS = 8_000;

const BLOCKED_PATTERN =
  /\bimport\s+|require\s*\(|fetch\s*\(|XMLHttpRequest|process\.|Deno\./;
const INFINITE_LOOP_PATTERN =
  /\bwhile\s*\(\s*true\s*\)|\bfor\s*\(\s*;\s*;\s*\)|\bwhile\s*\(\s*1\s*\)|\bfor\s*\(\s*;;\s*\)/;

type ConsoleCapture = {
  stdout: string[];
  stderr: string[];
  restore: () => void;
};

function truncateChars(text: string, max: number): string {
  if (text.length <= max) return text;
  return `${text.slice(0, Math.max(0, max - 1))}…`;
}

/** Cap serialized solve() output; oversized results fail closed as runtime errors. */
export function limitSolveOutput(value: unknown): { ok: true; value: unknown } | { ok: false; error: string } {
  try {
    const text = JSON.stringify(value);
    if (typeof text !== "string") {
      return { ok: false, error: "Output is not JSON-serializable." };
    }
    if (text.length > MAX_OUTPUT_JSON_CHARS) {
      return {
        ok: false,
        error: `Output exceeded max size (${MAX_OUTPUT_JSON_CHARS} chars).`,
      };
    }
    return { ok: true, value };
  } catch {
    return { ok: false, error: "Output is not JSON-serializable." };
  }
}

/** Temporarily capture console.log / console.error during a case run. */
export function captureConsole(): ConsoleCapture {
  const stdout: string[] = [];
  const stderr: string[] = [];
  let stdoutLen = 0;
  let stderrLen = 0;
  const prevLog = console.log;
  const prevError = console.error;
  console.log = (...args: unknown[]) => {
    if (stdoutLen >= MAX_STDOUT_CHARS) return;
    const line = args.map((a) => formatConsoleArg(a)).join(" ");
    stdoutLen += line.length + 1;
    stdout.push(line);
  };
  console.error = (...args: unknown[]) => {
    if (stderrLen >= MAX_STDERR_CHARS) return;
    const line = args.map((a) => formatConsoleArg(a)).join(" ");
    stderrLen += line.length + 1;
    stderr.push(line);
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

function joinCapture(lines: string[], maxChars: number): string | undefined {
  const text = truncateChars(lines.join("\n").trim(), maxChars);
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

/**
 * Best-effort TypeScript → JS for practice scoring only.
 * Not a real TypeScript compiler — complex generics/enums may fail closed at compile.
 */
export function stripTypescriptForPractice(source: string): string {
  let s = String(source ?? "");
  s = s.replace(/^\s*import\s+type\s+[\s\S]*?;\s*$/gm, "");
  s = s.replace(/\bexport\s+type\s+[^=\n]+=\s*[^;]+;\s*/g, "");
  s = s.replace(/\binterface\s+[A-Za-z_][\w]*\s*\{[\s\S]*?\}\s*/g, "");
  s = s.replace(/\bas\s+const\b/g, "");
  s = s.replace(/\bas\s+[A-Za-z_][\w.<>,\s|&[\]]*/g, "");
  // Return type on function declarations / arrows: ) : Type {
  s = s.replace(/\)\s*:\s*[A-Za-z_][\w.<>,\s|&[\]]*\s*\{/g, ") {");
  s = s.replace(/\)\s*:\s*[A-Za-z_][\w.<>,\s|&[\]]*\s*=>/g, ") =>");
  // Parameter / variable annotations: name: Type
  s = s.replace(/([,(]\s*[A-Za-z_][\w]*)\s*:\s*[A-Za-z_][\w.<>,\s|&[\]]*(?=\s*[,)=])/g, "$1");
  s = s.replace(/\b(const|let|var)\s+([A-Za-z_][\w]*)\s*:\s*[A-Za-z_][\w.<>,\s|&[\]]*/g, "$1 $2");
  return s;
}

/** Prepare source for the practice runner (JS as-is; TS stripped best-effort). */
export function preparePracticeSource(source: string, language = "javascript"): string {
  const lang = String(language ?? "javascript").trim().toLowerCase();
  if (lang === "typescript" || lang === "ts") {
    return stripTypescriptForPractice(source);
  }
  return source;
}

export function compileJavascriptSolve(
  source: string,
  language = "javascript",
): { ok: true; solve: (input: unknown) => unknown } | { ok: false; error: string } {
  const prepared = preparePracticeSource(source, language);
  const trimmed = typeof prepared === "string" ? prepared.trim() : "";
  if (!trimmed) {
    return { ok: false, error: "No source to run." };
  }
  if (trimmed.length > MAX_SOURCE_CHARS) {
    return {
      ok: false,
      error: `Source exceeds max length (${MAX_SOURCE_CHARS} chars).`,
    };
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
  /** Cooperative deadline — checked after solve returns (sync). Worker path can hard-interrupt. */
  deadlineAt: number;
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
    if (Date.now() > ctx.deadlineAt) {
      sawTimeout = true;
      return {
        sawRuntime,
        sawTimeout,
        result: {
          id: testCase.id,
          name: testCase.name,
          passed: false,
          error: "Timed out.",
          error_kind: "timeout",
          input_preview: inputPreview,
          stdout: joinCapture(capture.stdout, MAX_STDOUT_CHARS),
          stderr: joinCapture(capture.stderr, MAX_STDERR_CHARS),
        },
      };
    }

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
          stdout: joinCapture(capture.stdout, MAX_STDOUT_CHARS),
          stderr: joinCapture(capture.stderr, MAX_STDERR_CHARS),
        },
      };
    }
    if (Date.now() - started > ctx.timeoutMs || Date.now() > ctx.deadlineAt) {
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
          stdout: joinCapture(capture.stdout, MAX_STDOUT_CHARS),
          stderr: joinCapture(capture.stderr, MAX_STDERR_CHARS),
        },
      };
    }

    const limited = limitSolveOutput(raw);
    if (!limited.ok) {
      sawRuntime = true;
      return {
        sawRuntime,
        sawTimeout,
        result: {
          id: testCase.id,
          name: testCase.name,
          passed: false,
          error: limited.error,
          error_kind: "runtime",
          input_preview: inputPreview,
          stdout: joinCapture(capture.stdout, MAX_STDOUT_CHARS),
          stderr: joinCapture(capture.stderr, MAX_STDERR_CHARS),
        },
      };
    }

    let passed = false;
    try {
      passed = stableJsonEqual(limited.value, expected);
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
          actual: limited.value,
          error: message,
          error_kind: "compare",
          input_preview: inputPreview,
          stdout: joinCapture(capture.stdout, MAX_STDOUT_CHARS),
          stderr: joinCapture(capture.stderr, MAX_STDERR_CHARS),
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
        actual: limited.value,
        input_preview: inputPreview,
        stdout: joinCapture(capture.stdout, MAX_STDOUT_CHARS),
        stderr: joinCapture(capture.stderr, MAX_STDERR_CHARS),
        ...(passed
          ? {}
          : {
              error: `Expected ${previewSolveValue(expected)}, got ${previewSolveValue(limited.value)}`,
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
        stdout: joinCapture(capture.stdout, MAX_STDOUT_CHARS),
        stderr: joinCapture(capture.stderr, MAX_STDERR_CHARS),
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
  language = "javascript",
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

  const compiled = compileJavascriptSolve(source, language);
  if (!compiled.ok) {
    const compileError = (compiled as { error: string }).error;
    const isBlocked = compileError.includes("not allowed");
    const isTimeout = /timed out/i.test(compileError);
    return {
      ok: false,
      results: [],
      execution_status: isBlocked ? "blocked" : isTimeout ? "compile_error" : "compile_error",
      blockedReason: compileError,
      primary_error: compileError,
    };
  }

  let sawRuntime = false;
  let sawTimeout = false;
  let primaryError: string | undefined;
  const perCaseMs = Math.max(1, timeoutMs);
  const runDeadline = Date.now() + perCaseMs * cases.length + 50;
  const ctx: RunCaseContext = {
    solve: (compiled as { solve: (input: unknown) => unknown }).solve,
    timeoutMs: perCaseMs,
    deadlineAt: runDeadline,
  };

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
