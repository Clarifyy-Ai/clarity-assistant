import { consumeSSEStream } from "./geminiClient";
import { retry } from "@/lib/utils";
import type { CoachingContext } from "@/types/ai.types";

// ─────────────────────────────────────────────────────────────────
// OpenAI Client — redirects to generate-hint (Gemini) edge function.
// TODO: restore native GPT-4o support once an openai edge function
//       is deployed server-side.
// ─────────────────────────────────────────────────────────────────

const EDGE_BASE = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1`;

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

// ─────────────────────────────────────────────────────────────────
// Stream GPT-4o hint — falls back to generate-hint (Gemini) until
// a dedicated openai edge function is deployed.
// ─────────────────────────────────────────────────────────────────

export async function streamOpenAIHint(opts: OpenAIStreamOptions): Promise<void> {
  const {
    question, context,
    sessionId, questionId,
    simpleLanguage, callType, language,
    onChunk, onDone, onError, signal,
  } = opts;

  const body = JSON.stringify({
    user_id:         context.user_id ?? "",
    question,
    interview_type:  context.session_type ?? "behavioural",
    target_company:  context.target_company ?? null,
    transcript:      null,
    resume_text:     context.resume_experience_summary ?? null,
    simple_language: simpleLanguage ?? false,
  });

  try {
    const response = await retry(
      () =>
        fetch(`${EDGE_BASE}/generate-hint`, {
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
      throw new Error(`Hint failed: ${response.status}`);
    }

    const data = await response.json();
    const hint: string = data.hint ?? "";
    if (hint) onChunk(hint);
    onDone(hint);
  } catch (err) {
    if ((err as Error).name === "AbortError") return;
    onError(err instanceof Error ? err : new Error(String(err)));
  }
}

// ─────────────────────────────────────────────────────────────────
// Non-streaming call — falls back to generate-hint
// ─────────────────────────────────────────────────────────────────

export async function callOpenAI(payload: {
  messages: Array<{ role: "system" | "user" | "assistant"; content: string }>;
  model?: string;
  max_tokens?: number;
  temperature?: number;
  response_format?: { type: "json_object" | "text" };
  session_id?: string;
}): Promise<string> {
  const systemMsg  = payload.messages.find((m) => m.role === "system")?.content ?? "";
  const userMessage = payload.messages.find((m) => m.role === "user")?.content ?? "";
  const combined = systemMsg ? `${systemMsg}\n\n${userMessage}` : userMessage;

  const response = await fetch(`${EDGE_BASE}/prep-tool`, {
    method: "POST",
    headers: {
      "Content-Type":  "application/json",
      "Authorization": `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}`,
    },
    body: JSON.stringify({ tool_id: "raw_prompt", input: combined }),
  });

  if (!response.ok) {
    throw new Error(`AI call failed: ${response.status}`);
  }

  const data = await response.json();
  return data.result ?? "";
}

// ─────────────────────────────────────────────────────────────────
// Coach chat — routes to ai-coach-chat edge function
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

  const lastUserMessage = [...messages].reverse().find((m) => m.role === "user")?.content ?? "";

  // Build a context-rich question string for the coach to understand the session.
  // ai-coach-chat uses `question` as the current interview question + context prefix.
  const questionContext = [
    context.session_type && `Interview type: ${context.session_type}`,
    context.role && `Role: ${context.role}`,
    context.target_company && `Target company: ${context.target_company}`,
  ].filter(Boolean).join(" | ");

  const body = JSON.stringify({
    session_id:   sessionId,
    question:     questionContext || "General interview session",
    user_message: lastUserMessage,
    history:      messages.slice(-6).map((m) => ({
      role: m.role === "assistant" ? "coach" : "user",
      text: m.content,
    })),
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
    const data = await response.json();
    const reply: string = data.reply ?? "";
    if (reply) onChunk(reply);
    onDone(reply);
  } catch (err) {
    if ((err as Error).name === "AbortError") return;
    onError(err instanceof Error ? err : new Error(String(err)));
  }
}
