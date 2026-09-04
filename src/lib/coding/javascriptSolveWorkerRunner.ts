/**
 * Browser-only async runner with Web Worker timeout interrupt for practice runs.
 */

import {
  DEFAULT_TIMEOUT_MS,
  MAX_STDERR_CHARS,
  MAX_STDOUT_CHARS,
  compileJavascriptSolve,
  limitSolveOutput,
  normalizeSolveValue,
  previewSolveValue,
  runJavascriptSolveTests,
  stableJsonEqual,
  type SolveRunOutcome,
  type SolveTestCase,
} from "@/lib/coding/javascriptSolveRunner";

const WORKER_SOURCE = `
self.onmessage = (event) => {
  const { source, input, timeoutMs } = event.data;
  const blocked = /\\bimport\\s+|require\\s*\\(|fetch\\s*\\(|XMLHttpRequest|process\\.|Deno\\./;
  const infinite = /\\bwhile\\s*\\(\\s*true\\s*\\)|\\bfor\\s*\\(\\s*;\\s*;\\s*\\)/;
  if (infinite.test(source)) {
    self.postMessage({ ok: false, error: "Execution timed out.", error_kind: "timeout" });
    return;
  }
  if (blocked.test(source)) {
    self.postMessage({ ok: false, error: "Network, imports, and host APIs are not allowed.", error_kind: "blocked" });
    return;
  }
  const stdout = [];
  const stderr = [];
  const prevLog = console.log;
  const prevError = console.error;
  console.log = (...args) => stdout.push(args.map(String).join(" "));
  console.error = (...args) => stderr.push(args.map(String).join(" "));
  const started = Date.now();
  try {
    const factory = new Function(source + "\\n;return (typeof solve === 'function' ? solve : null);");
    const solve = factory();
    if (typeof solve !== "function") {
      self.postMessage({ ok: false, error: "Define solve(input).", error_kind: "compile" });
      return;
    }
    const raw = solve(input);
    if (raw instanceof Promise) {
      self.postMessage({ ok: false, error: "solve() must return synchronously.", error_kind: "runtime", stdout, stderr });
      return;
    }
    if (Date.now() - started > timeoutMs) {
      self.postMessage({ ok: false, error: "Timed out.", error_kind: "timeout", stdout, stderr });
      return;
    }
    self.postMessage({ ok: true, actual: raw, stdout, stderr });
  } catch (error) {
    self.postMessage({
      ok: false,
      error: error && error.message ? error.message : "Runtime error",
      error_kind: "runtime",
      stdout,
      stderr,
    });
  } finally {
    console.log = prevLog;
    console.error = prevError;
  }
};
`;

function createWorker(): Worker | null {
  if (typeof Worker === "undefined" || typeof URL === "undefined" || typeof Blob === "undefined") {
    return null;
  }
  try {
    const blob = new Blob([WORKER_SOURCE], { type: "application/javascript" });
    return new Worker(URL.createObjectURL(blob));
  } catch {
    return null;
  }
}

type WorkerCaseOutcome = {
  ok: boolean;
  actual?: unknown;
  error?: string;
  error_kind?: string;
  stdout?: string[];
  stderr?: string[];
};

function runCaseInWorker(
  source: string,
  input: unknown,
  timeoutMs: number,
): Promise<WorkerCaseOutcome> {
  const worker = createWorker();
  if (!worker) {
    return Promise.resolve({ ok: false, error: "Worker unavailable", error_kind: "service" });
  }

  return new Promise((resolve) => {
    let settled = false;
    const finish = (outcome: WorkerCaseOutcome) => {
      if (settled) return;
      settled = true;
      worker.terminate();
      resolve(outcome);
    };

    const timer = window.setTimeout(() => {
      finish({ ok: false, error: "Timed out.", error_kind: "timeout" });
    }, timeoutMs + 50);

    worker.onmessage = (event: MessageEvent<WorkerCaseOutcome>) => {
      window.clearTimeout(timer);
      finish(event.data);
    };
    worker.onerror = () => {
      window.clearTimeout(timer);
      finish({ ok: false, error: "Worker runtime error.", error_kind: "runtime" });
    };

    worker.postMessage({ source, input, timeoutMs });
  });
}

