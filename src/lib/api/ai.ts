// src/lib/api/ai.ts — PRODUCTION FIXED
// Fixes (F3):
// - GenerateQuestionsRequest: added canonical fields (type, count) matching edge fn schema
//   Legacy fields (interview_type, question_count) kept as optional aliases for safety
// - generateQuestions: normalizes legacy→canonical field names before dispatch
// - GenerateQuestionsResponse: data.questions vs root questions ambiguity resolved
// - GenerateAnswerRequest: added context + answer_mode fields (Gemini path requires these)
// - streamGenerateAnswer: passes answer_mode through to edge function

import {
  createIdempotencyKey,
  invokeIdempotentFunction,
  streamFunction,
  type IdempotencyOptions,
} from "@/lib/api/functions";

/* ─── TYPES ─────────────────────────────────────────────────────────────── */

export type QuestionDifficulty = "easy" | "medium" | "hard" | "mixed";

export type GeneratedQuestion = {
  id: string;
  question_text: string;
  question: string;
  difficulty: string;
  type: string;
  tags: string[];
  order: number;
};

// ✅ FIX: Canonical field names match generate-questions/index.ts zod schema.
// Legacy aliases (interview_type, question_count) are kept for backward compatibility
// with any existing callers — generateQuestions() normalizes them before dispatch.
export type GenerateQuestionsRequest = {
  // ── Canonical (edge function contract) ──
  type?: string;           // interview type — replaces interview_type
  count?: number;          // question count — replaces question_count
  role?: string;
  company?: string;
  difficulty?: QuestionDifficulty;
  resume_context?: string;
  job_description?: string;
  focus_areas?: string[];
  session_id?: string | null;

  // ── Legacy aliases (deprecated — normalize in generateQuestions()) ──
  /** @deprecated use `type` */
  interview_type?: string;
  /** @deprecated use `count` */
  question_count?: number;
};

// ✅ FIX: Edge function returns questions at root level, not nested under data.
// data.questions was an older response shape; we now read root questions first,
// fall back to data.questions for any cached/legacy responses still in flight.
export type GenerateQuestionsResponse = {
  success: boolean;
  request_id: string;
  // Root-level (current edge fn response shape)
  questions: GeneratedQuestion[];
  count: number;
  // Legacy nested shape (kept for backward compat — prefer root)
  data?: {
    questions: GeneratedQuestion[];
    count: number;
  };
};

export type GenerateHintRequest = {
  question: string;
  transcript?: string;
  resume_context?: string;
  interview_type?: string;
  target_company?: string;
  session_id?: string | null;
  question_id?: string | null;
  model?: string;
};

export type GenerateHintResponse = {
  success?: boolean;
  request_id?: string;
  hints: string;
  source: "ai" | "fallback";
  refunded?: boolean;
  error?: string;
  code?: string;
};

// ✅ FIX: Added context and answer_mode — both required by generate-answer/index.ts
// when routing through Gemini. Previously these were omitted, causing the edge
// function to fall back to an empty context envelope and return no answer.
export type GenerateAnswerRequest = {
  question: string;
  transcript?: string;
  resume_context?: string;
  interview_type?: string;
  target_company?: string;
  session_id?: string | null;
  question_id?: string | null;
  model?: string;
  /** Full context envelope from contextEnvelopeBuilder — required for Gemini path */
  context?: Record<string, unknown>;
  /** "hint" | "full_answer" — controls response length and style */
  answer_mode?: "hint" | "full_answer";
};

export type GenerateDebriefRequest = {
  session_id: string;
  model?: string;
};

export type GenerateDebriefResponse = {
  success: boolean;
  request_id: string;
  debrief: Record<string, unknown>;
  session: Record<string, unknown>;
};

export type CoachHistoryMessage = {
  role: "user" | "coach" | "assistant";
  text: string;
};

export type AiCoachChatRequest = {
  session_id: string;
  question?: string;
  transcript?: string;
  user_message: string;
  history?: CoachHistoryMessage[];
  model?: string;
};

