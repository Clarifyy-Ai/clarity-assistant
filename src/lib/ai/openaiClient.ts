import { buildSystemPrompt } from "./contextEnvelopeBuilder";
import { consumeSSEStream } from "./geminiClient";
import { retry } from "@/lib/utils";
import type { CoachingContext } from "@/types/ai.types";

// ─────────────────────────────────────────────────────────────────
// OpenAI Client — proxied via Supabase Edge Function
// ─────────────────────────────────────────────────────────────────

const EDGE_BASE = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1`;

export interface OpenAIStreamOptions {
  question: string;
  context: CoachingContext;
  isLive: boolean;
  sessionId: string;
  questionId: string;
  onChunk: (chunk: string) => void;
  onDone: (fullText: string) => void;
  onError: (error: Error) => void;
  signal?: AbortSignal;
}

// ─────────────────────────────────────────────────────────────────
// Stream GPT-4o hint
// ─────────────────────────────────────────────────────────────────

export async function streamOpenAIHint(opts: OpenAIStreamOptions): Promise<void> {
  const {
    question, context, isLive,
    sessionId, questionId,
    onChunk, onDone, onError, signal,
  } = opts;

  const systemPrompt = buildSystemPrompt(context, isLive);

  const body = JSON.stringify({
    model:       "gpt-4o",
    messages: [
      { role: "system",  content: systemPrompt },
      { role: "user",    content: question },
    ],
    stream:       true,
    max_tokens:   600,
    temperature:  0.7,
    session_id:   sessionId,
    question_id:  questionId,
  });

  try {
    const response = await retry(
      () =>
        fetch(`${EDGE_BASE}/ai-hint-openai`, {
          method: "POST",
          headers: {
            "Content-Type":  "application/json",
            "Authorization": `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}`,
          },
          body,
          signal,
        }),
      2,
      400
    );

    if (!response.ok) {
      throw new Error(`OpenAI hint failed: ${response.status}`);
    }

    if (!response.body) throw new Error("OpenAI response has no body");

    await consumeSSEStream(response.body, onChunk, onDone, onError);
  } catch (err) {
    if ((err as Error).name === "AbortError") return;
    onError(err instanceof Error ? err : new Error(String(err)));
  }
}

// ─────────────────────────────────────────────────────────────────
// Non-streaming GPT-4o call
// ─────────────────────────────────────────────────────────────────

export async function callOpenAI(payload: {
  messages: Array<{ role: "system" | "user" | "assistant"; content: string }>;
  model?: string;
  max_tokens?: number;
  temperature?: number;
  response_format?: { type: "json_object" | "text" };
  session_id?: string;
}): Promise<string> {
  const response = await fetch(`${EDGE_BASE}/ai-openai`, {
    method: "POST",
    headers: {
      "Content-Type":  "application/json",
      "Authorization": `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}`,
    },
    body: JSON.stringify({
      model:           payload.model ?? "gpt-4o",
      messages:        payload.messages,
      max_tokens:      payload.max_tokens ?? 800,
      temperature:     payload.temperature ?? 0.7,
      response_format: payload.response_format ?? { type: "text" },
      stream:          false,
      session_id:      payload.session_id,
    }),
  });

  if (!response.ok) {
    throw new Error(`OpenAI call failed: ${response.status}`);
  }

  const data = await response.json();
  return data.choices?.[0]?.message?.content ?? "";
}

// ─────────────────────────────────────────────────────────────────
// Coach chat with GPT-4o — multi-turn
// ─────────────────────────────────────────────────────────────────

export async function streamCoachChat(opts: {
  messages: Array<{ role: "user" | "assistant"; content: string }>;
  context: CoachingContext;
  sessionId: string;
  onChunk: (chunk: string) => void;
  onDone: (fullText: string) => void;
  onError: (error: Error) => void;
  signal?: AbortSignal;
}): Promise<void> {
  const { messages, context, sessionId, onChunk, onDone, onError, signal } = opts;

  const systemMessage = {
    role: "system" as const,
    content: `You are Clarify AI, an expert, encouraging interview coach.
You are helping a candidate improve during their practice session.
Be concise, specific, and actionable. Maximum 3 sentences per response unless the user asks for more detail.

Candidate context:
- Role: ${context.role ?? "Engineer"}, ${context.experience_level}-level
- Target company: ${context.target_company ?? "not specified"}
- Session type: ${context.session_type}
- Known weak areas: ${context.weak_areas.join(", ") || "none identified yet"}
- Coach tone: ${context.coach_tone}`,
  };

  const body = JSON.stringify({
    model:      "gpt-4o",
    messages:   [systemMessage, ...messages],
    stream:     true,
    max_tokens: 400,
    session_id: sessionId,
  });

  try {
    const response = await fetch(`${EDGE_BASE}/ai-coach-chat`, {
      method: "POST",
      headers: {
        "Content-Type":  "application/json",
        "Authorization": `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}`,
      },
      body,
      signal,
    });

    if (!response.ok) throw new Error(`Coach chat failed: ${response.status}`);
    if (!response.body) throw new Error("Coach chat has no body");

    await consumeSSEStream(response.body, onChunk, onDone, onError);
  } catch (err) {
    if ((err as Error).name === "AbortError") return;
    onError(err instanceof Error ? err : new Error(String(err)));
  }
}
