// src/lib/ai/geminiClient.ts — PRODUCTION READY
// SECURITY NOTE — all keys are server-side in Supabase Edge Functions.
//
// Fixes:
// - Uses fetchEdge()/fetchEdgeJson() so EDGE_BASE works in all environments
// - Sets correct Accept header for SSE
// - Hardens SSE parsing (\r\n, partial chunks, ignores non-data lines safely)
// - Keeps ALL existing features (retry, model selection, screenshot support, etc.)

import type { CoachingContext } from "@/types/ai.types";
import { retry } from "@/lib/utils";
import { fetchEdge, fetchEdgeJson, getAuthHeaders } from "@/lib/network/fetchEdge";
import { createIdempotencyKey } from "@/lib/api/functions";

export type GeminiModel =
  | "gemini-2.5-flash"
  | "gemini-2.5-pro"
  | "gemini-2.5-flash-lite"
  | "gemini-1.5-flash"
  | "gemini-1.5-pro"
  | "gemini-2.0-flash";

export type AnswerMode = "hint" | "full_answer";

export interface GeminiStreamOptions {
  question: string;
  context: CoachingContext;
  model?: GeminiModel;
  isLive?: boolean;
  sessionId?: string;
  questionId?: string;
  /** Sessionless AI mode when sessionId is absent (mock | warmup | rehearsal | practice). */
  mode?: string;
  screenshotBase64?: string | null;
  simpleLanguage?: boolean;
  callType?: "interview" | "regular_call";
  language?: string;
  onChunk: (chunk: string) => void;
  onDone: (fullText: string) => void;
  onError: (error: Error) => void;
  signal?: AbortSignal;
}

export interface CodingAnalysis {
  pattern: string;
  time_complexity: string;
  space_complexity: string;
  approach: string;
  edge_cases: string[];
}

export async function streamGeminiAnswer(
  mode: AnswerMode,
  opts: GeminiStreamOptions
): Promise<void> {
  return mode === "full_answer" ? streamFullAnswer(opts) : streamGeminiHint(opts);
}

export async function streamGeminiHint(opts: GeminiStreamOptions): Promise<void> {
  const {
    question,
    context,
    screenshotBase64,
    simpleLanguage,
    onChunk,
    onDone,
    onError,
    signal,
    model,
  } = opts;

  const uuidRe =
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  const sessionId =
    typeof opts.sessionId === "string" && uuidRe.test(opts.sessionId)
      ? opts.sessionId
      : undefined;
  // Idempotency keys are not UUIDs — never send them as question_id (edge zod rejects).
  const questionId =
    typeof opts.questionId === "string" && uuidRe.test(opts.questionId)
      ? opts.questionId
      : undefined;

  const body = {
    question,
    model: model ?? "gemini-2.5-flash",
    interview_type: context.session_type ?? "behavioral",
    // Zod optional strings reject `null` — always send strings or omit.
    target_company: context.target_company ?? "",
    transcript: context.last_transcript ?? "",
    resume_context: context.resume_experience_summary ?? "",
    simple_language: simpleLanguage ?? false,
    screenshot_base64: screenshotBase64 ?? null,
    session_id: sessionId ?? null,
    question_id: questionId ?? null,
    mode: opts.mode ?? null,
  };

  try {
    // Uses robust EDGE url handling + consistent auth headers
    const idempotencyKey =
      typeof opts.questionId === "string" && opts.questionId.length > 0
        ? opts.questionId
        : undefined;
    const data = await retry(
      () =>
        fetchEdgeJson<{ hints?: string; hint?: string }>("generate-hint", body, {
          signal,
          headers: idempotencyKey
            ? { "Idempotency-Key": idempotencyKey }
            : undefined,
        }),
      1,
      100,
    );

    const hints = data.hints ?? data.hint ?? "";
    if (hints) onChunk(hints);
    onDone(hints);
  } catch (err) {
    if ((err as Error).name === "AbortError") return;
    onError(err instanceof Error ? err : new Error(String(err)));
  }
}

