/**
 * Practice-only JavaScript runner for visible test cases.
 * Not a hidden-case judge. No network. Times out.
 */

export type VisibleTestCase = {
  id: string;
  name: string;
  input: unknown;
  expected: unknown;
};

export type VisibleTestResult = {
  id: string;
  name: string;
  passed: boolean;
  actual?: unknown;
  error?: string;
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
  if (typeof source !== "string" || source.trim().length === 0) {
    return { ok: false, results: [], blockedReason: "No source to run." };
  }
  if (/\bimport\s+|require\s*\(|fetch\s*\(|XMLHttpRequest|process\.|Deno\./.test(source)) {
    return {
      ok: false,
      results: [],
      blockedReason: "Network, imports, and host APIs are not allowed in practice runs.",
    };
  }

  let fn: ((input: unknown) => unknown) | null = null;
  try {
    // eslint-disable-next-line no-new-func
    const factory = new Function(`${source}; return typeof solve === "function" ? solve : null;`);
    fn = factory() as ((input: unknown) => unknown) | null;
  } catch (error) {
    return {
      ok: false,
      results: [
        {
          id: "compile",
          name: "Compile",
          passed: false,
          error: error instanceof Error ? error.message : "Could not compile practice code.",
        },
      ],
    };
  }

  if (typeof fn !== "function") {
    return {
      ok: false,
      results: [],
      blockedReason: "Define a function named solve(input) for visible tests.",
    };
  }

  const results: VisibleTestResult[] = cases.map((testCase) => {
    const started = Date.now();
    try {
      const actual = fn!(testCase.input);
      if (Date.now() - started > timeoutMs) {
        return { id: testCase.id, name: testCase.name, passed: false, error: "Timed out." };
      }
      const passed = JSON.stringify(actual) === JSON.stringify(testCase.expected);
      return { id: testCase.id, name: testCase.name, passed, actual };
    } catch (error) {
      return {
        id: testCase.id,
        name: testCase.name,
        passed: false,
        error: error instanceof Error ? error.message : "Runtime error",
      };
    }
  });

  return { ok: results.every((r) => r.passed), results };
}
