import { supabase } from "@/lib/supabase/client";
import { scorecardsDB, sessionAnswersDB, sessionsDB } from "@/lib/supabase/database";
import type { Tables } from "@/integrations/supabase";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function isSessionDetailId(value: string | undefined | null): value is string {
  return typeof value === "string" && UUID_RE.test(value.trim());
}

export type OwnedSessionDetailCode =
  | "OK"
  | "NOT_FOUND"
  | "NOT_AUTHENTICATED"
  | "LOAD_FAILED";

export type OwnedSessionTranscript = {
  content?: string | null;
  utterances?: unknown;
} | null;

export type OwnedSessionDetail = {
  found: boolean;
  code: OwnedSessionDetailCode;
  session: Tables<"sessions"> | null;
  answers: Tables<"session_answers">[];
  scorecard: {
    overall_score?: number | null;
    score_status?: string | null;
    evaluation_status?: string | null;
    eligibility_reason?: string | null;
  } | null;
  transcript: OwnedSessionTranscript;
  debrief: Record<string, unknown> | null;
};

function scoreStatusFromRow(row: {
  overall_score?: number | null;
  evaluation_status?: string | null;
}): string {
  const evalStatus = String(row.evaluation_status ?? "").toLowerCase();
  if (evalStatus === "completed" && typeof row.overall_score === "number") return "scored";
  if (evalStatus === "processing" || evalStatus === "queued") return "pending";
  if (evalStatus.startsWith("failed")) return "failed";
  if (evalStatus === "not_eligible") return "not_scored";
  if (typeof row.overall_score === "number" && Number.isFinite(row.overall_score) && evalStatus === "completed") {
    return "scored";
  }
  return "not_scored";
}

function emptyDetail(code: OwnedSessionDetailCode): OwnedSessionDetail {
  return {
    found: false,
    code,
    session: null,
    answers: [],
    scorecard: null,
    transcript: null,
    debrief: null,
  };
}

function isMissingRpc(message: string): boolean {
  return /pgrst202|could not find the function|function.*does not exist/i.test(message);
}

async function fallbackDetail(
  sessionId: string,
  userId: string,
): Promise<OwnedSessionDetail> {
  const [session, answers, scorecard] = await Promise.all([
    sessionsDB.getByIdForUser(sessionId, userId),
    sessionAnswersDB.listBySessionIdForUser(sessionId, userId),
    scorecardsDB.getBySessionIdForUser(sessionId, userId).catch(() => null),
  ]);
  if (!session) return emptyDetail("NOT_FOUND");
  return {
    found: true,
    code: "OK",
    session,
    answers,
    scorecard: scorecard
      ? {
          overall_score:
            scorecard.evaluation_status === "completed"
              ? scorecard.overall_score ?? null
              : null,
          score_status: scoreStatusFromRow(scorecard),
          evaluation_status: scorecard.evaluation_status ?? null,
          eligibility_reason: scorecard.eligibility_reason ?? null,
        }
      : null,
    transcript: null,
    debrief: null,
  };
}

export async function loadOwnedSessionDetail(
  sessionId: string,
  userId: string,
): Promise<OwnedSessionDetail> {
  if (!userId) return emptyDetail("NOT_AUTHENTICATED");
  if (!isSessionDetailId(sessionId)) return emptyDetail("NOT_FOUND");

  const { data, error } = await supabase.rpc("get_owned_session_detail", {
    p_session_id: sessionId,
  });

  if (error) {
    if (isMissingRpc(error.message ?? "")) {
      return fallbackDetail(sessionId, userId);
    }
    const authLike = /jwt|unauthorized|not authenticated|42501/i.test(error.message ?? "");
    if (authLike) return emptyDetail("NOT_AUTHENTICATED");
    throw new Error(error.message || "Failed to load session");
  }

  const payload = (data ?? {}) as {
    found?: boolean;
    code?: string;
    session?: Tables<"sessions"> | null;
    answers?: Tables<"session_answers">[];
    scorecard?: OwnedSessionDetail["scorecard"];
    transcript?: OwnedSessionTranscript;
    debrief?: Record<string, unknown> | null;
  };

  const code = (payload.code as OwnedSessionDetailCode | undefined) ?? (
    payload.found ? "OK" : "NOT_FOUND"
  );

  if (code === "NOT_AUTHENTICATED") return emptyDetail("NOT_AUTHENTICATED");
  if (!payload.found || !payload.session) return emptyDetail("NOT_FOUND");

  return {
    found: true,
    code: "OK",
    session: payload.session,
    answers: Array.isArray(payload.answers) ? payload.answers : [],
    scorecard: payload.scorecard
      ? {
          overall_score: (() => {
            const evalStatus = String(
              (payload.scorecard as { evaluation_status?: string }).evaluation_status ?? "",
            ).toLowerCase();
            const overall = payload.scorecard.overall_score ?? null;
            if (evalStatus === "completed" && typeof overall === "number") return overall;
            if (
              typeof (payload.scorecard as { score_status?: string }).score_status === "string" &&
              (payload.scorecard as { score_status?: string }).score_status === "scored" &&
              typeof overall === "number"
            ) {
              return overall;
            }
            return null;
          })(),
          score_status: (() => {
            const raw = payload.scorecard as {
              score_status?: string;
              evaluation_status?: string;
              overall_score?: number | null;
              eligibility_reason?: string | null;
            };
            if (typeof raw.score_status === "string") return raw.score_status;
            return scoreStatusFromRow(raw);
          })(),
          evaluation_status:
            typeof (payload.scorecard as { evaluation_status?: string }).evaluation_status ===
            "string"
              ? (payload.scorecard as { evaluation_status?: string }).evaluation_status ?? null
              : null,
          eligibility_reason:
            typeof (payload.scorecard as { eligibility_reason?: string }).eligibility_reason ===
            "string"
              ? (payload.scorecard as { eligibility_reason?: string }).eligibility_reason ?? null
              : null,
        }
      : null,
    transcript: payload.transcript ?? null,
    debrief: payload.debrief ?? null,
  };
}
