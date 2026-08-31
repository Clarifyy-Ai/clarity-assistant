/**
 * save-test-answer — versioned autosave for a live mock attempt.
 * Rejects stale client_updated_at so older network responses cannot overwrite newer answers.
 */
import { handleCors, getCorsHeaders, withBrowserCors, applyCors } from "../_shared/cors.ts";
import { authenticateRequest } from "../_shared/auth.ts";
import { createServiceClient } from "../_shared/supabase.ts";
import { isUserBanned, bannedResponse } from "../_shared/banCheck.ts";
import {
  checkRateLimitAsync,
  createRateLimitKey,
  rateLimitResponse,
  RATE_LIMIT_PRESETS,
} from "../_shared/rateLimit.ts";

function json(req: Request, payload: unknown, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { ...getCorsHeaders(req), "Content-Type": "application/json" },
  });
}

function uuidOrNull(v: unknown): string | null {
  if (typeof v !== "string") return null;
  const s = v.trim();
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(s)
    ? s
    : null;
}

type AnswerPayload = {
  questionId?: unknown;
  question_id?: unknown;
  userAnswer?: unknown;
  user_answer?: unknown;
  isAttempted?: unknown;
  is_attempted?: unknown;
  isMarkedReview?: unknown;
  is_marked_review?: unknown;
  timeSpentSeconds?: unknown;
  time_spent_seconds?: unknown;
  clientUpdatedAt?: unknown;
  client_updated_at?: unknown;
};

Deno.serve(withBrowserCors("save-test-answer", async (req) => {
  const cors = handleCors(req);
  if (cors) return cors;

  const db = createServiceClient();

  try {
    const auth = await authenticateRequest(req);
    if (auth.error) return applyCors(req, auth.error);
    const user = auth.context.user;

    if (await isUserBanned(db, user.id)) {
      return bannedResponse(getCorsHeaders(req));
    }

    const rateLimitResult = await checkRateLimitAsync(db, {
      key: createRateLimitKey("save-test-answer", user.id),
      ...RATE_LIMIT_PRESETS.SESSION_ACTION,
    });
    if (!rateLimitResult.allowed) {
      return rateLimitResponse(rateLimitResult, req);
    }

    const body = await req.json().catch(() => null);
    if (!body || typeof body !== "object") {
      return json(req, { error: "Invalid JSON body", code: "BAD_REQUEST" }, 400);
    }

    const rec = body as Record<string, unknown>;
    const testId = uuidOrNull(rec.testId ?? rec.test_id);
    if (!testId) {
      return json(req, { error: "testId required", code: "VALIDATION_ERROR" }, 400);
    }

    const rawAnswers = Array.isArray(rec.answers)
      ? rec.answers as AnswerPayload[]
      : rec.questionId || rec.question_id
      ? [rec as AnswerPayload]
      : [];

    if (rawAnswers.length === 0) {
      return json(req, { error: "answers required", code: "VALIDATION_ERROR" }, 400);
    }

    const { data: test, error: testErr } = await db
      .from("mock_tests")
      .select("id, status, started_at, expires_at")
      .eq("id", testId)
      .eq("user_id", user.id)
      .maybeSingle();

    if (testErr || !test) {
      return json(req, { error: "Test not found", code: "NOT_FOUND" }, 404);
    }
    if (test.status === "COMPLETED") {
      return json(req, { error: "This exam is already submitted.", code: "SUBMISSION_CONFLICT" }, 409);
    }
    if (test.status === "DRAFT" || !test.started_at) {
      return json(req, { error: "Start the exam before saving answers.", code: "ATTEMPT_NOT_STARTED" }, 409);
    }
    if (test.expires_at && new Date(String(test.expires_at)).getTime() < Date.now() - 2000) {
      return json(req, { error: "Attempt time has expired.", code: "ATTEMPT_EXPIRED" }, 409);
    }

    const saved: string[] = [];
    const stale: string[] = [];

    for (const item of rawAnswers.slice(0, 200)) {
      const questionId = uuidOrNull(String(item.questionId ?? item.question_id ?? ""));
      if (!questionId) continue;
      const clientUpdatedAt = String(item.clientUpdatedAt ?? item.client_updated_at ?? new Date().toISOString());
      const userAnswer = item.userAnswer ?? item.user_answer;
      const isAttempted = Boolean(item.isAttempted ?? item.is_attempted);
      const isMarkedReview = Boolean(item.isMarkedReview ?? item.is_marked_review);
      const timeSpent = Number(item.timeSpentSeconds ?? item.time_spent_seconds ?? 0);

      const { data: existing } = await db
        .from("test_responses")
        .select("id, client_updated_at, answer_version")
        .eq("test_id", testId)
        .eq("question_id", questionId)
        .eq("user_id", user.id)
        .maybeSingle();

      if (
        existing?.client_updated_at &&
        new Date(String(existing.client_updated_at)).getTime() > new Date(clientUpdatedAt).getTime()
      ) {
        stale.push(questionId);
        continue;
      }

      const nextVersion = Number(existing?.answer_version ?? 0) + 1;
      const payload = {
        test_id: testId,
        user_id: user.id,
        question_id: questionId,
        user_answer: userAnswer == null || userAnswer === "" ? null : String(userAnswer),
        is_attempted: isAttempted,
        is_marked_review: isMarkedReview,
        time_spent_seconds: Number.isFinite(timeSpent) ? Math.max(0, Math.floor(timeSpent)) : 0,
        client_updated_at: clientUpdatedAt,
        answer_version: nextVersion,
        updated_at: new Date().toISOString(),
      };

      const { error: upsertErr } = await db
        .from("test_responses")
        .upsert(payload, { onConflict: "test_id,question_id" });
      if (upsertErr) {
        console.error("[save-test-answer] upsert", questionId, upsertErr);
        return json(req, { error: "Could not save answers.", code: "SAVE_FAILED" }, 500);
      }
      saved.push(questionId);
    }

    return json(req, { success: true, savedCount: saved.length, staleQuestionIds: stale });
  } catch (err) {
    console.error("[save-test-answer]", err);
    return json(req, { error: "Could not save answers.", code: "SAVE_FAILED" }, 500);
  }
}));
