// src/lib/ai/geminiClient.ts
// SECURITY NOTE — all keys are server-side in Supabase Edge Functions.

import { EDGE_BASE } from "@/lib/env";
import type { CoachingContext } from "@/types/ai.types";
import { retry } from "@/lib/utils";

export type GeminiModel =
  | "gemini-1.5-flash"
  | "gemini-1.5-pro"
  | "gemini-2.0-flash";

export type AnswerMode = "hint" | "full_answer";

export interface GeminiStreamOptions {
  question:           string;
  context:            CoachingContext;
  model?:             GeminiModel;
  isLive?:            boolean;
  sessionId?:         string;
  questionId?:        string;
  screenshotBase64?:  string | null;
  simpleLanguage?:    boolean;
  callType?:          "interview" | "regular_call";
  language?:          string;
  onChunk:            (chunk: string) => void;
  onDone:             (fullText: string) => void;
  onError:            (error: Error) => void;
  signal?:            AbortSignal;
}

export interface CodingAnalysis {
  pattern:          string;
  time_complexity:  string;
  space_complexity: string;
  approach:         string;
  edge_cases:       string[];
}

// Unified entry: mode="hint" | "full_answer". [file:1]
export async function streamGeminiAnswer(
  mode: AnswerMode,
  opts: GeminiStreamOptions
): Promise<void> {
  return mode === "full_answer"
    ? streamFullAnswer(opts)
    : streamGeminiHint(opts);
}

// Hint mode → generate-hint EF (non‑streaming). [file:1]
export async function streamGeminiHint(
  opts: GeminiStreamOptions
): Promise<void> {
  const {
    question,
    context,
    screenshotBase64,
    simpleLanguage,
    onChunk,
    onDone,
    onError,
    signal,
  } = opts;

  const body = JSON.stringify({
    question,
    interview_type:    context.session_type              ?? "behavioral",
    target_company:    context.target_company            ?? null,
    transcript:        context.last_transcript           ?? null,
    resume_context:    context.resume_experience_summary ?? null,
    simple_language:   simpleLanguage                    ?? false,
    screenshot_base64: screenshotBase64                  ?? null,
  });

  try {
    const { getAuthHeaders } = await import("@/lib/network/fetchEdge");
    const authHeaders = await getAuthHeaders();

    const response = await retry(
      () =>
        fetch(`${EDGE_BASE}/generate-hint`, {
          method:  "POST",
          headers: authHeaders,
          body,
          signal,
        }),
      2,
      300
    );

    if (!response.ok) {
      const errText = await response.text().catch(() => `HTTP ${response.status}`);
      throw new Error(`generate-hint failed: ${response.status} — ${errText}`);
    }

    const data  = (await response.json()) as { hints?: string; hint?: string };
    const hints = data.hints ?? data.hint ?? "";

    if (hints) onChunk(hints);
    onDone(hints);
  } catch (err) {
    if ((err as Error).name === "AbortError") return;
    onError(err instanceof Error ? err : new Error(String(err)));
  }
}

// Full answer mode → generate-answer EF (SSE streaming). [file:1][file:3]
export async function streamFullAnswer(
  opts: GeminiStreamOptions
): Promise<void> {
  const {
    question,
    context,
    simpleLanguage,
    onChunk,
    onDone,
    onError,
    signal,
  } = opts;

  const body = JSON.stringify({
    question,
    interview_type:  context.session_type              ?? "behavioral",
    target_company:  context.target_company            ?? null,
    transcript:      context.last_transcript           ?? null,
    resume_context:  context.resume_experience_summary ?? null,
    simple_language: simpleLanguage                    ?? false,
  });

  try {
    const { getAuthHeaders } = await import("@/lib/network/fetchEdge");
    const authHeaders = await getAuthHeaders();

    const response = await fetch(`${EDGE_BASE}/generate-answer`, {
      method:  "POST",
      headers: authHeaders,
      body,
      signal,
    });

    if (!response.ok) {
      if (response.status === 402) {
        throw new Error(
          "Insufficient credits. Please top up to generate full answers."
        );
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

// SSE consumer shared by generate-answer / ai-coach-chat shapes. [file:1]
export async function consumeSSEStream(
  body: ReadableStream<Uint8Array>,
  onChunk: (chunk: string) => void,
  onDone: (fullText: string) => void,
  onError: (error: Error) => void,
  signal?: AbortSignal
): Promise<void> {
  const reader  = body.getReader();
  const decoder = new TextDecoder();
  let fullText  = "";
  let buffer    = "";

  try {
    while (true) {
      if (signal?.aborted) {
        reader.cancel();
        return;
      }

      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });

      // Split on real newline characters. [file:1]
      const lines = buffer.split("\n");
      buffer = lines.pop() ?? "";

      for (const line of lines) {
        if (!line.startsWith("data: ")) continue;

        const data = line.slice(6).trim();

        if (data === "[DONE]") {
          onDone(fullText);
          return;
        }

        try {
          const parsed = JSON.parse(data) as Record<string, unknown>;
          const chunk: string =
            (parsed.text as string | undefined) ?? // generate-answer EF
            (
              (parsed.choices as Array<{ delta?: { content?: string } }> | undefined)
                ?.[0]?.delta?.content
            ) ?? // OpenAI-like
            ((parsed.delta as { text?: string } | undefined)?.text) ?? // Anthropic-like
            "";

          if (chunk) {
            fullText += chunk;
            onChunk(chunk);
          }
        } catch {
          // heartbeat / malformed JSON — ignore
        }
      }
    }

    onDone(fullText);
  } catch (err) {
    onError(err instanceof Error ? err : new Error(String(err)));
  } finally {
    reader.releaseLock();
  }
}

// Non‑streaming call via prep-tool EF. [file:1]
export async function callGemini(payload: {
  prompt:       string;
  model?:       GeminiModel;
  max_tokens?:  number;
  temperature?: number;
  session_id?:  string;
}): Promise<string> {
  const { getAuthHeaders } = await import("@/lib/network/fetchEdge");
  const authHeaders = await getAuthHeaders();

  const response = await fetch(`${EDGE_BASE}/prep-tool`, {
    method:  "POST",
    headers: authHeaders,
    body:    JSON.stringify({
      tool_id: "raw_prompt",
      input:   payload.prompt,
    }),
  });

  if (!response.ok) {
    const errText = await response.text().catch(() => `HTTP ${response.status}`);
    throw new Error(`callGemini failed: ${response.status} — ${errText}`);
  }

  const data = (await response.json()) as { result?: string };
  return data.result ?? "";
}

// Screenshot analysis helper. [file:1]
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
    model:      "gemini-1.5-flash",
    session_id: sessionId,
  });

  try {
    const clean = text.replace(/```json|```/g, "").trim();
    return JSON.parse(clean) as CodingAnalysis;
  } catch {
    return {
      pattern:          "Could not parse",
      time_complexity:  "Unknown",
      space_complexivity: "Unknown",
      approach:         text,
      edge_cases:       [],
    } as any;
  }
}
