// src/lib/api/ai.ts
//
// AI Edge Function wrappers.

import {
  createIdempotencyKey,
  invokeIdempotentFunction,
  streamFunction,
  type IdempotencyOptions,
} from "@/lib/api/functions";

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

export type GenerateQuestionsRequest = {
  interview_type?: string;
  company?: string;
  role?: string;
  question_count?: number;
  difficulty?: QuestionDifficulty;
  session_id?: string | null;
  resume_context?: string;
  job_description?: string;
  focus_areas?: string[];
};

export type GenerateQuestionsResponse = {
  success: boolean;
  request_id: string;
  data?: {
    questions: GeneratedQuestion[];
    count: number;
  };
  questions: GeneratedQuestion[];
  count: number;
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
};

export type GenerateAnswerRequest = {
  question: string;
  transcript?: string;
  resume_context?: string;
  interview_type?: string;
  target_company?: string;
  session_id?: string | null;
  question_id?: string | null;
  model?: string;
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

export async function generateQuestions(
  payload: GenerateQuestionsRequest,
  options: IdempotencyOptions = {}
): Promise<GenerateQuestionsResponse> {
  return invokeIdempotentFunction<
    GenerateQuestionsResponse,
    GenerateQuestionsRequest
  >("generate-questions", payload, {
    idempotencyKey:
      options.idempotencyKey ?? createIdempotencyKey("generate-questions"),
  });
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
  await streamFunction<GenerateAnswerRequest>("generate-answer", payload, {
    onChunk: options.onChunk,
    onDone: options.onDone,
    signal: options.signal,
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
