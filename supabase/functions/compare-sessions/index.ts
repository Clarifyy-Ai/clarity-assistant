import { handleCors, getCorsHeaders } from "../_shared/cors.ts";
import { authenticateRequest } from "../_shared/auth.ts";
import { createServiceClient } from "../_shared/supabase.ts";
import {
  checkRateLimitAsync,
  createRateLimitKey,
  rateLimitResponse,
} from "../_shared/rateLimit.ts";
import {
  CompareSessionsError,
  buildComparisonPayload,
  isUuid,
  type ScorecardRowInput,
  type SessionAnswerRowInput,
  type SessionRowInput,
} from "../_shared/compareSessions.ts";

const FUNCTION_NAME = "compare-sessions";

type JsonHeaders = Record<string, string>;

function json(
  headers: JsonHeaders,
  status: number,
  body: Record<string, unknown>,
): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...headers,
      "Content-Type": "application/json",
      "Cache-Control": "no-store",
    },
  });
}

function httpStatusForCode(code: string): number {
  switch (code) {
    case "UNAUTHORIZED":
      return 401;
    case "SESSION_NOT_OWNED":
      return 404;
    case "SESSION_NOT_FOUND":
      return 404;
    case "SESSION_NOT_COMPLETED":
    case "SESSION_NOT_COMPARABLE":
    case "SCORECARD_NOT_READY":
    case "DUPLICATE_SESSION":
      return 422;
    default:
      return 500;
  }
}

function asSessionRow(row: Record<string, unknown>): SessionRowInput {
  return {
    id: String(row.id),
    user_id: String(row.user_id),
    title: typeof row.title === "string" ? row.title : null,
    type: typeof row.type === "string" ? row.type : null,
    status: typeof row.status === "string" ? row.status : null,
    lifecycle_status:
      typeof row.lifecycle_status === "string" ? row.lifecycle_status : null,
    deleted_at: typeof row.deleted_at === "string" ? row.deleted_at : null,
    started_at: typeof row.started_at === "string" ? row.started_at : null,
    ended_at: typeof row.ended_at === "string" ? row.ended_at : null,
    created_at: String(row.created_at ?? ""),
    questions_asked:
      typeof row.questions_asked === "number" ? row.questions_asked : null,
    answers_generated:
      typeof row.answers_generated === "number" ? row.answers_generated : null,
    avg_wpm: typeof row.avg_wpm === "number" ? row.avg_wpm : null,
    filler_words: typeof row.filler_words === "number" ? row.filler_words : null,
  };
}

function asScorecard(row: Record<string, unknown> | null): ScorecardRowInput | null {
  if (!row) return null;
  const details =
    row.details && typeof row.details === "object" && !Array.isArray(row.details)
      ? row.details as Record<string, unknown>
      : null;
  return {
    session_id: typeof row.session_id === "string" ? row.session_id : null,
    user_id: String(row.user_id),
    overall_score: typeof row.overall_score === "number" ? row.overall_score : null,
    communication: typeof row.communication === "number" ? row.communication : null,
    technical: typeof row.technical === "number" ? row.technical : null,
    problem_solving:
      typeof row.problem_solving === "number" ? row.problem_solving : null,
    confidence: typeof row.confidence === "number" ? row.confidence : null,
    details,
    generated_at: typeof row.generated_at === "string" ? row.generated_at : null,
  };
}

