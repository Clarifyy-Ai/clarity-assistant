// supabase/functions/_shared/sessionEnforcement.ts
//
// Server-side guard: AI generation endpoints may only run for practice contexts.
// Allowed DB session types: mock, warmup, rehearsal, room, practice.
// type=live is blocked unless the session's DB tags array contains "practice" or "rehearsal".
//
// SECURITY: Session practice status ONLY comes from the DB tags array.
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
};

export function normalizeSessionType(type?: string | null): string {
  return String(type ?? "").trim().toLowerCase();
}

export function sessionHasPracticeFlag(session: SessionRowForAiCheck): boolean {
  const tags = session.tags ?? [];
  return tags.includes("practice") || tags.includes("rehearsal");
}

export function isSessionTypeAllowedForAi(
  session: SessionRowForAiCheck,
): { allowed: boolean; code?: string; message?: string } {
  const sessionType = normalizeSessionType(session.type ?? session.session_type);

  if (AI_ALLOWED_SESSION_TYPES.includes(sessionType as AiAllowedSessionType)) {
    return { allowed: true };
  }

  if (sessionType === "live") {
    if (sessionHasPracticeFlag(session)) {
      return { allowed: true };
    }

    return {
      allowed: false,
      code: "LIVE_SESSION_AI_FORBIDDEN",
      message:
        "AI generation is not permitted during live employer interviews. Use Mock, Warmup, or Live Rehearsal sessions for practice AI assistance.",
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
    .select("id, type, tags, interview_id, user_id")
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

  const verdict = isSessionTypeAllowedForAi(data as SessionRowForAiCheck);

  if (!verdict.allowed) {
    return aiSessionForbiddenResponse(verdict.message!);
  }

  return null;
}
