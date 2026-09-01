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
  scorecard: { overall_score?: number | null } | null;
  transcript: OwnedSessionTranscript;
  debrief: Record<string, unknown> | null;
};

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
    scorecard: scorecard ? { overall_score: scorecard.overall_score ?? null } : null,
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
    scorecard: payload.scorecard ?? null,
    transcript: payload.transcript ?? null,
    debrief: payload.debrief ?? null,
  };
}
