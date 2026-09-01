/**
 * True Gemini token streaming via streamGenerateContent?alt=sse.
 * Throws before the first yield on HTTP / parse failure so callers can fall back.
 */

import { buildGeminiStreamUrl } from "./gemini.ts";

const DEFAULT_TIMEOUT_MS = 50_000;
const MAX_PROMPT_LENGTH = 100_000;
const MAX_SYSTEM_PROMPT_LENGTH = 20_000;

type GeminiSsePart = { text?: string };
type GeminiSseCandidate = {
  content?: { parts?: GeminiSsePart[] };
};
type GeminiSsePayload = {
  candidates?: GeminiSseCandidate[];
  error?: { code?: number; message?: string; status?: string };
};

function sanitizePrompt(input: string, maxLength: number): string {
  return String(input ?? "")
    .replace(/[\u0000-\u0008]/g, "")
    .replace(/[\u000E-\u001F]/g, "")
    .slice(0, maxLength)
    .trim();
}

/**
 * Extract incremental text from one Gemini SSE `data:` JSON object.
 * Returns null when the payload is not a content delta (keep-alive / empty).
 * Throws when Gemini reports an error object.
 */
export function parseGeminiSseData(raw: string): string | null {
  const trimmed = raw.trim();
  if (!trimmed || trimmed === "[DONE]") return null;

  let payload: GeminiSsePayload;
  try {
    payload = JSON.parse(trimmed) as GeminiSsePayload;
  } catch {
    return null;
  }

  if (payload.error) {
    const code = payload.error.code ?? 500;
    const message = String(payload.error.message ?? "Gemini stream error").slice(
      0,
      240,
    );
    throw new Error(`Gemini SSE error (${code}): ${message}`);
  }

  const parts = payload.candidates?.[0]?.content?.parts;
  if (!Array.isArray(parts) || parts.length === 0) return null;

  const text = parts
    .map((part) => (typeof part.text === "string" ? part.text : ""))
    .filter(Boolean)
    .join("");
  return text.length > 0 ? text : null;
}

export type StreamGeminiContentOpts = {
  model: string;
  systemPrompt?: string;
  userPrompt: string;
  screenshotBase64?: string | null;
  maxTokens?: number;
  temperature?: number;
  timeoutMs?: number;
  signal?: AbortSignal;
};

function buildStreamPayload(opts: StreamGeminiContentOpts): Record<string, unknown> {
  const userPrompt = sanitizePrompt(opts.userPrompt, MAX_PROMPT_LENGTH);
  const systemPrompt = opts.systemPrompt
    ? sanitizePrompt(opts.systemPrompt, MAX_SYSTEM_PROMPT_LENGTH)
    : "";

  const parts: Array<Record<string, unknown>> = [{ text: userPrompt }];
  const shot = opts.screenshotBase64?.trim();
  if (shot) {
    const data = shot.replace(/^data:image\/\w+;base64,/, "");
    parts.push({
      inline_data: {
        mime_type: "image/png",
        data,
      },
    });
  }

  const payload: Record<string, unknown> = {
    contents: [{ role: "user", parts }],
    generationConfig: {
      temperature:
        typeof opts.temperature === "number" && Number.isFinite(opts.temperature)
          ? Math.min(2, Math.max(0, opts.temperature))
          : 0.7,
      maxOutputTokens:
        typeof opts.maxTokens === "number" && Number.isFinite(opts.maxTokens)
          ? Math.min(8192, Math.max(1, Math.floor(opts.maxTokens)))
          : 1024,
      topP: 0.95,
    },
  };
  if (systemPrompt) {
    payload.systemInstruction = { parts: [{ text: systemPrompt }] };
  }
  return payload;
}

/**
 * Yield Gemini text deltas. Throws before the first yield on connect/HTTP failure.
 */
export async function* streamGeminiContent(
  opts: StreamGeminiContentOpts,
): AsyncGenerator<string> {
  const apiKey = (Deno.env.get("GEMINI_API_KEY") ?? "").trim();
  if (!apiKey) {
    throw new Error("No Gemini API key available. Set GEMINI_API_KEY in Supabase Secrets.");
  }

  const timeoutMs = opts.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  const onAbort = () => controller.abort();
  opts.signal?.addEventListener("abort", onAbort, { once: true });

  let response: Response;
  try {
    response = await fetch(buildGeminiStreamUrl(opts.model), {
      method: "POST",
      signal: controller.signal,
      headers: {
        "Content-Type": "application/json",
        "x-goog-api-key": apiKey,
      },
      body: JSON.stringify(buildStreamPayload(opts)),
    });
  } catch (err) {
    clearTimeout(timer);
    opts.signal?.removeEventListener("abort", onAbort);
    if (err instanceof Error && err.name === "AbortError") {
      throw new Error(`Gemini stream timed out after ${timeoutMs}ms.`);
    }
    throw err;
  }

  if (!response.ok) {
    clearTimeout(timer);
    opts.signal?.removeEventListener("abort", onAbort);
    const errText = await response.text().catch(() => "");
    throw new Error(
      `Gemini HTTP ${response.status}: ${errText.slice(0, 200)}`,
    );
  }

  if (!response.body) {
    clearTimeout(timer);
    opts.signal?.removeEventListener("abort", onAbort);
    throw new Error("Gemini stream returned an empty body");
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let yielded = false;

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true }).replace(/\r/g, "");
      const lines = buffer.split("\n");
      buffer = lines.pop() ?? "";
      for (const line of lines) {
        if (!line.startsWith("data:")) continue;
        const data = line.slice(5).trim();
        if (!data) continue;
        const delta = parseGeminiSseData(data);
        if (!delta) continue;
        yielded = true;
        yield delta;
      }
    }
    if (buffer.trim().startsWith("data:")) {
      const data = buffer.trim().slice(5).trim();
      const delta = data ? parseGeminiSseData(data) : null;
      if (delta) {
        yielded = true;
        yield delta;
      }
    }
    if (!yielded) {
      throw new Error("Gemini stream completed without text");
    }
  } finally {
    clearTimeout(timer);
    opts.signal?.removeEventListener("abort", onAbort);
    try {
      reader.releaseLock();
    } catch {
      /* ignore */
    }
  }
}
