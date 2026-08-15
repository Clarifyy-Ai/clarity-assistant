import { runVisibleJavascriptTests, type VisibleTestCase } from "@/lib/interview/jsVisibleRunner";

export type CodingTestCase = {
  id: string;
  name: string;
  input: unknown;
  expected: unknown;
  is_hidden: boolean;
  weight?: number;
};

export type PublicCodingCase = {
  id: string;
  name: string;
  input: unknown;
  expected: unknown;
};

export function stripHiddenTestCases(cases: CodingTestCase[]): PublicCodingCase[] {
  return cases
    .filter((testCase) => !testCase.is_hidden)
    .map((testCase) => ({
      id: testCase.id,
      name: testCase.name,
      input: testCase.input,
      expected: testCase.expected,
    }));
}

export function assertNoHiddenCasesExposed(payload: unknown): boolean {
  const text = JSON.stringify(payload ?? {});
  return !/"is_hidden"\s*:\s*true/i.test(text);
}

export type AuthoritativeScore = {
  passed_tests: number;
  failed_tests: number;
  score: number;
  execution_status: "passed" | "failed" | "blocked" | "unsupported";
  blocked_reason?: string;
};

export function scoreJavascriptSolve(
  source: string,
  cases: CodingTestCase[],
  timeoutMs = 800,
): AuthoritativeScore {
  const mapped: VisibleTestCase[] = cases.map((testCase) => ({
    id: testCase.id,
    name: testCase.is_hidden ? "hidden" : testCase.name,
    input: testCase.input,
    expected: testCase.expected,
  }));
  const outcome = runVisibleJavascriptTests(source, mapped, timeoutMs);
  if (outcome.blockedReason) {
    return {
      passed_tests: 0,
      failed_tests: cases.length,
      score: 0,
      execution_status: "blocked",
      blocked_reason: outcome.blockedReason,
    };
  }
  const passed = outcome.results.filter((r) => r.passed).length;
  const failed = outcome.results.length - passed;
  const score = outcome.results.length === 0 ? 0 : Math.round((passed / outcome.results.length) * 100);
  return {
    passed_tests: passed,
    failed_tests: failed,
    score,
    execution_status: failed === 0 && passed > 0 ? "passed" : "failed",
  };
}

export function publicScorePayload(score: AuthoritativeScore): AuthoritativeScore {
  return {
    passed_tests: score.passed_tests,
    failed_tests: score.failed_tests,
    score: score.score,
    execution_status: score.execution_status,
    blocked_reason: score.blocked_reason,
  };
}

export function remainingSubmissions(used: number, max: number): number {
  return Math.max(0, max - used);
}

export function rejectClientScore(body: Record<string, unknown>): string[] {
  const rejected: string[] = [];
  for (const key of ["score", "passed_tests", "failed_tests", "execution_status", "passedTests"]) {
    if (key in body) rejected.push(key);
  }
  return rejected;
}
