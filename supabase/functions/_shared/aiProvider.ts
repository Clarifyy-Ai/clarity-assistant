// supabase/functions/_shared/aiProvider.ts
//
// AI Provider abstraction with automatic fallback.
// Primary: Gemini 2.0 Flash
// Fallback: Gemini 1.5 Pro (if Flash fails or is rate-limited)
//
// Includes:
// - Retry with exponential backoff on transient errors
// - Model fallback routing
// - Token/length limit handling per content type
// - Output content moderation
// - Non-blocking cost logging to ai_usage_logs

import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";
import { callAI } from "./utils.ts";
import type { ModelId } from "./types.ts";
import { getFallbackModels } from "./resolveModel.ts";

const GEMINI_API_VERSION = Deno.env.get("GEMINI_API_VERSION") ?? "v1beta";
const GEMINI_BASE = `https://generativelanguage.googleapis.com/${GEMINI_API_VERSION}`;

/* -------------------------------------------------------------------------- */
/*                                  TYPES                                     */
/* -------------------------------------------------------------------------- */

export interface AIProviderOptions {
  prompt: string;
  systemPrompt?: string;
  maxTokens?: number;
  temperature?: number;
  userId: string;
  action: string;
  jsonMode?: boolean;
  /** API model id (e.g. gpt-4o, gemini-2.0-flash). Falls back to Gemini chain if omitted. */
  model?: string;
  byok?: {
    openai?: string;
    anthropic?: string;
    gemini?: string;
  };
}

export interface AIProviderResult {
  text: string;
  provider: string;
  model: string;
  inputTokens: number;
  outputTokens: number;
  latencyMs: number;
  wasFallback: boolean;
}

/* -------------------------------------------------------------------------- */
/*                                 CONSTANTS                                  */
/* -------------------------------------------------------------------------- */

const MODELS = {
  primary: "gemini-2.0-flash",
  fallback: "gemini-1.5-pro",
} as const;

const MAX_RETRIES = 2;
const RETRY_DELAY_MS = 1_000;
const REQUEST_TIMEOUT_MS = 50_000;

const CHARS_PER_TOKEN = 4;

export const TOKEN_LIMITS = {
  resumeContext: 8_000,
  jdContext: 4_000,
  chatHistory: 6_000,
  userQuestion: 2_000,
} as const;

const COST_PER_MILLION_INPUT: Record<string, number> = {
  "gemini-2.0-flash": 10,
  "gemini-1.5-pro": 125,
  "gemini-2.5-flash": 10,
  "gpt-4o": 250,
  "gpt-4o-mini": 15,
  "claude-3-5-sonnet-20241022": 300,
  "claude-3-haiku-20240307": 25,
};

const COST_PER_MILLION_OUTPUT: Record<string, number> = {
  "gemini-2.0-flash": 40,
  "gemini-1.5-pro": 500,
  "gemini-2.5-flash": 40,
  "gpt-4o": 1000,
  "gpt-4o-mini": 60,
  "claude-3-5-sonnet-20241022": 1500,
  "claude-3-haiku-20240307": 125,
};

/* -------------------------------------------------------------------------- */
/*                          GEMINI RAW REQUEST                                */
/* -------------------------------------------------------------------------- */

type GeminiCandidatePart = { text?: string };
type GeminiCandidateContent = { parts?: GeminiCandidatePart[] };
type GeminiCandidate = { content?: GeminiCandidateContent };
type GeminiUsageMetadata = {
  promptTokenCount?: number;
  candidatesTokenCount?: number;
  totalTokenCount?: number;
};
type GeminiResponse = {
  candidates?: GeminiCandidate[];
  usageMetadata?: GeminiUsageMetadata;
};

function getGeminiKey(): string {
  const key = Deno.env.get("GEMINI_API_KEY") ?? "";
  if (!key) {
    throw new Error("GEMINI_API_KEY is not configured.");
  }
  return key;
}

function extractText(data: GeminiResponse): string {
  const parts = data.candidates?.[0]?.content?.parts;
  if (!Array.isArray(parts)) return "";
  return parts
    .map((p) => (typeof p.text === "string" ? p.text : ""))
    .filter(Boolean)
    .join("");
}

