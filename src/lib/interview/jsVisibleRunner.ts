/**
 * Practice-only JavaScript runner for visible test cases.
 * Delegates to the shared Coding Lab solve(input) runner.
 */

import {
  runJavascriptSolveTests,
  type SolveTestCase,
} from "@/lib/coding/javascriptSolveRunner";

export type VisibleTestCase = SolveTestCase;

export type VisibleTestResult = {
  id: string;
  name: string;
  passed: boolean;
  actual?: unknown;
  error?: string;
  stdout?: string;
  stderr?: string;
};

export type RunnerOutcome = {
  ok: boolean;
  results: VisibleTestResult[];
  blockedReason?: string;
};

const DEFAULT_TIMEOUT_MS = 800;

export function runVisibleJavascriptTests(
  source: string,
  cases: VisibleTestCase[],
  timeoutMs = DEFAULT_TIMEOUT_MS,
): RunnerOutcome {
  const outcome = runJavascriptSolveTests(source, cases, timeoutMs);
  if (
    outcome.execution_status === "compile_error" ||
    outcome.execution_status === "blocked" ||
    outcome.execution_status === "service_error"
  ) {
    return {
      ok: false,
      results: outcome.results.map((r) => ({
        id: r.id,
        name: r.name,
        passed: r.passed,
        actual: r.actual,
        error: r.error,
        stdout: r.stdout,
        stderr: r.stderr,
      })),
      blockedReason: outcome.blockedReason ?? outcome.primary_error,
    };
  }

  return {
    ok: outcome.ok,
    results: outcome.results.map((r) => ({
      id: r.id,
      name: r.name,
      passed: r.passed,
      actual: r.actual,
      error: r.error,
      stdout: r.stdout,
      stderr: r.stderr,
    })),
    blockedReason: outcome.blockedReason,
  };
}
