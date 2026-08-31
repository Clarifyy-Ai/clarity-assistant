/**
 * save-attempt-answer — versioned autosave + mark-for-review.
 * Owner-only. Rejects stale versions. Does not score.
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
  questionId: string;
  answer: string | null;
  markedForReview: boolean;
  timeSpentSeconds: number;
  version: number;
};

function parseAnswers(raw: unknown): AnswerPayload[] | null {
  if (!Array.isArray(raw) || raw.length === 0 || raw.length > 250) return null;
  const out: AnswerPayload[] = [];
  for (const item of raw) {
    if (!item || typeof item !== "object") return null;
    const rec = item as Record<string, unknown>;
    const questionId = uuidOrNull(rec.questionId ?? rec.question_id);
    if (!questionId) return null;
    const version = Number(rec.version ?? 0);
    if (!Number.isFinite(version) || version < 0) return null;
    out.push({
      questionId,
      answer: rec.answer == null ? null : String(rec.answer).slice(0, 8000),
      markedForReview: rec.markedForReview === true || rec.is_marked_review === true,
      timeSpentSeconds: Math.max(0, Math.floor(Number(rec.timeSpentSeconds ?? rec.time_spent_seconds) || 0)),
      version: Math.floor(version),
    });
  }
  return out;
}

Deno.serve(withBrowserCors("save-attempt-answer", async (req) => {
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
      key: createRateLimitKey("save-attempt-answer", user.id),
      ...RATE_LIMIT_PRESETS.JOB_POLL,
    });
    if (!rateLimitResult.allowed) {
      return rateLimitResponse(rateLimitResult, req);
    }

    const body = await req.json().catch(() => null);
    if (!body || typeof body !== "object") {
      return json(req, { error: "Invalid JSON body", code: "BAD_REQUEST" }, 400);
    }
    const attemptId = uuidOrNull((body as Record<string, unknown>).attemptId);
    const answers = parseAnswers((body as Record<string, unknown>).answers);
    if (!attemptId || !answers) {
      return json(req, { error: "attemptId and answers[] are required", code: "VALIDATION_ERROR" }, 400);
    }

    const { data: test, error: testErr } = await db
      .from("mock_tests")
      .select("id, user_id, status, started_at, expires_at")
      .eq("id", attemptId)
      .eq("user_id", user.id)
      .maybeSingle();

    if (testErr || !test) {
      return json(req, { error: "Attempt not found", code: "ATTEMPT_NOT_FOUND" }, 404);
    }
    if (test.status === "COMPLETED" || test.status === "ABANDONED") {
      return json(req, { error: "Attempt is locked.", code: "SUBMISSION_CONFLICT" }, 409);
    }
    if (test.expires_at && new Date(String(test.expires_at)).getTime() < Date.now() - 2000) {
      return json(req, { error: "Attempt time has expired.", code: "ATTEMPT_EXPIRED" }, 409);
    }

    const { data: existing } = await db
      .from("test_responses")
      .select("question_id, answer_version")
      .eq("test_id", attemptId)
      .eq("user_id", user.id)
      .in("question_id", answers.map((a) => a.questionId));

    const currentVer = new Map<string, number>();
    for (const row of existing ?? []) {
      currentVer.set(String(row.question_id), Number(row.answer_version) || 0);
    }

    const stale: string[] = [];
    const rows: Record<string, unknown>[] = [];
    const now = new Date().toISOString();
    for (const ans of answers) {
      const dbVer = currentVer.get(ans.questionId) ?? 0;
      if (ans.version < dbVer) {
        stale.push(ans.questionId);
        continue;
      }
      rows.push({
        test_id: attemptId,
        user_id: user.id,
        question_id: ans.questionId,
        user_answer: ans.answer,
        is_attempted: Boolean(ans.answer),
        is_marked_review: ans.markedForReview,
        time_spent_seconds: ans.timeSpentSeconds,
        answer_version: ans.version + 1,
        answered_at: now,
        updated_at: now,
      });
    }

    if (rows.length) {
      const { error: upErr } = await db
        .from("test_responses")
        .upsert(rows, { onConflict: "test_id,question_id" });
      if (upErr) {
        console.error("[save-attempt-answer]", upErr);
        return json(req, { error: "Save failed", code: "INTERNAL_ERROR" }, 500);
      }
    }

    return json(req, {
      attemptId,
      saved: rows.length,
      staleQuestionIds: stale,
      nextVersions: Object.fromEntries(
        answers.map((a) => {
          const saved = rows.find((r) => String(r.question_id) === a.questionId);
          if (saved) return [a.questionId, saved.answer_version];
          return [a.questionId, currentVer.get(a.questionId) ?? a.version];
        }),
      ),
    });
  } catch (err) {
    console.error("[save-attempt-answer]", err);
    return json(req, { error: "Internal server error", code: "INTERNAL_ERROR" }, 500);
  }
}));
