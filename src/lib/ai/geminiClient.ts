// src/lib/ai/geminiClient.ts
// ─────────────────────────────────────────────────────────────────────────────
// SECURITY AUDIT NOTE — VERIFIED CLEAN (Phase 1 fix pass)
// All AI API keys live server-side (Supabase Edge Functions).
// This file is 100% browser-safe — no secrets, no direct AI provider calls.
// All requests proxy through `${EDGE_BASE}/generate-hint`,
// `/generate-answer`, and `/prep-tool` which read GEMINI_API_KEY from Deno.env.
// Audit grep "api.openai.com|generativelanguage.googleapis.com|api.anthropic.com"
// in src/ should return zero hits. If it doesn't, the new file MUST also be a
// proxy through edge functions — never embed provider URLs in client code.
// ─────────────────────────────────────────────────────────────────────────────

import { EDGE_BASE } from "@/lib/env";
// REMOVED: SUPABASE_ANON_KEY — was imported but never used
// REMOVED: HintStyle import — was imported but never used
import type { CoachingContext } from "@/types/ai.types";
import { retry } from "@/lib/utils";

/* ─── TYPES ─────────────────────────────────────────────────────────────── */

export type GeminiModel =
  | "gemini-1.5-flash"
  | "gemini-1.5-pro"
  | "gemini-2.0-flash"; // ADDED: 2.0-flash used in edge functions

export type AnswerMode = "hint" | "full_answer";

export interface GeminiStreamOptions {
  question:           string;
  context:            CoachingContext;
  model?:             GeminiModel;      // CHANGED: optional (was required, broke callers)
  isLive?:            boolean;          // CHANGED: optional (was required)
  sessionId?:         string;           // CHANGED: optional (was required)
  questionId?:        string;           // CHANGED: optional (was required)
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

/* ─── UNIFIED ENTRY POINT ───────────────────────────────────────────────── */
// ADDED: Single dispatcher so the overlay calls one function regardless of mode.
// mode="hint"        → 3-bullet JSON response (fast, 1 credit)
// mode="full_answer" → complete STAR answer via SSE streaming (2 credits)

export async function streamGeminiAnswer(
  mode: AnswerMode,
  opts: GeminiStreamOptions,
): Promise<void> {
  return mode === "full_answer"
    ? streamFullAnswer(opts)
    : streamGeminiHint(opts);
}

/* ─── HINT MODE ─────────────────────────────────────────────────────────── */
// Calls generate-hint EF → returns JSON { hints: "• ...\n• ...\n• ..." }
// No SSE — delivers entire hint string as a single onChunk call then onDone.

export async function streamGeminiHint(opts: GeminiStreamOptions): Promise<void> {
  const {
    question, context,
    screenshotBase64, simpleLanguage,
    onChunk, onDone, onError, signal,
  } = opts;

  const body = JSON.stringify({
    // REMOVED: user_id — not needed, edge function reads it from JWT
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
      300,
    );

    if (!response.ok) {
      const errText = await response.text().catch(() => `HTTP ${response.status}`);
      throw new Error(`generate-hint failed: ${response.status} — ${errText}`);
    }

    const data  = await response.json() as { hints?: string; hint?: string };
    const hints = data.hints ?? data.hint ?? "";

    if (hints) onChunk(hints);
    onDone(hints);
  } catch (err) {
    if ((err as Error).name === "AbortError") return;
    onError(err instanceof Error ? err : new Error(String(err)));
  }
}

/* ─── FULL ANSWER MODE ──────────────────────────────────────────────────── */
// Calls generate-answer EF → returns SSE stream of { text } chunks.
// Each chunk is forwarded to onChunk() immediately → overlay types it out live.

export async function streamFullAnswer(opts: GeminiStreamOptions): Promise<void> {
  const {
    question, context, simpleLanguage,
    onChunk, onDone, onError, signal,
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
      // ADDED: friendly 402 message instead of raw HTTP error
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

/* ─── SSE STREAM CONSUMER ───────────────────────────────────────────────── */
// Shared by streamFullAnswer and ai-coach-chat.
// CRITICAL FIX: buffer.split("\n") — single backslash = real newline character.
// The original had "\\n" (double backslash) which is a literal \n string,
// so split() never found any line boundaries and zero chunks were delivered.

export async function consumeSSEStream(
  body:    ReadableStream<Uint8Array>,
  onChunk: (chunk: string) => void,
  onDone:  (fullText: string) => void,
  onError: (error: Error) => void,
  signal?: AbortSignal,             // ADDED: abort signal support
): Promise<void> {
  const reader  = body.getReader();
  const decoder = new TextDecoder();
  let fullText  = "";
  let buffer    = "";

  try {
    while (true) {
      // ADDED: respect abort signal mid-stream
      if (signal?.aborted) {
        reader.cancel();
        return;
      }

      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });

      // FIX: was "\\n" (literal backslash-n) — now "\n" (real newline)
      // This was the root cause of zero chunks being delivered to the overlay.
      const lines = buffer.split("\n");
      buffer = lines.pop() ?? ""; // last incomplete line stays buffered

      for (const line of lines) {
        if (!line.startsWith("data: ")) continue;

        const data = line.slice(6).trim();

        if (data === "[DONE]") {
          onDone(fullText);
          return;
        }

        try {
          const parsed = JSON.parse(data) as Record<string, unknown>;

          // Supports multiple SSE payload shapes from different edge functions
          const chunk: string =
            // generate-answer EF (Gemini proxied)
            (parsed.text as string | undefined) ??
            // ai-coach-chat EF (OpenAI format)
            (
              (parsed.choices as Array<{ delta?: { content?: string } }> | undefined)
              ?.[0]?.delta?.content
            ) ??
            // Anthropic format
            ((parsed.delta as { text?: string } | undefined)?.text) ??
            "";

          if (chunk) {
            fullText += chunk;
            onChunk(chunk);
          }
        } catch {
          // Malformed JSON or Gemini heartbeat line — skip silently
        }
      }
    }

    // Stream ended without [DONE] marker — still deliver accumulated text
    onDone(fullText);
  } catch (err) {
    onError(err instanceof Error ? err : new Error(String(err)));
  } finally {
    reader.releaseLock();
  }
}

/* ─── NON-STREAMING CALL ────────────────────────────────────────────────── */
// For scorecard generation, STAR builder, debrief, etc.
// Routes through prep-tool EF with tool_id="raw_prompt".

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

  const data = await response.json() as { result?: string };
  return data.result ?? "";
}

/* ─── VISION — CODING PROBLEM SCREENSHOT ANALYSIS ──────────────────────── */

export async function analyseScreenshotWithGemini(
  screenshotBase64: string,
  sessionId:        string,
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
      space_complexity: "Unknown",
      approach:         text,
      edge_cases:       [],
    };
  }
}
