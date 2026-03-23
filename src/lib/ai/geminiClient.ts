import type { CoachingContext } from "@/types/ai.types";
import type { HintStyle } from "@/types/user.types";
import { buildSystemPrompt } from "./contextEnvelopeBuilder";
import { retry } from "@/lib/utils";

// ─────────────────────────────────────────────────────────────────
// Gemini Client — calls Supabase Edge Function which proxies Gemini
// All API keys live server-side only, never exposed to the browser.
// ─────────────────────────────────────────────────────────────────

const EDGE_BASE = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1`;

export type GeminiModel = "gemini-1.5-flash" | "gemini-1.5-pro";

export interface GeminiStreamOptions {
  question: string;
  context: CoachingContext;
  model: GeminiModel;
  isLive: boolean;
  sessionId: string;
  questionId: string;
  screenshotBase64?: string | null;
  onChunk: (chunk: string) => void;
  onDone: (fullText: string) => void;
  onError: (error: Error) => void;
  signal?: AbortSignal;
}

// ─────────────────────────────────────────────────────────────────
// Generate a hint via the generate-hint edge function (returns JSON)
// ─────────────────────────────────────────────────────────────────

export async function streamGeminiHint(opts: GeminiStreamOptions): Promise<void> {
  const {
    question, context,
    sessionId, questionId,
    onChunk, onDone, onError, signal,
  } = opts;

  const body = JSON.stringify({
    user_id:        context.user_id ?? "",
    question,
    interview_type: context.session_type ?? "behavioural",
    target_company: context.target_company ?? null,
    transcript:     null,
    resume_text:    context.resume_experience_summary ?? null,
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
      300
    );

    if (!response.ok) {
      const errText = await response.text();
      throw new Error(`Gemini hint failed: ${response.status} — ${errText}`);
    }

    const data = await response.json();
    const hint: string = data.hint ?? "";

    // Deliver the full hint as a single chunk then done — no SSE stream
    if (hint) onChunk(hint);
    onDone(hint);
  } catch (err) {
    if ((err as Error).name === "AbortError") return; // cancelled intentionally
    onError(err instanceof Error ? err : new Error(String(err)));
  }
}

// ─────────────────────────────────────────────────────────────────
// Non-streaming Gemini call (for scorecard, STAR builder, etc.)
// Uses the prep-tool edge function with tool_id="raw_prompt" which
// passes the prompt through as-is without credit deduction (no user_id).
// ─────────────────────────────────────────────────────────────────

export async function callGemini(payload: {
  prompt: string;
  model?: GeminiModel;
  max_tokens?: number;
  temperature?: number;
  session_id?: string;
}): Promise<string> {
  const response = await fetch(`${EDGE_BASE}/prep-tool`, {
    method: "POST",
    headers: {
      "Content-Type":  "application/json",
      "Authorization": `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}`,
    },
    body: JSON.stringify({
      tool_id: "raw_prompt",
      input:   payload.prompt,
    }),
  });

  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`Gemini call failed: ${response.status} — ${errText}`);
  }

  const data = await response.json();
  return data.result ?? "";
}

// ─────────────────────────────────────────────────────────────────
// Gemini Vision — for coding problem screenshots
// ─────────────────────────────────────────────────────────────────

export async function analyseScreenshotWithGemini(
  screenshotBase64: string,
  sessionId: string
): Promise<{
  pattern: string;
  time_complexity: string;
  space_complexity: string;
  approach: string;
  edge_cases: string[];
}> {
  const prompt = `
You are an expert competitive programmer and technical interviewer coach.
Analyse this coding problem screenshot and return a JSON object with these exact fields:
- pattern: the algorithmic pattern this problem represents (e.g. "Sliding Window", "Dynamic Programming")
- time_complexity: optimal time complexity (e.g. "O(n log n)")
- space_complexity: optimal space complexity (e.g. "O(n)")
- approach: 2-3 sentence description of the recommended approach (thinking framework only, NO code)
- edge_cases: array of 3-5 edge cases to consider

Return ONLY valid JSON. No explanation, no markdown.`.trim();

  const text = await callGemini({
    prompt,
    model: "gemini-1.5-flash",
    session_id: sessionId,
  });

  try {
    const clean = text.replace(/```json|```/g, "").trim();
    return JSON.parse(clean);
  } catch {
    return {
      pattern: "Unknown",
      time_complexity: "Unknown",
      space_complexity: "Unknown",
      approach: text,
      edge_cases: [],
    };
  }
}

// ─────────────────────────────────────────────────────────────────
// SSE stream consumer (kept for ai-coach-chat which uses SSE format)
// ─────────────────────────────────────────────────────────────────

export async function consumeSSEStream(
  body: ReadableStream<Uint8Array>,
  onChunk: (chunk: string) => void,
  onDone: (fullText: string) => void,
  onError: (error: Error) => void
): Promise<void> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let fullText = "";
  let buffer = "";

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
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
          const parsed = JSON.parse(data);
          const chunk: string =
            parsed.choices?.[0]?.delta?.content ??
            parsed.candidates?.[0]?.content?.parts?.[0]?.text ??
            parsed.delta?.text ??
            parsed.text ??
            "";
          if (chunk) {
            fullText += chunk;
            onChunk(chunk);
          }
        } catch {
          // Non-JSON SSE lines — skip silently
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