function isRetryableStatus(status: number): boolean {
  return status === 429 || status >= 500;
}

async function callGemini(
  model: string,
  prompt: string,
  systemPrompt: string | undefined,
  temperature: number,
  maxTokens: number,
  jsonMode: boolean
): Promise<{ response: GeminiResponse; status: number }> {
  const apiKey = getGeminiKey();
  const url = `${GEMINI_BASE}/models/${model}:generateContent`;

  const payload: Record<string, unknown> = {
    contents: [{ role: "user", parts: [{ text: prompt }] }],
    generationConfig: {
      temperature,
      maxOutputTokens: maxTokens,
      ...(jsonMode ? { responseMimeType: "application/json" } : {}),
    },
  };

  if (systemPrompt) {
    payload.systemInstruction = { parts: [{ text: systemPrompt }] };
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    const res = await fetch(url, {
      method: "POST",
      signal: controller.signal,
      headers: {
        "Content-Type": "application/json",
        "x-goog-api-key": apiKey,
      },
      body: JSON.stringify(payload),
    });

    if (!res.ok) {
      const errorText = await res.text().catch(() => "Unknown error");
      if (isRetryableStatus(res.status)) {
        return { response: {} as GeminiResponse, status: res.status };
      }
      throw new Error(
        `Gemini API error (${res.status}): ${errorText.slice(0, 500)}`
      );
    }

    const data = (await res.json()) as GeminiResponse;
    return { response: data, status: res.status };
  } catch (err) {
    if (err instanceof Error && err.name === "AbortError") {
      throw new Error(`Gemini request timed out after ${REQUEST_TIMEOUT_MS}ms.`);
    }
    throw err;
  } finally {
    clearTimeout(timer);
  }
}

/* -------------------------------------------------------------------------- */
/*                        GENERATE WITH FALLBACK                              */
/* -------------------------------------------------------------------------- */

export async function generateWithFallback(
  options: AIProviderOptions
): Promise<AIProviderResult> {
  const {
    prompt,
    systemPrompt,
    maxTokens = 2048,
    temperature = 0.7,
    jsonMode = false,
    model: requestedModel,
    byok,
  } = options;

  const models = getFallbackModels(requestedModel ?? MODELS.primary);
  let lastError: Error | null = null;

  for (let i = 0; i < models.length; i++) {
    const model = models[i];
    const isFallback = i > 0;

    for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
      if (attempt > 0) {
        await new Promise((r) => setTimeout(r, RETRY_DELAY_MS * attempt));
      }

      const startMs = Date.now();

      try {
        const userContent = jsonMode
          ? `${prompt}\n\nRespond with valid JSON only.`
          : prompt;

        const messages: Array<{ role: "system" | "user"; content: string }> = [];
        if (systemPrompt) {
          messages.push({ role: "system", content: systemPrompt });
        }
        messages.push({ role: "user", content: userContent });

        const result = await callAI(
          {
            model: model as ModelId,
            messages,
            maxTokens,
            temperature,
            stream: false,
          },
          byok,
        );

        const provider = model.startsWith("gpt")
          ? "openai"
          : model.startsWith("claude")
            ? "anthropic"
            : "gemini";

        return {
          text: result.text,
          provider,
          model: result.model,
          inputTokens: result.tokensIn,
          outputTokens: result.tokensOut,
          latencyMs: Date.now() - startMs,
          wasFallback: isFallback,
        };
      } catch (err) {
        lastError = err instanceof Error ? err : new Error(String(err));
        if (attempt < MAX_RETRIES) continue;
        break;
      }
    }
  }

  throw new Error(
    `All AI models failed. Last error: ${lastError?.message ?? "Unknown"}`
  );
}

/* -------------------------------------------------------------------------- */
/*                      TOKEN / LENGTH LIMIT HANDLING                         */
/* -------------------------------------------------------------------------- */

