// src/lib/api/sessions.ts
//
// Session API wrappers.

import {
  createIdempotencyKey,
  invokeFunction,
  invokeIdempotentFunction,
  type IdempotencyOptions,
} from "@/lib/api/functions";

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

export type EndSessionRequest = {
  session_id: string;
  status?: "completed" | "cancelled" | "failed";
  credits_used?: number;
  duration_seconds?: number | null;
  overall_score?: number | null;
  avg_wpm?: number | null;
  total_filler_words?: number | null;
  notes?: string;
};

export type EndSessionResponse = {
  success: boolean;
  request_id: string;
  session_id: string;
  status: string;
  ended_at?: string;
  duration_seconds?: number | null;
  credits_used?: number;
  already_ended?: boolean;
};

export type SaveAnswerRequest = {
  session_id: string;
  question_id?: string | null;
  question_index?: number;
  question_text?: string;
  answer?: string;
  transcript?: string;
  score?: number | null;
  duration_seconds?: number | null;
  metadata?: Record<string, unknown>;
};

export type SaveAnswerResponse = {
  success: boolean;
  request_id: string;
  answer_id: string;
  session_id: string;
  question_index: number;
};

export type SaveTranscriptRequest = {
  session_id: string;
  content: string;
  speaker?: "user" | "ai" | "system";
  timestamp_ms?: number;
  sequence?: number;
  is_final?: boolean;
};

export type SaveTranscriptResponse = {
  success: boolean;
  request_id: string;
  transcript_id: string;
};

export async function startSession(
  payload: StartSessionRequest
): Promise<StartSessionResponse> {
  return invokeFunction<StartSessionResponse, StartSessionRequest>(
    "start-session",
    payload
  );
}

export async function endSession(
  payload: EndSessionRequest
): Promise<EndSessionResponse> {
  return invokeFunction<EndSessionResponse, EndSessionRequest>(
    "end-session",
    payload
  );
}

export async function saveAnswer(
  payload: SaveAnswerRequest,
  options: IdempotencyOptions = {}
): Promise<SaveAnswerResponse> {
  return invokeIdempotentFunction<SaveAnswerResponse, SaveAnswerRequest>(
    "save-answer",
    payload,
    {
      idempotencyKey:
        options.idempotencyKey ?? createIdempotencyKey("save-answer"),
    }
  );
}

export async function saveTranscript(
  payload: SaveTranscriptRequest,
  options: IdempotencyOptions = {}
): Promise<SaveTranscriptResponse> {
  return invokeFunction<SaveTranscriptResponse, SaveTranscriptRequest>(
    "save-transcript",
    payload,
    {
      headers: options.idempotencyKey
        ? {
            "Idempotency-Key": options.idempotencyKey,
          }
        : undefined,
    }
  );
}

export function createTranscriptSequence(): () => number {
  let sequence = 0;

  return () => {
    sequence += 1;
    return sequence;
  };
}
