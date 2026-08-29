import { handleCors, getCorsHeaders } from "../_shared/cors.ts";
import { authenticateRequest } from "../_shared/auth.ts";
import { createServiceClient } from "../_shared/supabase.ts";
import { enforceSessionRateLimitAsync } from "../_shared/rateLimit.ts";

function json(req: Request, payload: unknown, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { ...getCorsHeaders(req), "Content-Type": "application/json" },
  });
}

/** Languages the product accepts. Only javascript is auto-executed. */
export const APPROVED_CODING_LANGUAGES = [
  "javascript",
  "typescript",
  "python",
  "java",
] as const;

type VisibleTestCase = { id: string; name: string; input: unknown; expected: unknown };

type RunResult = {
  ok: boolean;
  results: Array<{ passed: boolean; error?: string }>;
  execution_status: "passed" | "failed" | "compile_error" | "runtime_error" | "timeout" | "blocked";
  blockedReason?: string;
};

function runVisibleJavascriptTests(
  source: string,
  cases: VisibleTestCase[],
  timeoutMs = 800,
): RunResult {
  if (typeof source !== "string" || source.trim().length === 0) {
    return {
      ok: false,
      results: [],
      execution_status: "compile_error",
      blockedReason: "No source to run.",
    };
  }
  if (/\bwhile\s*\(\s*true\s*\)|\bfor\s*\(\s*;\s*;\s*\)/.test(source)) {
    return {
      ok: false,
      results: [{ passed: false, error: "timeout" }],
      execution_status: "timeout",
      blockedReason: "Execution timed out.",
    };
  }
  if (/\bimport\s+|require\s*\(|fetch\s*\(|XMLHttpRequest|process\.|Deno\./.test(source)) {
    return {
      ok: false,
      results: [],
      execution_status: "blocked",
      blockedReason: "Network, imports, and host APIs are not allowed.",
    };
  }

  let fn: ((input: unknown) => unknown) | null = null;
  try {
    // This runner intentionally compiles a sandboxed solution function for a
    // constrained coding exercise. The code is already blocked from using host
    // APIs and network access before it is evaluated.
    // eslint-disable-next-line no-new-func
    const factory = new Function(`${source}; return typeof solve === "function" ? solve : null;`);
    fn = factory() as ((input: unknown) => unknown) | null;
  } catch (error) {
    return {
      ok: false,
      results: [{ passed: false, error: error instanceof Error ? error.message : "Could not compile." }],
      execution_status: "compile_error",
      blockedReason: error instanceof Error ? error.message : "Could not compile.",
    };
  }
  if (typeof fn !== "function") {
    return {
      ok: false,
      results: [],
      execution_status: "compile_error",
      blockedReason:
        "Define solve(input). Example: function solve(input) { return input; }",
    };
  }

  let sawRuntime = false;
  let sawTimeout = false;
  const results = cases.map((testCase) => {
    const started = Date.now();
    try {
      const actual = fn!(testCase.input);
      if (Date.now() - started > timeoutMs) {
        sawTimeout = true;
        return { passed: false, error: "timeout" };
      }
      return { passed: JSON.stringify(actual) === JSON.stringify(testCase.expected) };
    } catch (error) {
      sawRuntime = true;
      return {
        passed: false,
        error: error instanceof Error ? error.message : "Runtime error",
      };
    }
  });

  const allPassed = results.length > 0 && results.every((r) => r.passed);
  const execution_status = sawTimeout
    ? "timeout"
    : sawRuntime
      ? "runtime_error"
      : allPassed
        ? "passed"
        : "failed";

  return { ok: allPassed, results, execution_status };
}

Deno.serve(async (req) => {
  const cors = handleCors(req);
  if (cors) return cors;

  const auth = await authenticateRequest(req);
  if (auth.error || !auth.context) {
    return auth.error ?? json(req, { error: "Unauthorized", code: "UNAUTHORIZED" }, 401);
  }
  const userId = auth.context.user.id;

  const dbForLimit = createServiceClient();
  // Coding submit/sample/reset is not AI generation — use session limits (20/min)
  // so reset→resubmit does not fail with 429/503 after a few attempts.
  const rateLimited = await enforceSessionRateLimitAsync(
    dbForLimit,
    "score-coding-submission",
    userId,
  );
  if (rateLimited) return rateLimited;

  const body = await req.json().catch(() => ({})) as Record<string, unknown>;
  for (const key of ["score", "passed_tests", "failed_tests", "execution_status", "passedTests"]) {
    if (key in body) {
      return json(req, { error: "Client scoring fields are ignored and not accepted." }, 400);
    }
  }

  const questionId = String(body.question_id ?? "").trim();
  const code = String(body.code ?? "");
  const languageRaw = String(body.language ?? "javascript").trim().toLowerCase();
  const sampleOnly = body.sample_only === true || body.mode === "sample";
  if (!questionId || !code.trim()) return json(req, { error: "question_id and code are required" }, 400);

  if (!(APPROVED_CODING_LANGUAGES as readonly string[]).includes(languageRaw)) {
    return json(req, {
      error: "Selected language is not supported.",
      execution_status: "unsupported",
      approved_languages: APPROVED_CODING_LANGUAGES,
    }, 400);
  }
  const language = languageRaw;

  const db = createServiceClient();
  const { data: question, error: qErr } = await db
    .from("coding_questions")
    .select("id,language,time_limit_ms,max_submissions,evaluation_mode,created_by")
    .eq("id", questionId)
    .maybeSingle();
  if (qErr || !question) return json(req, { error: "Question not found" }, 404);

  if (!sampleOnly) {
    const { count } = await db
      .from("coding_submissions")
      .select("id", { count: "exact", head: true })
      .eq("user_id", userId)
      .eq("question_id", questionId);
    const used = count ?? 0;
    const max = Number(question.max_submissions ?? 20);
    if (used >= max) {
      await db.from("coding_submissions").insert({
        user_id: userId,
        question_id: questionId,
        code,
        language,
        status: "limit_exceeded",
        score: null,
        result_payload: { execution_status: "rejected" },
      });
      return json(req, { status: "limit_exceeded", score: null, message: "Maximum submissions reached." }, 429);
    }
  }

  if (language !== String(question.language ?? "").toLowerCase()) {
    return json(req, {
      error: "Selected language is not supported for this problem.",
      execution_status: "unsupported",
      question_language: question.language,
      approved_languages: APPROVED_CODING_LANGUAGES,
    }, 400);
  }

  if (question.evaluation_mode !== "javascript_solve" || language !== "javascript") {
    if (sampleOnly) {
      return json(req, {
        status: "pending_review",
        score: null,
        execution_status: "unsupported",
        message: "Sample runs are only available for JavaScript solve() assessments.",
        approved_languages: APPROVED_CODING_LANGUAGES,
      });
    }
    const { data: row } = await db.from("coding_submissions").insert({
      user_id: userId,
      question_id: questionId,
      code,
      language,
      status: "pending_review",
      score: null,
      execution_status: "unsupported",
      result_payload: {
        message: "Automated scoring is only enabled for JavaScript solve() assessments.",
      },
    }).select("id").maybeSingle();
    return json(req, {
      submission_id: row?.id,
      status: "pending_review",
      score: null,
      execution_status: "unsupported",
      message: "Stored for review. This language is not executed in the cloud.",
      approved_languages: APPROVED_CODING_LANGUAGES,
    });
  }

  let mapped: VisibleTestCase[] = [];
  if (sampleOnly) {
    const { data: cases, error: cErr } = await db
      .from("coding_test_cases")
      .select("id,name,input_json,expected_json,is_hidden")
      .eq("question_id", questionId)
      .eq("is_hidden", false);
    if (cErr) {
      return json(req, {
        error: "Could not load visible test cases for this problem.",
        code: "TEST_CASES_UNAVAILABLE",
        execution_status: "service_error",
      }, 503);
    }
    mapped = ((cases ?? []) as Array<{
      id: string;
      name: string;
      input_json: unknown;
      expected_json: unknown;
    }>).map((c) => ({
      id: c.id,
      name: c.name,
      input: c.input_json,
      expected: c.expected_json,
    }));
  } else {
    const { data: cases, error: cErr } = await db.rpc("coding_hidden_cases_for_scoring", {
      p_question_id: questionId,
    });
    if (cErr) {
      return json(req, {
        error: "Could not load scoring test cases for this problem.",
        code: "HIDDEN_CASES_UNAVAILABLE",
        execution_status: "service_error",
      }, 503);
    }
    mapped = ((cases ?? []) as Array<{
      id: string;
      name: string;
      input_json: unknown;
      expected_json: unknown;
      is_hidden: boolean;
    }>).map((c) => ({
      id: c.id,
      name: c.is_hidden ? "hidden" : c.name,
      input: c.input_json,
      expected: c.expected_json,
    }));
  }

  const outcome = runVisibleJavascriptTests(code, mapped, Number(question.time_limit_ms ?? 800));
  const passed = outcome.results.filter((r) => r.passed).length;
  const failed = outcome.results.length - passed;
  const score = mapped.length === 0 ? 0 : Math.round((passed / mapped.length) * 100);
  const execution_status = outcome.execution_status;

  if (sampleOnly) {
    return json(req, {
      status: "sample",
      score,
      passed_tests: passed,
      failed_tests: failed,
      execution_status,
      blocked_reason: outcome.blockedReason ?? undefined,
      message:
        execution_status === "compile_error"
          ? `Compile error: ${outcome.blockedReason ?? "could not compile"}`
          : execution_status === "timeout"
            ? "Sample run timed out."
            : execution_status === "runtime_error"
              ? "Sample run hit a runtime error."
              : `Sample: ${passed} passed, ${failed} failed.`,
    });
  }

  // Compile/blocked errors are guidance only — do not burn submission quota so
  // Reset → fix → Submit remains usable (TC-COD-004).
  if (execution_status === "compile_error" || execution_status === "blocked") {
    return json(req, {
      status: "compile_error",
      score: null,
      passed_tests: 0,
      failed_tests: 0,
      execution_status,
      blocked_reason: outcome.blockedReason ?? undefined,
      message: `Compile error: ${outcome.blockedReason ?? "could not compile"}`,
    });
  }

  const { data: row, error: insErr } = await db.from("coding_submissions").insert({
    user_id: userId,
    question_id: questionId,
    code,
    language,
    status: "scored",
    score,
    passed_tests: passed,
    failed_tests: failed,
    execution_status,
    result_payload: {
      passed_tests: passed,
      failed_tests: failed,
      execution_status,
      blocked_reason: outcome.blockedReason ?? null,
    },
  }).select("id").maybeSingle();
  if (insErr) return json(req, { error: insErr.message }, 500);

  return json(req, {
    submission_id: row?.id,
    status: "scored",
    score,
    passed_tests: passed,
    failed_tests: failed,
    execution_status,
    blocked_reason: outcome.blockedReason ?? undefined,
  });
});
