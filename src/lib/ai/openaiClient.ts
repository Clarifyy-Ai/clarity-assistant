// src/lib/ai/openaiClient.ts — PRODUCTION READY
import { fetchEdgeJson, getAuthHeaders } from "@/lib/network/fetchEdge";
import { fetchLiveEdgeWithRetry } from "@/lib/session/liveSessionRetry";
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
    resume_context: [
      context.resume_experience_summary ?? "",
      context.preference_context ?? "",
    ]
      .filter(Boolean)
      .join("\n\n"),
    preference_context: context.preference_context ?? "",
    skills_not_to_claim: context.skills_not_to_claim ?? [],
    experience_level: context.experience_level ?? "",
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
    const response = await fetchLiveEdgeWithRetry("generate-hint", body, {
      method: "POST",
      headers,
      signal,
      timeoutMs: 60_000,
    });
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
function normalizeCoachChatClientError(err: ApiClientError): ApiClientError {
  const code = String(err.code ?? "").toUpperCase() || "API_ERROR";
  const creditServiceDown =
    code === "CREDIT_SERVICE_UNAVAILABLE" ||
    code === "RATE_LIMIT_BACKEND_UNAVAILABLE";
  const providerUnavailable =
    !creditServiceDown &&
    (err.status === 502 ||
      err.status === 503 ||
      code === "AI_UNAVAILABLE" ||
      code === "AI_PROVIDER_UNAVAILABLE" ||
      code === "PROVIDER_UNAVAILABLE" ||
      code === "COACH_AI_UNAVAILABLE");
  const insufficientCredits =
    !providerUnavailable &&
    !creditServiceDown &&
    (code === "PAYMENT_REQUIRED" ||
      code === "INSUFFICIENT_CREDITS" ||
      err.status === 402);
  const invalidOutput = code === "AI_INVALID_OUTPUT" || err.status === 422;

  if (code === "REQUEST_ABORTED") return err;

  const message = insufficientCredits
    ? "Insufficient credits. Please top up to continue chatting with your coach."
    : creditServiceDown
      ? code === "RATE_LIMIT_BACKEND_UNAVAILABLE"
        ? "The service is temporarily unavailable. Please try again in a moment."
        : "Credits couldn't be verified right now. Please try again."
      : invalidOutput
        ? "Coach returned an incomplete reply. Please try again."
        : providerUnavailable
          ? "Coach AI is temporarily unavailable. Try again in a moment."
          : err.message || `Coach chat failed (${err.status}).`;

  return new ApiClientError({
    message,
    status: err.status,
    code: insufficientCredits
      ? "INSUFFICIENT_CREDITS"
      : creditServiceDown
        ? code
        : invalidOutput
          ? "AI_INVALID_OUTPUT"
          : providerUnavailable
            ? "AI_PROVIDER_UNAVAILABLE"
            : code,
    details: err.details,
  });
}

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

    const res = await fetchLiveEdgeWithRetry("ai-coach-chat", body, {
      method: "POST",
      headers,
      signal,
      // Keep in sync with Edge geminiChat timeoutMs 45_000 × maxAttempts 2.
      timeoutMs: opts.timeoutMs ?? 90_000,
    });

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
        throw new ApiClientError({
          message: "Coach reply timed out (CP-10245). Your message was not accepted — retry the same turn.",
          status: 408,
          code: "REQUEST_ABORTED",
        });
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
          throw normalizeCoachChatClientError(
            new ApiClientError({
              message:
                String(parsed.error ?? "") ||
                "Your coach is temporarily unavailable. Please retry.",
              status: 502,
              code: String(parsed.code ?? "AI_UNAVAILABLE"),
            }),
          );
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
    // Never silent-succeed on abort/timeout — caller must surface error UX.
    if (err instanceof ApiClientError) {
      onError(
        err.code === "REQUEST_ABORTED" ? err : normalizeCoachChatClientError(err),
      );
      return;
    }
    const name = err instanceof Error ? err.name : "";
    const message = err instanceof Error ? err.message : String(err ?? "");
    const aborted =
      name === "AbortError" ||
      name === "TimeoutError" ||
      /timed?\s*out|aborted|cancelled/i.test(message);
    if (aborted) {
      onError(
        new ApiClientError({
          message:
            "Coach reply timed out (CP-10245). Your message was not accepted — retry the same turn.",
          status: 408,
          code: "REQUEST_ABORTED",
        }),
      );
      return;
    }
    onError(err instanceof Error ? err : new Error(String(err)));
  }
}
