// supabase/functions/_shared/sessionEnforcement.ts
//
// Server-side guard: AI generation endpoints may only run for practice contexts.
// Allowed DB session types: mock, warmup, rehearsal, room, practice.
// type=live is allowed only when the DB identifies it as practice: either it has
// a practice/rehearsal tag or it is not linked to an actual scheduled interview.
//
// SECURITY: Session practice status ONLY comes from trusted DB fields.
// Client-supplied is_practice / requestPracticeFlag is NOT trusted.

import { forbiddenResponse } from "./auth.ts";
import { createServiceClient } from "./supabase.ts";

/** Session types that always permit AI generation. */
export const AI_ALLOWED_SESSION_TYPES = [
  "mock",
  "warmup",
  "rehearsal",
  "practice",
  "room",
] as const;

export type AiAllowedSessionType = (typeof AI_ALLOWED_SESSION_TYPES)[number];

/** Modes permitted when no session_id is supplied (sessionless AI calls). */
export const SESSIONLESS_AI_MODES = [
  "mock",
  "warmup",
  "rehearsal",
  "practice",
] as const;

export type SessionlessAiMode = (typeof SESSIONLESS_AI_MODES)[number];

export type SessionRowForAiCheck = {
  id?: string;
  type?: string | null;
  session_type?: string | null;
  tags?: string[] | null;
  interview_id?: string | null;
  user_id?: string;
  status?: string | null;
  expires_at?: string | null;
  lifecycle_status?: string | null;
  terminal_reason?: string | null;
};

export function normalizeSessionType(type?: string | null): string {
  return String(type ?? "").trim().toLowerCase();
}

export function sessionHasPracticeFlag(session: SessionRowForAiCheck): boolean {
  const tags = session.tags ?? [];
  return tags.includes("practice") || tags.includes("rehearsal");
}

export function isDatabasePracticeSession(session: SessionRowForAiCheck): boolean {
  return sessionHasPracticeFlag(session) || !session.interview_id;
}

/** Merge practice/rehearsal tags onto a live row when the client started Practice Coach. */
export function mergePracticeTags(
  existing: string[] | null | undefined,
  options: { sessionType: string; isPractice: boolean },
): string[] | null {
  const sessionType = normalizeSessionType(options.sessionType);
  const needsPractice =
    options.isPractice &&
    sessionType === "live" &&
    !sessionHasPracticeFlag({ tags: existing ?? [] });
  if (!needsPractice) return existing?.length ? existing : null;
  return Array.from(new Set([...(existing ?? []), "practice"]));
}

export function isSessionTypeAllowedForAi(
  session: SessionRowForAiCheck,
): { allowed: boolean; code?: string; message?: string } {
  const sessionType = normalizeSessionType(session.type ?? session.session_type);

  if (AI_ALLOWED_SESSION_TYPES.includes(sessionType as AiAllowedSessionType)) {
    return { allowed: true };
  }

  if (sessionType === "live") {
    if (isDatabasePracticeSession(session)) {
      return { allowed: true };
    }

    return {
      allowed: false,
      code: "LIVE_SESSION_AI_FORBIDDEN",
      message:
        "AI assistance is unavailable for sessions linked to an actual scheduled interview. Start a new session from Practice Coach or Mock Interview for practice assistance.",
    };
  }

  if (!sessionType) {
    return {
      allowed: false,
      code: "SESSION_TYPE_REQUIRED",
      message: "Session type is required for AI generation.",
    };
  }

  return {
    allowed: false,
    code: "SESSION_TYPE_AI_FORBIDDEN",
    message: `AI generation is not allowed for session type "${sessionType}".`,
  };
}

export function aiSessionForbiddenResponse(message: string): Response {
  return new Response(
    JSON.stringify({
      success: false,
      error: message,
      code: "FORBIDDEN",
    }),
    {
      status: 403,
      headers: { "Content-Type": "application/json" },
    },
  );
}

/** Returns null when sessionless mode is valid; otherwise a 422 Response. */
export function validateSessionlessAiMode(
  mode: string | null | undefined,
): Response | null {
  const requestedMode = normalizeSessionType(mode);

  if (
    !requestedMode ||
    !SESSIONLESS_AI_MODES.includes(requestedMode as SessionlessAiMode)
  ) {
    return new Response(
      JSON.stringify({
        success: false,
        error:
          "Either session_id must be provided, or mode must be one of: mock, warmup, rehearsal, practice.",
        code: "VALIDATION_ERROR",
      }),
      { status: 422, headers: { "Content-Type": "application/json" } },
    );
  }

  return null;
}

/**
 * Validates session ownership + type when session_id is present.
 * Returns null when access is allowed (or no session_id was supplied).
 */
export async function enforceAiSessionAccess(options: {
  sessionId: string | null | undefined;
  authenticatedUserId: string;
}): Promise<Response | null> {
  const { sessionId, authenticatedUserId } = options;

  if (!sessionId) {
    return null;
  }

  const db = createServiceClient();

  const { data, error } = await db
    .from("sessions")
    .select("id, type, tags, interview_id, user_id, status, expires_at, lifecycle_status, terminal_reason")
    .eq("id", sessionId)
    .maybeSingle();

  if (error) {
    console.error("[sessionEnforcement] Lookup failed:", error.message);
    return new Response(
      JSON.stringify({
        error: "Could not verify session.",
        code: "INTERNAL_ERROR",
      }),
      { status: 500, headers: { "Content-Type": "application/json" } },
    );
  }

  if (!data) {
    return new Response(
      JSON.stringify({
        error: "Session not found.",
        code: "NOT_FOUND",
      }),
      { status: 404, headers: { "Content-Type": "application/json" } },
    );
  }

  if (data.user_id !== authenticatedUserId) {
    return forbiddenResponse("You do not have permission to access this session.");
  }

  const status = String((data as SessionRowForAiCheck).status ?? "");
  const lifecycle = String((data as SessionRowForAiCheck).lifecycle_status ?? "");
  const expiresAt = (data as SessionRowForAiCheck).expires_at;
  const expiredByTime = Boolean(expiresAt && Date.parse(expiresAt) <= Date.now());
  const open = status === "pending" || status === "active" || status === "paused";
  const timedOut = lifecycle === "EXPIRED" || (open && expiredByTime);
  if (open && timedOut) {
    return new Response(
      JSON.stringify({
        error: "This practice session has expired and can no longer accept new actions.",
        code: "SESSION_EXPIRED",
        reason: "SESSION_EXPIRED",
      }),
      { status: 409, headers: { "Content-Type": "application/json" } },
    );
  }

  const verdict = isSessionTypeAllowedForAi(data as SessionRowForAiCheck);

  if (!verdict.allowed) {
    return aiSessionForbiddenResponse(verdict.message!);
  }

  return null;
}
