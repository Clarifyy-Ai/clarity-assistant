// src/lib/ai/openaiClient.ts — PRODUCTION READY
import { fetchEdge, fetchEdgeJson, getAuthHeaders } from "@/lib/network/fetchEdge";
import { createIdempotencyKey } from "@/lib/api/functions";
import { consumeSSEStream } from "@/lib/ai/geminiClient";
import { ApiClientError } from "@/lib/api/apiClient";
import type { CoachingContext } from "@/types/ai.types";
import type { CoachTone, HintStyle } from "@/types/user.types";

export interface OpenAIStreamOptions {
  question: string;
  context: CoachingContext;
  model?: string;
  isLive: boolean;
  sessionId: string;
  questionId: string;
  /** Sessionless AI mode when sessionId is absent. */
  mode?: string;
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

  const sessionId =
    typeof opts.sessionId === "string" &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
      opts.sessionId,
    )
      ? opts.sessionId
      : null;
  const mode =
    opts.mode ??
    (sessionId ? undefined : opts.isLive ? "rehearsal" : "practice");

  const body = {
    question,
    model: opts.model ?? "gpt-4o",
    interview_type: context.session_type ?? "behavioral",
    target_company: context.target_company ?? "",
    transcript: context.last_transcript ?? "",
    resume_context: context.resume_experience_summary ?? "",
    simple_language: simpleLanguage ?? false,
    session_id: sessionId,
    ...(mode ? { mode } : {}),
  };

  try {
    const idempotencyKey =
      typeof opts.questionId === "string" && opts.questionId.length > 0
        ? opts.questionId
        : createIdempotencyKey("generate-hint");
    const headers = await getAuthHeaders({
      Accept: "text/event-stream",
      "Idempotency-Key": idempotencyKey,
      "x-idempotency-key": idempotencyKey,
    });
    const response = await fetchEdge("generate-hint", body, {
      method: "POST",
      headers,
      signal,
      timeoutMs: 60_000,
    });
    if (!response.ok) {
      const errText = await response.text().catch(() => `HTTP ${response.status}`);
      let parsed: { error?: string; code?: string } | null = null;
      try {
        parsed = JSON.parse(errText) as { error?: string; code?: string };
      } catch {
        parsed = null;
      }
      throw new ApiClientError({
        message: parsed?.error || `Hint generation failed (${response.status}).`,
        status: response.status,
        code: parsed?.code ?? "",
      });
    }
    if (!response.body) {
      throw new ApiClientError({
        message: "Hint stream returned an empty body.",
        status: 502,
        code: "EMPTY_STREAM",
      });
    }
    await consumeSSEStream(response.body, onChunk, onDone, onError, signal);
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
  }, {
    headers: {
      "Idempotency-Key": createIdempotencyKey("prep-tool"),
    },
  });

  return data.result ?? "";
}

export type CoachChatStreamOptions = {
  message: string;
  sessionId: string;
  conversationId?: string | null;
  previousTurns?: Array<{ role: "user" | "assistant"; text: string }>;
  currentQuestion?: string;
  recentTranscript?: string;
  resumeContext?: string;
  jobDescription?: string;
  recentAnswers?: string[];
  coachTone?: CoachTone;
  hintStyle?: HintStyle;
  model?: string;
  idempotencyKey?: string;
  timeoutMs?: number;
  onMeta?: (meta: {
    conversation_id: string;
    message_id: string;
    correlation_id: string;
  }) => void;
  onChunk: (chunk: string) => void;
  onDone: (result: {
    fullText: string;
    conversation_id: string;
    message_id: string;
    source: string;
  }) => void;
  onError: (error: Error) => void;
  signal?: AbortSignal;
};

/**
 * Coach chat → ai-coach-chat EF (SSE streaming).
 */
