import { handleCors, getCorsHeaders } from "../_shared/cors.ts";
import { authenticateRequest } from "../_shared/auth.ts";
import { createServiceClient } from "../_shared/supabase.ts";

function json(req: Request, payload: unknown, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { ...getCorsHeaders(req), "Content-Type": "application/json" },
  });
}

type VisibleTestCase = { id: string; name: string; input: unknown; expected: unknown };

function runVisibleJavascriptTests(
  source: string,
  cases: VisibleTestCase[],
  timeoutMs = 800,
) {
  if (typeof source !== "string" || source.trim().length === 0) {
    return { ok: false, results: [] as Array<{ passed: boolean }>, blockedReason: "No source to run." };
  }
  if (/\bimport\s+|require\s*\(|fetch\s*\(|XMLHttpRequest|process\.|Deno\./.test(source)) {
    return {
      ok: false,
      results: [] as Array<{ passed: boolean }>,
      blockedReason: "Network, imports, and host APIs are not allowed.",
    };
  }

  let fn: ((input: unknown) => unknown) | null = null;
  try {
    const factory = new Function(`${source}; return typeof solve === "function" ? solve : null;`);
    fn = factory() as ((input: unknown) => unknown) | null;
  } catch (error) {
    return {
      ok: false,
      results: [{ passed: false }],
      blockedReason: error instanceof Error ? error.message : "Could not compile.",
    };
  }
  if (typeof fn !== "function") {
    return { ok: false, results: [] as Array<{ passed: boolean }>, blockedReason: "Define solve(input)." };
  }

  const results = cases.map((testCase) => {
    const started = Date.now();
    try {
      const actual = fn!(testCase.input);
      if (Date.now() - started > timeoutMs) return { passed: false };
      return { passed: JSON.stringify(actual) === JSON.stringify(testCase.expected) };
    } catch {
      return { passed: false };
    }
  });
  return { ok: results.every((r) => r.passed), results };
}

Deno.serve(async (req) => {
  const cors = handleCors(req);
  if (cors) return cors;

  const auth = await authenticateRequest(req);
  if (auth.error || !auth.context) return auth.error ?? json(req, { error: "Unauthorized" }, 401);
  const userId = auth.context.user.id;

  const body = await req.json().catch(() => ({})) as Record<string, unknown>;
  for (const key of ["score", "passed_tests", "failed_tests", "execution_status", "passedTests"]) {
    if (key in body) {
      return json(req, { error: "Client scoring fields are ignored and not accepted." }, 400);
    }
  }

  const questionId = String(body.question_id ?? "").trim();
  const code = String(body.code ?? "");
  const language = String(body.language ?? "javascript");
  if (!questionId || !code.trim()) return json(req, { error: "question_id and code are required" }, 400);

  const db = createServiceClient();
  const { data: question, error: qErr } = await db
    .from("coding_questions")
    .select("id,language,time_limit_ms,max_submissions,evaluation_mode,created_by")
    .eq("id", questionId)
    .maybeSingle();
  if (qErr || !question) return json(req, { error: "Question not found" }, 404);

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

  if (question.evaluation_mode !== "javascript_solve" || language !== "javascript") {
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
    });
  }

  const { data: cases, error: cErr } = await db.rpc("coding_hidden_cases_for_scoring", {
    p_question_id: questionId,
  });
  if (cErr) return json(req, { error: cErr.message }, 500);

  const mapped = ((cases ?? []) as Array<{
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

  const outcome = runVisibleJavascriptTests(code, mapped, Number(question.time_limit_ms ?? 800));
  const passed = outcome.results.filter((r) => r.passed).length;
  const failed = outcome.results.length - passed;
  const score = mapped.length === 0 ? 0 : Math.round((passed / mapped.length) * 100);
  const execution_status = outcome.blockedReason ? "blocked" : failed === 0 && passed > 0 ? "passed" : "failed";

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
