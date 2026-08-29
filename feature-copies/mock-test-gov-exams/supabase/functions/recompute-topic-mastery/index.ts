// recompute-topic-mastery — refresh topic_mastery / exam_readiness / preparation_plans
// from a completed mock test (also invoked inline from submit-test).
import { handleCors, getCorsHeaders } from "../_shared/cors.ts";
import { authenticateRequest } from "../_shared/auth.ts";
import { createServiceClient } from "../_shared/supabase.ts";
import {
  checkRateLimitAsync,
  createRateLimitKey,
  rateLimitResponse,
  RATE_LIMIT_PRESETS,
} from "../_shared/rateLimit.ts";
import { recomputeTopicMasteryFromAttempt } from "../_shared/recomputeTopicMastery.ts";
import type { AttemptSignal } from "../_shared/masteryEngine.ts";

function json(req: Request, payload: unknown, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { ...getCorsHeaders(req), "Content-Type": "application/json" },
  });
}

Deno.serve(async (req) => {
  const cors = handleCors(req);
  if (cors) return cors;

  try {
    const auth = await authenticateRequest(req);
    if (auth.error) return auth.error;
    const user = auth.context.user;
    const db = createServiceClient();

    const rateLimitResult = await checkRateLimitAsync(db, {
      key: createRateLimitKey("recompute-topic-mastery", user.id),
      ...RATE_LIMIT_PRESETS.SESSION_ACTION,
    });
    if (!rateLimitResult.allowed) {
      return rateLimitResponse(rateLimitResult);
    }

    const body = await req.json().catch(() => null);
    const testId =
      body && typeof body === "object"
        ? String((body as Record<string, unknown>).test_id ?? "").trim()
        : "";

    if (!testId) {
      return json(req, { error: "test_id required", code: "VALIDATION_ERROR" }, 400);
    }

    const { data: test, error: testErr } = await db
      .from("mock_tests")
      .select("id, config, question_ids, status, user_id")
      .eq("id", testId)
      .eq("user_id", user.id)
      .maybeSingle();

    if (testErr || !test) {
      return json(req, { error: "Test not found", code: "NOT_FOUND" }, 404);
    }

    const config = (test.config as Record<string, unknown> | null) ?? {};
    const examId = String(config.gov_exam_id ?? "").trim();
    if (!examId) {
      return json(req, {
        error: "Test is not linked to a gov exam (config.gov_exam_id missing)",
        code: "NOT_GOV_EXAM",
        updatedTopics: 0,
      }, 200);
    }

    const questionIds = Array.isArray(test.question_ids)
      ? (test.question_ids as string[])
      : [];
    if (questionIds.length === 0) {
      return json(req, { error: "No questions", code: "VALIDATION_ERROR" }, 400);
    }

    const [{ data: questions }, { data: responses }] = await Promise.all([
      db
        .from("questions")
        .select("id, topic, difficulty")
        .in("id", questionIds),
      db
        .from("test_responses")
        .select("question_id, is_attempted, is_correct, time_spent_seconds")
        .eq("test_id", testId)
        .eq("user_id", user.id),
    ]);

    const qMap = new Map((questions ?? []).map((q) => [q.id as string, q]));
    const rMap = new Map(
      (responses ?? []).map((r) => [r.question_id as string, r]),
    );

    const topicAttemptsMap = new Map<string, AttemptSignal[]>();
    for (const qid of questionIds) {
      const q = qMap.get(qid);
      if (!q) continue;
      const topic = String(q.topic ?? "General").trim() || "General";
      const r = rMap.get(qid);
      const attempted = Boolean(r?.is_attempted);
      const list = topicAttemptsMap.get(topic) ?? [];
      list.push({
        correct: Boolean(r?.is_correct),
        attempted,
        difficulty: q.difficulty as string | null,
        daysAgo: 0,
        quality: 1,
      });
      topicAttemptsMap.set(topic, list);
    }

    const result = await recomputeTopicMasteryFromAttempt(db, {
      userId: user.id,
      examId,
      stageId: String(config.gov_stage_id ?? "").trim() || null,
      topicAttempts: [...topicAttemptsMap.entries()].map(([topic, attempts]) => ({
        topic,
        attempts,
      })),
    });

    return json(req, {
      success: true,
      examId,
      ...result,
    });
  } catch (err) {
    console.error("[recompute-topic-mastery]", err);
    return json(req, { error: "Internal error", code: "INTERNAL" }, 500);
  }
});
