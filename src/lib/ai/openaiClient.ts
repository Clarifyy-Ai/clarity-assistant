// src/lib/ai/openaiClient.ts — PRODUCTION READY// src/lib/ai/openaiClient } from "@/types/ai.types";
import { fetchEdgeJson, fetchEdge, getAuthHeaders } from "@/lib/network/fetchEdge";
import type { CoachingContext } from "@/types/ai.types";

export interface OpenAIStreamOptions {
  question: string;
  context: CoachingContext;
  isLive: boolean;
  sessionId: string;
  questionId: string;
  simpleLanguage?: boolean;
  callType?: "interview" | "regular_call";
  language?: string;
  onChunk: (chunk: string) => void;
  onDone: (fullText: string) => void;
  onError: (error: Error) => void;
  signal?: AbortSignal;
}

/**
 * Stream GPT‑4o “hint”
 * NOTE: Currently proxies to generate-hint EF (Gemini), but keeps the name for routing compatibility.
 */
export async function streamOpenAIHint(opts: OpenAIStreamOptions): Promise<void> {
  const { question, context, simpleLanguage, onChunk, onDone, onError, signal } = opts;

  const body = {
    question,
    interview_type: context.session_type ?? "behavioral",
    target_company: context.target_company ?? null,
    transcript: context.last_transcript ?? null,
    resume_context: context.resume_experience_summary ?? null,
    simple_language: simpleLanguage ?? false,
    // Optional: allow router to pass model override if you support it later
    model: undefined,
  };

  try {
    const data = await retry(
      () => fetchEdgeJson<{ hints?: string; hint?: string }>("generate-hint", body, { signal }),
      2,
      400
    );

    const hintText = data.hints ?? data.hint ?? "";
    if (hintText) onChunk(hintText);
    onDone(hintText);
  } catch (err) {
    if ((err as Error).name === "AbortError") return;
    onError(err instanceof Error ? err : new Error(String(err)));
  }
}

/**
 * Non-streaming call via prep-tool EF.
 */
export async function callOpenAI(payload: {
  messages: Array<{ role: "system" | "user" | "assistant"; content: string }>;
  model?: string;
  max_tokens?: number;
  temperature?: number;
  response_format?: { type: "json_object" | "text" };
  session_id?: string;
}): Promise<string> {
  const systemMsg = payload.messages.find((m) => m.role === "system")?.content ?? "";
  const userMessage = payload.messages.find((m) => m.role === "user")?.content ?? "";
  const combined = systemMsg ? `${systemMsg}\n\n${userMessage}` : userMessage;

  const data = await fetchEdgeJson<{ result?: string }>("prep-tool", {
    tool_id: "raw_prompt",
    input: combined,
    model: payload.model,
    max_tokens: payload.max_tokens,
    temperature: payload.temperature,
    response_format: payload.response_format,
    session_id: payload.session_id,
  });

  return data.result ?? "";
}

/**
 * Coach chat → ai-coach-chat EF
 * (non-streaming response in current version, but preserves streaming-like callbacks)
 */
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

  const lastUserMessage =
    [...messages].reverse().find((m) => m.role === "user")?.content ?? "";

  const questionContext = [
    context.session_type && `Interview type: ${context.session_type}`,
    context.role && `Role: ${context.role}`,
    context.target_company && `Target company: ${context.target_company}`,
  ]
    .filter(Boolean)
    .join(" | ");

  const body = {
    session_id: sessionId,
    question: questionContext || "General interview session",
    user_message: lastUserMessage,
    history: messages.slice(-6).map((m) => ({
      role: m.role === "assistant" ? "coach" : "user",
      text: m.content,
    })),
  };

  try {
    // This function expects auth. Use real auth headers.
    const headers = await getAuthHeaders({ "Content-Type": "application/json" });

    const res = await fetchEdge("ai-coach-chat", body, {
      method: "POST",
      headers,
      signal,
      timeoutMs: 30_000,
    });

    if (!res.ok) {
      const txt = await res.text().catch(() => "");
      throw new Error(txt || `Coach chat failed: ${res.status}`);
    }

    const data = (await res.json()) as { reply?: string };
    const reply = data.reply ?? "";

    if (reply) onChunk(reply);
    onDone(reply);
  } catch (err) {
    if ((err as Error).name === "AbortError") return;
    onError(err instanceof Error ? err : new Error(String(err)));
  }
}
import { retry } from "@/lib/utils";