export type AiCoachChatResponse = {
  success: boolean;
  request_id: string;
  reply: string;
};

export type StreamGenerateAnswerOptions = IdempotencyOptions & {
  onChunk: (text: string) => void;
  onDone?: () => void;
  signal?: AbortSignal;
};

/* ─── FUNCTIONS ──────────────────────────────────────────────────────────── */

export async function generateQuestions(
  payload: GenerateQuestionsRequest,
  options: IdempotencyOptions = {}
): Promise<GenerateQuestionsResponse> {
  // ✅ FIX: Normalize legacy field names to canonical contract before dispatch.
  // This ensures callers that still pass interview_type / question_count continue
  // to work while the edge function only ever receives the canonical shape.
  const normalized: GenerateQuestionsRequest = {
    ...payload,
    // Canonical wins; legacy fills in only if canonical is absent
    type:  payload.type  ?? payload.interview_type,
    count: payload.count ?? payload.question_count,
  };

  // Strip legacy aliases so they don't pollute the edge fn payload
  const { interview_type: _it, question_count: _qc, ...clean } = normalized;

  const response = await invokeIdempotentFunction<
    GenerateQuestionsResponse,
    Omit<GenerateQuestionsRequest, "interview_type" | "question_count">
  >("generate-questions", clean, {
    idempotencyKey:
      options.idempotencyKey ?? createIdempotencyKey("generate-questions"),
  });

  // ✅ FIX: Normalize response — some edge fn versions wrap under data{}, others
  // return questions at root. Always return a consistent root-level shape.
  return {
    ...response,
    questions: response.questions ?? response.data?.questions ?? [],
    count:     response.count     ?? response.data?.count     ?? 0,
  };
}

export async function generateHint(
  payload: GenerateHintRequest,
  options: IdempotencyOptions = {}
): Promise<GenerateHintResponse> {
  return invokeIdempotentFunction<GenerateHintResponse, GenerateHintRequest>(
    "generate-hint",
    payload,
    {
      idempotencyKey:
        options.idempotencyKey ?? createIdempotencyKey("generate-hint"),
    }
  );
}

export async function generateDebrief(
  payload: GenerateDebriefRequest,
  options: IdempotencyOptions = {}
): Promise<GenerateDebriefResponse> {
  return invokeIdempotentFunction<
    GenerateDebriefResponse,
    GenerateDebriefRequest
  >("generate-debrief", payload, {
    idempotencyKey:
      options.idempotencyKey ?? createIdempotencyKey("generate-debrief"),
  });
}

export async function aiCoachChat(
  payload: AiCoachChatRequest,
  options: IdempotencyOptions = {}
): Promise<AiCoachChatResponse> {
  return invokeIdempotentFunction<AiCoachChatResponse, AiCoachChatRequest>(
    "ai-coach-chat",
    payload,
    {
      idempotencyKey:
        options.idempotencyKey ?? createIdempotencyKey("ai-coach-chat"),
    }
  );
}

export async function streamGenerateAnswer(
  payload: GenerateAnswerRequest,
  options: StreamGenerateAnswerOptions
): Promise<void> {
  // ✅ FIX: answer_mode and context are now part of GenerateAnswerRequest and
  // must be forwarded — previously they were silently dropped, causing Gemini
  // to receive no context envelope and return an empty/fallback response.
  await streamFunction<GenerateAnswerRequest>("generate-answer", payload, {
    onChunk: options.onChunk,
    onDone:  options.onDone,
    signal:  options.signal,
    idempotencyKey:
      options.idempotencyKey ?? createIdempotencyKey("generate-answer"),
  });
}

export async function generateAnswerText(
  payload: GenerateAnswerRequest
): Promise<string> {
  let output = "";

  await streamGenerateAnswer(payload, {
    onChunk: (text) => {
      output += text;
    },
  });

  return output;
}