export async function streamFullAnswer(opts: GeminiStreamOptions): Promise<void> {
  const { question, context, simpleLanguage, onChunk, onDone, onError, signal, model, screenshotBase64 } = opts;

  const body = {
    question,
    model: model ?? "gemini-2.5-flash",
    interview_type: context.session_type ?? "behavioral",
    target_company: context.target_company ?? "",
    transcript: context.last_transcript ?? "",
    resume_context: context.resume_experience_summary ?? "",
    screenshot_base64: screenshotBase64 ?? null,
    session_id: opts.sessionId ?? null,
    mode: opts.mode ?? null,
  };

  try {
    // Ensure correct headers for SSE
    const headers = await getAuthHeaders({
      Accept: "text/event-stream",
    });

    const response = await fetchEdge("generate-answer", body, {
      method: "POST",
      headers,
      signal,
      timeoutMs: 60_000, // full answers can legitimately exceed 30s
    });

    if (!response.ok) {
      if (response.status === 402) {
        throw new Error("Insufficient credits. Please top up to generate full answers.");
      }
      const errText = await response.text().catch(() => `HTTP ${response.status}`);
      throw new Error(`generate-answer failed: ${response.status} — ${errText}`);
    }

    if (!response.body) {
      throw new Error("generate-answer returned an empty response body.");
    }

    await consumeSSEStream(response.body, onChunk, onDone, onError, signal);
  } catch (err) {
    if ((err as Error).name === "AbortError") return;
    onError(err instanceof Error ? err : new Error(String(err)));
  }
}

export async function consumeSSEStream(
  body: ReadableStream<Uint8Array>,
  onChunk: (chunk: string) => void,
  onDone: (fullText: string) => void,
  onError: (error: Error) => void,
  signal?: AbortSignal
): Promise<void> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let fullText = "";
  let buffer = "";

  try {
    while (true) {
      if (signal?.aborted) {
        try { await reader.cancel(); } catch { /* ignore */ }
        return;
      }

      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });

      // Normalize CRLF -> LF
      buffer = buffer.replace(/\r/g, "");

      const lines = buffer.split("\n");
      buffer = lines.pop() ?? "";

      for (const line of lines) {
        // ignore empty lines and SSE fields other than data
        if (!line || !line.startsWith("data:")) continue;

        const data = line.slice(5).trim(); // after "data:"
        if (!data) continue;

        if (data === "[DONE]") {
          onDone(fullText);
          return;
        }

        try {
          const parsed = JSON.parse(data) as Record<string, unknown>;
          const chunk: string =
            (parsed.text as string | undefined) ??
            ((parsed.choices as Array<{ delta?: { content?: string } }> | undefined)?.[0]?.delta?.content) ??
            ((parsed.delta as { text?: string } | undefined)?.text) ??
            "";

          if (chunk) {
            fullText += chunk;
            onChunk(chunk);
          }
        } catch {
          // ignore malformed json chunk
        }
      }
    }

    // If server ended without [DONE], still resolve safely
    onDone(fullText);
  } catch (err) {
    onError(err instanceof Error ? err : new Error(String(err)));
  } finally {
    try { reader.releaseLock(); } catch { /* ignore */ }
  }
}

export async function callGemini(payload: {
  prompt: string;
  model?: GeminiModel;
  max_tokens?: number;
  temperature?: number;
  session_id?: string;
}): Promise<string> {
  const response = await fetchEdgeJson<{ result?: string }>("prep-tool", {
    tool_id: "raw_prompt",
    input: payload.prompt,
    model: payload.model ?? "gemini-2.5-flash",
    max_tokens: payload.max_tokens,
    temperature: payload.temperature,
    session_id: payload.session_id,
  }, {
    headers: {
      "Idempotency-Key": createIdempotencyKey("prep-tool"),
    },
  });

  return response.result ?? "";
}

export async function analyseScreenshotWithGemini(
  screenshotBase64: string,
  sessionId: string
): Promise<CodingAnalysis> {
  const prompt = `You are an expert competitive programmer and technical interviewer coach.
Analyse this coding problem screenshot and return a JSON object with these exact fields:
- pattern: the algorithmic pattern (e.g. "Sliding Window", "Dynamic Programming")
- time_complexity: optimal time complexity (e.g. "O(n log n)")
- space_complexity: optimal space complexity (e.g. "O(n)")
- approach: 2-3 sentence description of the recommended approach — NO code, thinking framework only
- edge_cases: array of 3-5 edge cases to consider

Return ONLY valid JSON. No explanation, no markdown fences.`;

  const text = await callGemini({
    prompt,
    model: "gemini-2.5-flash",
    session_id: sessionId,
  });

  try {
    const clean = text.replace(/```json|```/g, "").trim();
    return JSON.parse(clean) as CodingAnalysis;
  } catch {
    return {
      pattern: "Could not parse",
      time_complexity: "Unknown",
      space_complexity: "Unknown",
      approach: text,
      edge_cases: [],
    };
  }
}
