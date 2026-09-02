// src/lib/api/sessions.ts
//
// Session API wrappers.

import { invokeFunction } from "@/lib/api/functions";

export type StartSessionRequest = {
  session_type?: "mock" | "live" | "warmup" | "rehearsal" | "room" | "practice";
  type?: "mock" | "live" | "warmup" | "rehearsal" | "room" | "practice";
  action?: "start" | "eligibility" | "restore" | "heartbeat";
  session_id?: string | null;
  check_only?: boolean;
  /** Required for type=live practice overlay — server sets DB practice tag. */
  is_practice?: boolean;
  interview_type?:
    | "behavioral"
    | "behavioural"
    | "technical"
    | "case_study"
    | "system_design"
    | "hr"
    | "mixed"
    | "custom"
    | string;
  company?: string | null;
  role?: string | null;
  resume_id?: string | null;
  jd_id?: string | null;
  duration_minutes?: number;
  question_count?: number;
  personality_type?: "strict" | "friendly" | "neutral" | "panel";
  enable_recording?: boolean;
  enable_transcription?: boolean;
  enable_metrics?: boolean;
  model?: string;
  hint_style?: "minimal" | "balanced" | "detailed";
  focus_areas?: string[];
  practice_context_id?: string | null;
  source_type?: string | null;
  session_call_type?: "interview" | "regular_call" | null;
};

export type StartSessionResponse = {
  session_id: string;
  config: Record<string, unknown>;
  started_at: string;
  expires_at?: string | null;
  reused?: boolean;
  status?: string;
  lifecycle_status?: string;
  found?: boolean;
  reason?: string;
  used?: number | null;
  limit?: number | null;
  reset_at?: string | null;
  terminal_reason?: string | null;
  duration_seconds?: number | null;
};

export async function startSession(
  payload: StartSessionRequest,
  options?: { idempotencyKey?: string; signal?: AbortSignal },
): Promise<StartSessionResponse> {
  return invokeFunction<StartSessionResponse, StartSessionRequest>(
    "start-session",
    payload,
    {
      ...(options?.idempotencyKey ? { idempotencyKey: options.idempotencyKey } : {}),
      ...(options?.signal ? { signal: options.signal } : {}),
    },
  );
}

export async function checkSessionStartEligibility(): Promise<StartSessionResponse> {
  return invokeFunction("start-session", { action: "eligibility", check_only: true });
}

export async function restoreOwnedSession(input?: {
  session_id?: string | null;
  session_type?: StartSessionRequest["session_type"];
}): Promise<StartSessionResponse> {
  return invokeFunction("start-session", {
    action: "restore",
    session_id: input?.session_id ?? undefined,
    session_type: input?.session_type,
    type: input?.session_type,
  });
}

export async function heartbeatOwnedSession(sessionId: string): Promise<StartSessionResponse> {
  return invokeFunction("start-session", {
    action: "heartbeat",
    session_id: sessionId,
  });
}

export async function endSession(input: {
  session_id: string;
  terminal_reason?: string;
}): Promise<{
  session_id: string;
  status: string;
  terminal_reason: string | null;
  ended_at: string | null;
  duration_seconds: number | null;
  already_terminal?: boolean;
}> {
  return invokeFunction("end-session", input);
}

export type FinalizeSessionInput = {
  session_id: string;
  terminal_reason?: string;
  answers?: Array<{
    question_index: number;
    question: string;
    answer?: string | null;
    duration_ms?: number | null;
  }>;
  transcript?: { content: string; utterances?: unknown } | null;
  metrics?: Record<string, unknown>;
};

export async function finalizeSession(input: FinalizeSessionInput) {
  return invokeFunction<{
    session_id: string;
    status: string;
    lifecycle_status: string | null;
    terminal_reason: string | null;
    ended_at: string | null;
    duration_seconds: number | null;
    already_terminal?: boolean;
  }>("finalize-session", input);
}
