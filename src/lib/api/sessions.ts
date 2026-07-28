// src/lib/api/sessions.ts
//
// Session API wrappers.

import { invokeFunction } from "@/lib/api/functions";

export type StartSessionRequest = {
  session_type?: "mock" | "live" | "warmup" | "rehearsal" | "room" | "practice";
  type?: "mock" | "live" | "warmup" | "rehearsal" | "room" | "practice";
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
};

export type StartSessionResponse = {
  session_id: string;
  config: Record<string, unknown>;
  started_at: string;
  reused?: boolean;
};

export async function startSession(
  payload: StartSessionRequest
): Promise<StartSessionResponse> {
  return invokeFunction<StartSessionResponse, StartSessionRequest>(
    "start-session",
    payload
  );
}