export function truncateToTokenLimit(text: string, maxTokens: number): string {
  const maxChars = maxTokens * CHARS_PER_TOKEN;
  if (text.length <= maxChars) return text;
  return text.slice(0, maxChars) + "\n\n[Content truncated to fit token limits]";
}

export function truncateResumeContext(text: string): string {
  return truncateToTokenLimit(text, TOKEN_LIMITS.resumeContext);
}

export function truncateJdContext(text: string): string {
  return truncateToTokenLimit(text, TOKEN_LIMITS.jdContext);
}

export function truncateUserQuestion(text: string): string {
  return truncateToTokenLimit(text, TOKEN_LIMITS.userQuestion);
}

/**
 * Truncate chat history to fit within token limits, keeping the most recent
 * messages. Each message is estimated at its character length / CHARS_PER_TOKEN.
 */
export function truncateChatHistory<T extends { text?: string; content?: string }>(
  messages: T[],
  maxTokens: number = TOKEN_LIMITS.chatHistory
): T[] {
  const maxChars = maxTokens * CHARS_PER_TOKEN;
  const result: T[] = [];
  let totalChars = 0;

  for (let i = messages.length - 1; i >= 0; i--) {
    const msg = messages[i];
    const content = msg.text ?? msg.content ?? "";
    const charCount = content.length;

    if (totalChars + charCount > maxChars) break;
    totalChars += charCount;
    result.unshift(msg);
  }

  return result;
}

/* -------------------------------------------------------------------------- */
/*                         OUTPUT CONTENT MODERATION                          */
/* -------------------------------------------------------------------------- */

export interface ModerationResult {
  safe: boolean;
  filtered: string;
  reason?: string;
}

const BLOCKED_PATTERNS = [
  /hide\s+this\s+from\s+(the\s+)?interviewer/i,
  /don't\s+tell\s+(the\s+)?interviewer/i,
  /cheat\s+on\s+(the\s+)?(interview|exam|test|assessment)/i,
  /pretend\s+you\s+(did|have|know)/i,
  /fabricate\s+(your|a|the)\s+(experience|credential|degree)/i,
  /lie\s+to\s+(the\s+)?interviewer/i,
  /social\s+security\s+number/i,
  /credit\s+card\s+number/i,
  /\b\d{3}-\d{2}-\d{4}\b/,
];

export function moderateOutput(text: string): ModerationResult {
  for (const pattern of BLOCKED_PATTERNS) {
    if (pattern.test(text)) {
      return {
        safe: false,
        filtered: "[Response filtered for compliance]",
        reason: "compliance_violation",
      };
    }
  }

  return { safe: true, filtered: text };
}

/* -------------------------------------------------------------------------- */
/*                           COST TRACKING                                    */
/* -------------------------------------------------------------------------- */

function estimateCostMicrocents(
  model: string,
  inputTokens: number,
  outputTokens: number
): number {
  const inputRate = COST_PER_MILLION_INPUT[model] ?? 10;
  const outputRate = COST_PER_MILLION_OUTPUT[model] ?? 40;
  const inputCost = (inputTokens / 1_000_000) * inputRate * 100_000;
  const outputCost = (outputTokens / 1_000_000) * outputRate * 100_000;
  return Math.round(inputCost + outputCost);
}

export async function logAICost(
  supabaseAdmin: SupabaseClient,
  params: {
    userId: string;
    action: string;
    model: string;
    inputTokens: number;
    outputTokens: number;
    latencyMs: number;
    wasFallback: boolean;
  }
): Promise<void> {
  try {
    const costMicrocents = estimateCostMicrocents(
      params.model,
      params.inputTokens,
      params.outputTokens
    );

    await supabaseAdmin.from("ai_usage_logs").insert({
      user_id: params.userId,
      action: params.action,
      model: params.model,
      input_tokens: params.inputTokens,
      output_tokens: params.outputTokens,
      latency_ms: params.latencyMs,
      was_fallback: params.wasFallback,
      cost_microcents: costMicrocents,
    });
  } catch (err) {
    console.error(
      "[aiProvider] Failed to log AI cost:",
      err instanceof Error ? err.message : String(err)
    );
  }
}
