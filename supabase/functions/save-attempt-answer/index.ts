/**
 * save-attempt-answer — versioned autosave + mark-for-review.
 * Owner-only. Rejects stale versions. Does not score.
 */
import { handleCors, getCorsHeaders, withBrowserCors, applyCors } from "../_shared/cors.ts";
import { authenticateRequest, createUserScopedClient } from "../_shared/auth.ts";
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
  clientUpdatedAt: string;
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
      clientUpdatedAt: typeof rec.clientUpdatedAt === "string"
        ? rec.clientUpdatedAt
        : typeof rec.client_updated_at === "string"
        ? rec.client_updated_at
        : new Date().toISOString(),
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

    const userDb = createUserScopedClient(auth.context.accessToken);
    const stale: string[] = [];
    const nextVersions: Record<string, number> = {};
    let saved = 0;
    for (const ans of answers) {
      const { data, error } = await userDb.rpc("save_owned_test_answer", {
        p_test_id: attemptId,
        p_question_id: ans.questionId,
        p_user_answer: ans.answer,
        p_is_attempted: Boolean(ans.answer),
        p_is_marked_review: ans.markedForReview,
        p_time_spent_seconds: ans.timeSpentSeconds,
        p_client_updated_at: ans.clientUpdatedAt,
        p_expected_version: ans.version,
      });
      if (error) {
        console.error("[save-attempt-answer] rpc", ans.questionId, error.message);
        return json(req, { error: "Save failed", code: "INTERNAL_ERROR" }, 500);
      }
      const result = (data ?? {}) as {
        success?: boolean;
        stale?: boolean;
        code?: string;
        answer_version?: number;
      };
      if (result.success === false) {
        const code = String(result.code ?? "SAVE_FAILED");
        if (code === "SUBMISSION_CONFLICT") {
          return json(req, {
            attemptId,
            saved: 0,
            staleQuestionIds: [],
            nextVersions: {},
            ignored: true,
            code: "ALREADY_SUBMITTED",
          });
        }
        const status = code === "NOT_FOUND" ? 404
          : code === "UNAUTHORIZED" ? 401
          : code === "CLIENT_CLOCK_INVALID" || code === "QUESTION_NOT_IN_ATTEMPT" ? 400
          : 409;
        return json(req, { error: "Save failed", code }, status);
      }
      nextVersions[ans.questionId] = Number(result.answer_version ?? ans.version);
      if (result.stale) {
        stale.push(ans.questionId);
        continue;
      }
      saved += 1;
    }

    return json(req, {
      attemptId,
      saved,
      staleQuestionIds: stale,
      nextVersions,
    });
  } catch (err) {
    console.error("[save-attempt-answer]", err);
    return json(req, { error: "Internal server error", code: "INTERNAL_ERROR" }, 500);
  }
}));
