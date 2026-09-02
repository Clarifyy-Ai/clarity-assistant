/**
 * save-test-answer — versioned autosave for a live mock / assessment attempt.
 * Persists through save_owned_test_answer (SECURITY DEFINER) so clients never
 * need direct test_responses INSERT privileges or service-role keys.
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
  version?: unknown;
  answerVersion?: unknown;
  answer_version?: unknown;
};

type SaveOwnedRpcResult = {
  success?: boolean;
  stale?: boolean;
  code?: string;
  answer_version?: number;
  client_updated_at?: string;
};

function rpcStatusForCode(code: string | undefined): number {
  switch (String(code ?? "").toUpperCase()) {
    case "NOT_FOUND":
      return 404;
    case "SUBMISSION_CONFLICT":
      return 200;
    case "ATTEMPT_NOT_STARTED":
    case "ATTEMPT_EXPIRED":
    case "ATTEMPT_INVALIDATED":
      return 409;
    case "UNAUTHORIZED":
      return 401;
    case "QUESTION_NOT_IN_ATTEMPT":
    case "CLIENT_CLOCK_INVALID":
      return 400;
    default:
      return 500;
  }
}

Deno.serve(withBrowserCors("save-test-answer", async (req) => {
  const cors = handleCors(req);
  if (cors) return cors;

  const adminDb = createServiceClient();

  try {
    const auth = await authenticateRequest(req);
    if (auth.error) return applyCors(req, auth.error);
    const user = auth.context.user;

    if (await isUserBanned(adminDb, user.id)) {
      return bannedResponse(getCorsHeaders(req));
    }

    const rateLimitResult = await checkRateLimitAsync(adminDb, {
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

    const userDb = createUserScopedClient(auth.context.accessToken);
    const saved: string[] = [];
    const stale: string[] = [];
    const nextVersions: Record<string, number> = {};

    for (const item of rawAnswers.slice(0, 200)) {
      const questionId = uuidOrNull(String(item.questionId ?? item.question_id ?? ""));
      if (!questionId) continue;
      const clientUpdatedAt = String(item.clientUpdatedAt ?? item.client_updated_at ?? new Date().toISOString());
      const userAnswer = item.userAnswer ?? item.user_answer;
      const isAttempted = Boolean(item.isAttempted ?? item.is_attempted);
      const isMarkedReview = Boolean(item.isMarkedReview ?? item.is_marked_review);
      const timeSpent = Number(item.timeSpentSeconds ?? item.time_spent_seconds ?? 0);
      const rawVersion = item.version ?? item.answerVersion ?? item.answer_version;
      const expectedVersion = rawVersion == null ? null : Number(rawVersion);

      const { data, error } = await userDb.rpc("save_owned_test_answer", {
        p_test_id: testId,
        p_question_id: questionId,
        p_user_answer: userAnswer == null || userAnswer === "" ? null : String(userAnswer),
        p_is_attempted: isAttempted,
        p_is_marked_review: isMarkedReview,
        p_time_spent_seconds: Number.isFinite(timeSpent) ? Math.max(0, Math.floor(timeSpent)) : 0,
        p_client_updated_at: clientUpdatedAt,
        p_expected_version:
          expectedVersion != null && Number.isFinite(expectedVersion)
            ? Math.max(0, Math.floor(expectedVersion))
            : null,
      });

      if (error) {
        console.error("[save-test-answer] rpc", questionId, error.message);
        return json(req, { error: "Could not save answers.", code: "SAVE_FAILED" }, 500);
      }

      const result = (data ?? {}) as SaveOwnedRpcResult;
      if (result.success === false) {
        const code = String(result.code ?? "SAVE_FAILED");
        if (code === "SUBMISSION_CONFLICT") {
          return json(req, {
            success: true,
            savedCount: 0,
            staleQuestionIds: [],
            nextVersions: {},
            ignored: true,
            code: "ALREADY_SUBMITTED",
          });
        }
        return json(req, { error: "Could not save answers.", code }, rpcStatusForCode(code));
      }
      if (result.stale) {
        stale.push(questionId);
        nextVersions[questionId] = Number(result.answer_version ?? 0);
        continue;
      }
      saved.push(questionId);
      nextVersions[questionId] = Number(result.answer_version ?? 0);
    }

    return json(req, {
      success: true,
      savedCount: saved.length,
      staleQuestionIds: stale,
      nextVersions,
    });
  } catch (err) {
    console.error("[save-test-answer]", err);
    return json(req, { error: "Could not save answers.", code: "SAVE_FAILED" }, 500);
  }
}));
