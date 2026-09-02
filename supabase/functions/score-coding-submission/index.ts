import { handleCors, getCorsHeaders } from "../_shared/cors.ts";
import { authenticateRequest } from "../_shared/auth.ts";
import { createServiceClient } from "../_shared/supabase.ts";
import { enforceSessionRateLimitAsync } from "../_shared/rateLimit.ts";
import {
  runJavascriptSolveTests,
  type SolveTestCase,
} from "../_shared/javascriptSolveRunner.ts";

function json(req: Request, payload: unknown, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { ...getCorsHeaders(req), "Content-Type": "application/json" },
  });
}

/** Languages the product executes. Only javascript is auto-executed. */
export const APPROVED_CODING_LANGUAGES = ["javascript"] as const;

type VisibleTestCase = SolveTestCase;

function buildSampleMessage(
  execution_status: string,
  passed: number,
  failed: number,
  outcome: ReturnType<typeof runJavascriptSolveTests>,
): string {
  switch (execution_status) {
    case "compile_error":
      return `Compile error: ${outcome.blockedReason ?? "could not compile"}`;
    case "service_error":
      return outcome.primary_error ?? "The code runner could not load test cases.";
    case "timeout":
      return outcome.primary_error ?? "Sample run timed out.";
    case "runtime_error":
      return outcome.primary_error ?? "Sample run hit a runtime error.";
    case "passed":
      return `Sample: ${passed} passed, 0 failed.`;
    default:
      return outcome.primary_error ?? `Sample: ${passed} passed, ${failed} failed.`;
  }
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
      error: "This language is not configured for secure execution.",
      code: "NOT_CONFIGURED",
      execution_status: "unsupported",
      approved_languages: APPROVED_CODING_LANGUAGES,
    }, 501);
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

  const outcome = runJavascriptSolveTests(code, mapped, Number(question.time_limit_ms ?? 800));
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
      primary_error: outcome.primary_error ?? undefined,
      case_results: outcome.results.map((r) => ({
        id: r.id,
        name: r.name,
        passed: r.passed,
        actual: r.actual,
        error: r.error,
        error_kind: r.error_kind,
        input_preview: r.input_preview,
        stdout: r.stdout,
        stderr: r.stderr,
      })),
      message: buildSampleMessage(execution_status, passed, failed, outcome),
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
      primary_error: outcome.primary_error ?? undefined,
      message: `Compile error: ${outcome.blockedReason ?? "could not compile"}`,
    });
  }

  if (execution_status === "service_error") {
    return json(req, {
      status: "service_error",
      score: null,
      passed_tests: 0,
      failed_tests: 0,
      execution_status,
      blocked_reason: outcome.blockedReason ?? undefined,
      primary_error: outcome.primary_error ?? undefined,
      message: outcome.primary_error ?? "The code runner is temporarily unavailable.",
    }, 503);
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
      primary_error: outcome.primary_error ?? null,
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
    primary_error: outcome.primary_error ?? undefined,
    case_results: outcome.results.map((r) => ({
      id: r.id,
      name: r.name,
      passed: r.passed,
      actual: r.actual,
      error: r.error,
      error_kind: r.error_kind,
      input_preview: r.input_preview,
      stdout: r.stdout,
      stderr: r.stderr,
    })),
  });
});