export async function streamCoachChat(opts: CoachChatStreamOptions): Promise<void> {
  const {
    message,
    sessionId,
    conversationId,
    onChunk,
    onDone,
    onError,
    onMeta,
    signal,
  } = opts;

  const body = {
    session_id: sessionId,
    conversation_id: conversationId ?? null,
    message,
    previous_turns: (opts.previousTurns ?? []).slice(-12).map((turn) => ({
      role: turn.role === "assistant" ? "coach" : "user",
      content: turn.text.slice(0, 2_000),
    })),
    context: {
      current_question: opts.currentQuestion ?? "",
      recent_transcript: opts.recentTranscript ?? "",
      resume_context: opts.resumeContext ?? "",
      job_description: opts.jobDescription ?? "",
      recent_answers: opts.recentAnswers ?? [],
    },
    coach_tone: opts.coachTone ?? "",
    hint_style: opts.hintStyle ?? "",
    model: opts.model ?? "",
  };

  try {
    const idempotencyKey =
      opts.idempotencyKey ?? createIdempotencyKey("ai-coach-chat");
    const headers = await getAuthHeaders({
      "Content-Type": "application/json",
      Accept: "text/event-stream",
      "Idempotency-Key": idempotencyKey,
      "x-idempotency-key": idempotencyKey,
    });

    const res = await fetchEdge("ai-coach-chat", body, {
      method: "POST",
      headers,
      signal,
      timeoutMs: opts.timeoutMs ?? 45_000,
    });

    if (!res.ok) {
      const errText = await res.text().catch(() => "");
      let parsed: { error?: string; code?: string; message?: string } | null = null;
      try {
        parsed = JSON.parse(errText) as {
          error?: string;
          code?: string;
          message?: string;
        };
      } catch {
        parsed = null;
      }
      const code = String(parsed?.code ?? "").toUpperCase() || "API_ERROR";
      const providerUnavailable =
        res.status === 502 ||
        res.status === 503 ||
        code === "AI_UNAVAILABLE" ||
        code === "PROVIDER_UNAVAILABLE";
      const insufficientCredits =
        !providerUnavailable &&
        (code === "PAYMENT_REQUIRED" ||
          code === "INSUFFICIENT_CREDITS" ||
          res.status === 402);
      throw new ApiClientError({
        message:
          parsed?.error ||
          parsed?.message ||
          (insufficientCredits
            ? "Insufficient credits. Please top up to continue chatting with your coach."
            : providerUnavailable
              ? "Your coach is temporarily unavailable. Please retry."
              : `Coach chat failed (${res.status}).`),
        status: res.status,
        code: insufficientCredits
          ? "INSUFFICIENT_CREDITS"
          : providerUnavailable
            ? "AI_PROVIDER_UNAVAILABLE"
            : code,
      });
    }

    if (!res.body) {
      throw new ApiClientError({
        message: "Your coach is temporarily unavailable. Please retry.",
        status: 502,
        code: "AI_PROVIDER_UNAVAILABLE",
      });
    }

    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    let fullText = "";
    let metaConversationId = conversationId ?? "";
    let metaMessageId = "";
    let source = "ai";

    while (true) {
      if (signal?.aborted) {
        try {
          await reader.cancel();
        } catch {
          /* ignore */
        }
        return;
      }

      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true }).replace(/\r/g, "");
      const lines = buffer.split("\n");
      buffer = lines.pop() ?? "";

      for (const line of lines) {
        if (!line || !line.startsWith("data:")) continue;
        const data = line.slice(5).trim();
        if (!data || data === "[DONE]") continue;

        let parsed: Record<string, unknown>;
        try {
          parsed = JSON.parse(data) as Record<string, unknown>;
        } catch {
          continue;
        }

        const eventType = String(parsed.type ?? "");

        if (eventType === "meta" || (parsed.conversation_id && !parsed.text && !eventType)) {
          metaConversationId = String(parsed.conversation_id ?? metaConversationId);
          metaMessageId = String(parsed.message_id ?? metaMessageId);
          onMeta?.({
            conversation_id: metaConversationId,
            message_id: metaMessageId,
            correlation_id: String(parsed.correlation_id ?? ""),
          });
          continue;
        }

        if (eventType === "error") {
          throw new ApiClientError({
            message:
              String(parsed.error ?? "") ||
              "Your coach is temporarily unavailable. Please retry.",
            status: 502,
            code: String(parsed.code ?? "AI_UNAVAILABLE"),
          });
        }

        if (eventType === "done") {
          const reply = String(parsed.reply ?? fullText);
          fullText = reply || fullText;
          metaConversationId = String(parsed.conversation_id ?? metaConversationId);
          metaMessageId = String(parsed.message_id ?? metaMessageId);
          source = String(parsed.source ?? source);
          onDone({
            fullText,
            conversation_id: metaConversationId,
            message_id: metaMessageId,
            source,
          });
          return;
        }

        const chunk = typeof parsed.text === "string" ? parsed.text : "";
        if (chunk) {
          fullText += chunk;
          onChunk(chunk);
        }
      }
    }

    onDone({
      fullText,
      conversation_id: metaConversationId,
      message_id: metaMessageId,
      source,
    });
  } catch (err) {
    if ((err as Error).name === "AbortError") return;
    onError(err instanceof Error ? err : new Error(String(err)));
  }
}
