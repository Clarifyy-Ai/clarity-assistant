// supabase/functions/_shared/gemini.ts
//
// Shared Gemini API helper for names// Shared Gemini API helper for Supabase Edge Functions.
// - Enforce timeout
// - Sanitize prompts
// - Avoid logging secrets
// - Safely parse Gemini JSON-like responses
// - Normalize Gemini errors without leaking sensitive data

const GEMINI_API_VERSION = Deno.env.get("GEMINI_API_VERSION") ?? "v1beta";
const GEMINI_BASE = `https://generativelanguage.googleapis.com/${GEMINI_API_VERSION}`;
const DEFAULT_MODEL =
  Deno.env.get("GEMINI_MODEL_DEFAULT") ?? "gemini-2.5-flash";

const DEFAULT_TIMEOUT_MS = 50_000;
const MAX_PROMPT_LENGTH = 100_000;
const MAX_SYSTEM_PROMPT_LENGTH = 20_000;
const MAX_ERROR_TEXT_LENGTH = 1_000;

export interface GeminiPart {
  text: string;
}

export interface GeminiMessage {
  role: "user" | "model";
  parts: GeminiPart[];
}

export type GeminiRequestOptions = {
  byokKey?: string;
  model?: string;
  stream?: boolean;
  timeoutMs?: number;
};

type GeminiCandidatePart = {
  text?: string;
};

type GeminiCandidateContent = {
  parts?: GeminiCandidatePart[];
};

type GeminiCandidate = {
  content?: GeminiCandidateContent;
};

type GeminiResponse = {
  candidates?: GeminiCandidate[];
};

function getServerGeminiKey(): string {
  return Deno.env.get("GEMINI_API_KEY") ?? "";
}

/**
 * Priority:
 * 1. BYOK key
 * 2. server-side GEMINI_API_KEY
 */
function resolveGeminiKey(byokKey?: string): string {
  if (typeof byokKey === "string" && byokKey.trim().length > 0) {
    return byokKey.trim();
  }

  return getServerGeminiKey().trim();
}

function sanitizePrompt(input: string, maxLength = MAX_PROMPT_LENGTH): string {
  return String(input ?? "")
    .replace(/[\u0000-\u0008]/g, "")
    .replace(/[\u000E-\u001F]/g, "")
    .slice(0, maxLength)
    .trim();
}

function sanitizeSystemPrompt(input: string): string {
  return sanitizePrompt(input, MAX_SYSTEM_PROMPT_LENGTH);
}

function sanitizeModel(input: string | undefined, fallback = DEFAULT_MODEL): string {
  const model = String(input ?? "").trim();

  if (!model) {
    return fallback;
  }

  // Only allow known-safe Gemini model ID patterns.
  if (!/^gemini-[a-z0-9.-]+$/i.test(model)) {
    return fallback;
  }

  return model;
}

function clampNumber(value: number, min: number, max: number, fallback: number): number {
  if (!Number.isFinite(value)) {
    return fallback;
  }

  return Math.min(max, Math.max(min, value));
}

function normalizeTemperature(value: number): number {
  return clampNumber(value, 0, 2, 0.7);
}

function normalizeMaxTokens(value: number): number {
  return Math.floor(clampNumber(value, 1, 8192, 2048));
}

function extractTextFromGemini(data: unknown): string {
  const response = data as GeminiResponse;
  const parts = response.candidates?.[0]?.content?.parts;

  if (!Array.isArray(parts)) {
    return "";
  }

  return parts
    .map((part) => (typeof part.text === "string" ? part.text : ""))
    .filter(Boolean)
    .join("");
}

function truncateErrorText(value: string): string {
  if (value.length <= MAX_ERROR_TEXT_LENGTH) {
    return value;
  }

  return `${value.slice(0, MAX_ERROR_TEXT_LENGTH)}...[truncated]`;
}

function buildGeminiUrl(model: string, method: "generateContent" | "streamGenerateContent"): string {
  return `${GEMINI_BASE}/models/${model}:${method}`;
}

/**
 * Returns Gemini SSE URL for streaming callers.
 */
export function buildGeminiStreamUrl(model?: string): string {
  const safeModel = sanitizeModel(model);

  return `${buildGeminiUrl(safeModel, "streamGenerateContent")}?alt=sse`;
}

async function geminiRequest(
  payload: Record<string, unknown>,
  options: GeminiRequestOptions = {}
): Promise<unknown> {
  const apiKey = resolveGeminiKey(options.byokKey);

  if (!apiKey) {
    throw new Error(
      "No Gemini API key available. Set GEMINI_API_KEY in Supabase Secrets or pass a BYOK key via x-byok-gemini."
    );
  }

  const model = sanitizeModel(options.model);
  const method = options.stream ? "streamGenerateContent" : "generateContent";
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;

  const controller = new AbortController();
  const timer = setTimeout(() => {
    controller.abort();
  }, timeoutMs);

  try {
    const response = await fetch(buildGeminiUrl(model, method), {
      method: "POST",
      signal: controller.signal,
      headers: {
        "Content-Type": "application/json",
        "x-goog-api-key": apiKey,
      },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      const errorText = await response
        .text()
        .catch(() => "Unknown Gemini error");

      throw new Error(
        `Gemini API error (${response.status}): ${truncateErrorText(errorText)}`
      );
    }

    return await response.json();
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      throw new Error(`Gemini request timed out after ${timeoutMs}ms.`);
    }

    throw error;
  } finally {
    clearTimeout(timer);
  }
}