/** Run tests in a Web Worker when available; falls back to sync runner. */
export async function runJavascriptSolveTestsAsync(
  source: string,
  cases: SolveTestCase[],
  timeoutMs = DEFAULT_TIMEOUT_MS,
): Promise<SolveRunOutcome> {
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
    const compileError = (compiled as { error: string }).error;
    const isBlocked = compileError.includes("not allowed");
    return {
      ok: false,
      results: [],
      execution_status: isBlocked ? "blocked" : "compile_error",
      blockedReason: compileError,
      primary_error: compileError,
    };
  }

  if (!createWorker()) {
    return runJavascriptSolveTests(source, cases, timeoutMs);
  }

  let sawRuntime = false;
  let sawTimeout = false;
  let sawService = false;
  let sawCompile = false;
  let primaryError: string | undefined;
  const results = [];

  for (const testCase of cases) {
    const input = normalizeSolveValue(testCase.input);
    const expected = normalizeSolveValue(testCase.expected);
    const inputPreview = previewSolveValue(input);
    const outcome = await runCaseInWorker(source, input, timeoutMs);
    const kind = outcome.error_kind ?? "";

    if (kind === "runtime") sawRuntime = true;
    if (kind === "timeout") sawTimeout = true;
    if (kind === "service") sawService = true;
    if (kind === "compile" || kind === "blocked") sawCompile = true;

    const stdoutText = outcome.stdout?.join("\n").trim();
    const stderrText = outcome.stderr?.join("\n").trim();
    const stdout =
      stdoutText && stdoutText.length > MAX_STDOUT_CHARS
        ? `${stdoutText.slice(0, MAX_STDOUT_CHARS - 1)}…`
        : stdoutText || undefined;
    const stderr =
      stderrText && stderrText.length > MAX_STDERR_CHARS
        ? `${stderrText.slice(0, MAX_STDERR_CHARS - 1)}…`
        : stderrText || undefined;

    if (!outcome.ok) {
      const error = outcome.error ?? "Runtime error";
      if (!primaryError) primaryError = `${testCase.name}: ${error} (input ${inputPreview})`;
      const mappedKind =
        kind === "timeout"
          ? ("timeout" as const)
          : kind === "compile" || kind === "blocked"
            ? ("runtime" as const)
            : kind === "service"
              ? ("runtime" as const)
              : ("runtime" as const);
      results.push({
        id: testCase.id,
        name: testCase.name,
        passed: false,
        error,
        error_kind: mappedKind,
        input_preview: inputPreview,
        stdout,
        stderr,
      });
      continue;
    }

    const limited = limitSolveOutput(outcome.actual);
    if (!limited.ok) {
      sawRuntime = true;
      if (!primaryError) primaryError = `${testCase.name}: ${limited.error} (input ${inputPreview})`;
      results.push({
        id: testCase.id,
        name: testCase.name,
        passed: false,
        error: limited.error,
        error_kind: "runtime" as const,
        input_preview: inputPreview,
        stdout,
        stderr,
      });
      continue;
    }

    let passed = false;
    try {
      passed = stableJsonEqual(limited.value, expected);
    } catch (error) {
      sawRuntime = true;
      const message = error instanceof Error ? error.message : "Could not compare outputs.";
      if (!primaryError) primaryError = `${testCase.name}: ${message} (input ${inputPreview})`;
      results.push({
        id: testCase.id,
        name: testCase.name,
        passed: false,
        actual: limited.value,
        error: message,
        error_kind: "compare" as const,
        input_preview: inputPreview,
        stdout,
        stderr,
      });
      continue;
    }

    results.push({
      id: testCase.id,
      name: testCase.name,
      passed,
      actual: limited.value,
      input_preview: inputPreview,
      stdout,
      stderr,
      ...(passed
        ? {}
        : {
            error: `Expected ${previewSolveValue(expected)}, got ${previewSolveValue(limited.value)}`,
            error_kind: "wrong_answer" as const,
          }),
    });
    if (!passed && !primaryError) {
      const row = results[results.length - 1];
      primaryError = `${row.name}: ${row.error} (input ${inputPreview})`;
    }
  }

  const allPassed = results.every((r) => r.passed);
  const execution_status = sawService
    ? "service_error"
    : sawCompile
      ? "compile_error"
      : sawTimeout
        ? "timeout"
        : sawRuntime
          ? "runtime_error"
          : allPassed
            ? "passed"
            : "failed";

  return {
    ok: allPassed,
    results,
    execution_status,
    primary_error: primaryError,
  };
}