Deno.serve(async (req: Request) => {
  const cors = handleCors(req);
  if (cors) return cors;

  const headers = {
    ...getCorsHeaders(req),
    "Content-Type": "application/json",
  };

  try {
    const auth = await authenticateRequest(req);
    if (auth.error) return auth.error;

    const user = auth.context.user;
    const db = createServiceClient();

    const rateLimitResult = await checkRateLimitAsync(db, {
      key: createRateLimitKey(FUNCTION_NAME, user.id),
      limit: 20,
      windowMs: 60_000,
    });
    if (!rateLimitResult.allowed && !rateLimitResult.backendFailure) {
      return rateLimitResponse(rateLimitResult);
    }

    if (req.method !== "POST") {
      return json(headers, 405, {
        error: "Method not allowed.",
        code: "BAD_REQUEST",
      });
    }

    const body = await req.json().catch(() => ({})) as Record<string, unknown>;
    const sessionAId = String(body.session_a_id ?? body.sessionAId ?? "").trim();
    const sessionBId = String(body.session_b_id ?? body.sessionBId ?? "").trim();
    const timeZone =
      typeof body.timezone === "string" ? body.timezone : null;

    if (!isUuid(sessionAId) || !isUuid(sessionBId)) {
      return json(headers, 422, {
        error: "Both session IDs must be valid UUIDs.",
        code: "VALIDATION_ERROR",
      });
    }

    if (sessionAId === sessionBId) {
      return json(headers, 422, {
        error: "Choose two different sessions.",
        code: "DUPLICATE_SESSION",
      });
    }

    const sessionIds = [sessionAId, sessionBId];

    const { data: sessionRows, error: sessionError } = await db
      .from("sessions")
      .select(
        "id,user_id,title,type,status,lifecycle_status,deleted_at,started_at,ended_at,created_at,questions_asked,answers_generated,avg_wpm,filler_words",
      )
      .in("id", sessionIds);

    if (sessionError) {
      console.error("[compare-sessions] sessions query failed:", sessionError.message);
      return json(headers, 500, {
        error: "Could not compare those sessions. Please try again.",
        code: "COMPARISON_FAILED",
      });
    }

    const sessions = (sessionRows ?? []) as Record<string, unknown>[];
    const foundA = sessions.find((row) => row.id === sessionAId);
    const foundB = sessions.find((row) => row.id === sessionBId);

    if (!foundA || !foundB) {
      return json(headers, 404, {
        error: "One of those sessions could not be found.",
        code: "SESSION_NOT_FOUND",
      });
    }

    if (foundA.user_id !== user.id || foundB.user_id !== user.id) {
      // Do not reveal whether the other user's session exists.
      return json(headers, 404, {
        error: "One of those sessions could not be found.",
        code: "SESSION_NOT_FOUND",
      });
    }

    const [{ data: scorecardRows, error: scorecardError }, { data: answerRows, error: answerError }] =
      await Promise.all([
        db
          .from("scorecards")
          .select(
            "session_id,user_id,overall_score,communication,technical,problem_solving,confidence,details,generated_at",
          )
          .eq("user_id", user.id)
          .in("session_id", sessionIds),
        db
          .from("session_answers")
          .select("session_id,question,answer")
          .eq("user_id", user.id)
          .in("session_id", sessionIds),
      ]);

    if (scorecardError || answerError) {
      console.error(
        "[compare-sessions] related query failed:",
        scorecardError?.message ?? answerError?.message,
      );
      return json(headers, 500, {
        error: "Could not compare those sessions. Please try again.",
        code: "COMPARISON_FAILED",
      });
    }

    const scorecards = (scorecardRows ?? []) as Record<string, unknown>[];
    const answers = ((answerRows ?? []) as Record<string, unknown>[]).map(
      (row): SessionAnswerRowInput => ({
        session_id: String(row.session_id),
        question: String(row.question ?? ""),
        answer: typeof row.answer === "string" ? row.answer : null,
      }),
    );

    const payload = buildComparisonPayload({
      userId: user.id,
      sessionA: asSessionRow(foundA),
      sessionB: asSessionRow(foundB),
      scorecardA: asScorecard(
        scorecards.find((row) => row.session_id === sessionAId) ?? null,
      ),
      scorecardB: asScorecard(
        scorecards.find((row) => row.session_id === sessionBId) ?? null,
      ),
      answers,
      timeZone,
    });

    return json(headers, 200, payload);
  } catch (error) {
    if (error instanceof CompareSessionsError) {
      const publicCode =
        error.code === "SESSION_NOT_OWNED" ? "SESSION_NOT_FOUND" : error.code;
      const publicMessage =
        publicCode === "SESSION_NOT_FOUND"
          ? "One of those sessions could not be found."
          : error.message;
      return json(headers, httpStatusForCode(publicCode), {
        error: publicMessage,
        code: publicCode,
      });
    }

    console.error(
      "[compare-sessions] unexpected error:",
      error instanceof Error ? error.message : "unknown",
    );
    return json(headers, 500, {
      error: "Could not compare those sessions. Please try again.",
      code: "COMPARISON_FAILED",
    });
  }
});