/* -------------------------------------------------------------------------- */
/*                         GENERATE MODE                                      */
/* -------------------------------------------------------------------------- */

export async function geminiGenerate(
  prompt: string,
  systemPrompt?: string,
  temperature = 0.7,
  maxTokens = 2048,
  byokKey?: string,
  model?: string
): Promise<string> {
  const safePrompt = sanitizePrompt(prompt);
  const safeSystemPrompt = systemPrompt
    ? sanitizeSystemPrompt(systemPrompt)
    : undefined;

  const payload: Record<string, unknown> = {
    contents: [
      {
        role: "user",
        parts: [
          {
            text: safePrompt,
          },
        ],
      },
    ],
    generationConfig: {
      temperature: normalizeTemperature(temperature),
      maxOutputTokens: normalizeMaxTokens(maxTokens),
    },
  };

  if (safeSystemPrompt) {
    payload.systemInstruction = {
      parts: [
        {
          text: safeSystemPrompt,
        },
      ],
    };
  }

  const data = await geminiRequest(payload, {
    byokKey,
    model,
  });

  return extractTextFromGemini(data);
}

/* -------------------------------------------------------------------------- */
/*                             CHAT MODE                                      */
/* -------------------------------------------------------------------------- */

export async function geminiChat(
  messages: GeminiMessage[],
  systemPrompt?: string,
  temperature = 0.7,
  maxTokens = 1024,
  byokKey?: string,
  model?: string
): Promise<string> {
  const safeMessages = messages
    .filter((message) => message.role === "user" || message.role === "model")
    .map((message) => ({
      role: message.role,
      parts: (message.parts ?? [])
        .map((part) => ({
          text: sanitizePrompt(part.text),
        }))
        .filter((part) => part.text.length > 0),
    }))
    .filter((message) => message.parts.length > 0);

  const payload: Record<string, unknown> = {
    contents: safeMessages,
    generationConfig: {
      temperature: normalizeTemperature(temperature),
      maxOutputTokens: normalizeMaxTokens(maxTokens),
    },
  };

  if (systemPrompt) {
    payload.systemInstruction = {
      parts: [
        {
          text: sanitizeSystemPrompt(systemPrompt),
        },
      ],
    };
  }

  const data = await geminiRequest(payload, {
    byokKey,
    model,
  });

  return extractTextFromGemini(data);
}

/* -------------------------------------------------------------------------- */
/*                       ROBUST JSON PARSER FOR GEMINI                         */
/* -------------------------------------------------------------------------- */

function tryParseJson<T>(value: string): T | null {
  try {
    return JSON.parse(value) as T;
  } catch {
    return null;
  }
}

function extractJsonCandidates(input: string): string[] {
  const candidates: string[] = [];

  const fenceRegex = /```(?:json)?\s*([\s\S]*?)```/gi;
  let block: RegExpExecArray | null;

  while ((block = fenceRegex.exec(input)) !== null) {
    const candidate = block[1]?.trim();

    if (candidate) {
      candidates.push(candidate);
    }
  }

  const firstObjectIndex = input.indexOf("{");
  const lastObjectIndex = input.lastIndexOf("}");

  if (
    firstObjectIndex !== -1 &&
    lastObjectIndex !== -1 &&
    lastObjectIndex > firstObjectIndex
  ) {
    candidates.push(input.slice(firstObjectIndex, lastObjectIndex + 1));
  }

  const firstArrayIndex = input.indexOf("[");
  const lastArrayIndex = input.lastIndexOf("]");

  if (
    firstArrayIndex !== -1 &&
    lastArrayIndex !== -1 &&
    lastArrayIndex > firstArrayIndex
  ) {
    candidates.push(input.slice(firstArrayIndex, lastArrayIndex + 1));
  }

  candidates.push(input.trim());

  return candidates;
}

export function parseJSON<T>(raw: string, fallback: T): T {
  if (!raw || raw.trim().length === 0) {
    return fallback;
  }

  const input = raw.trim();
  const candidates = extractJsonCandidates(input);

  for (let index = candidates.length - 1; index >= 0; index -= 1) {
    const parsed = tryParseJson<T>(candidates[index]);

    if (parsed !== null) {
      return parsed;
    }
  }

  console.warn("[gemini] parseJSON failed. Raw snippet:", input.slice(0, 200));

  return fallback;
}
//
// SECURITY PURPOSE:
// - Centralize Gemini API calls
// - Support server-side Gemini key and BYOK Gemini key
