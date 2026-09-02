// supabase/functions/_shared/aiProvider.ts
//
// AI Provider abstraction with automatic fallback across Gemini, OpenAI, and Anthropic.
// Prefers live-available models (paid/free) and fails over per model on 429/404.
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
import { DEFAULT_TEXT_MODEL, providerForModel } from "./modelCatalog.ts";
import { getFallbackModelsAsync } from "./resolveModel.ts";
import { createServiceClient } from "./supabase.ts";
import {
  geminiCircuitCanAttempt,
  tripGeminiCircuit,
} from "./aiFeaturePolicy.ts";

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
  userId?: string;
  action: string;
  jsonMode?: boolean;
  /** API model id (e.g. gpt-4o, gemini-2.0-flash). Falls back to Gemini chain if omitted. */
  model?: string;
  /** Skip OpenAI/Anthropic when Gemini returns 429/quota (avoid double spend). */
  skipSecondaryOnQuota?: boolean;
  /** @deprecated M1 — BYOK ignored; server keys only. */
  byok?: Record<string, never>;
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
  primary: DEFAULT_TEXT_MODEL,
  fallback: "gemini-flash-latest",
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
  "gemini-2.0-flash-lite": 8,
  "gemini-1.5-pro": 125,
  "gemini-2.5-flash": 10,
  "gemini-2.5-flash-lite": 8,
  "gemini-2.5-pro": 125,
  "gemini-flash-latest": 10,
  "gpt-4o": 250,
  "gpt-4o-mini": 15,
  "gpt-4.1": 200,
  "gpt-4.1-mini": 15,
  "claude-3-5-sonnet-20241022": 300,
  "claude-3-haiku-20240307": 25,
  "claude-3-5-haiku-20241022": 80,
};

const COST_PER_MILLION_OUTPUT: Record<string, number> = {
  "gemini-2.0-flash": 40,
  "gemini-2.0-flash-lite": 30,
  "gemini-1.5-pro": 500,
  "gemini-2.5-flash": 40,
  "gemini-2.5-flash-lite": 30,
  "gemini-2.5-pro": 500,
  "gemini-flash-latest": 40,
  "gpt-4o": 1000,
  "gpt-4o-mini": 60,
  "gpt-4.1": 800,
  "gpt-4.1-mini": 60,
  "claude-3-5-sonnet-20241022": 1500,
  "claude-3-haiku-20240307": 125,
  "claude-3-5-haiku-20241022": 400,
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

function isQuotaOrRateLimitError(err: Error): boolean {
  const msg = err.message.toLowerCase();
  return (
    msg.includes("429") ||
    msg.includes("quota") ||
    msg.includes("rate limit") ||
    msg.includes("resource_exhausted")
  );
}

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/** Placeholders like "gap-fill" cannot be stored as user_id; table allows null. */
function resolveUsageUserId(userId: string | undefined): string | null {
  if (!userId || !userId.trim()) return null;
  const trimmed = userId.trim();
  return UUID_RE.test(trimmed) ? trimmed : null;
}

function isAuthOrKeyError(err: Error): boolean {
  return /API_KEY_INVALID|invalid.?api.?key|401|API key not/i.test(err.message);
}

function isModelUnavailableError(err: Error): boolean {
  return /404|not found|INVALID_ARGUMENT|deprecated|empty response/i.test(
    err.message,
  );
}

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
    skipSecondaryOnQuota = false,
  } = options;

  const models = await getFallbackModelsAsync(requestedModel ?? MODELS.primary);
  const geminiModels = models.filter((m) => providerForModel(m) === "gemini");
  let lastError: Error | null = null;
  const circuitOpen = !geminiCircuitCanAttempt();
  let skipGeminiFamily = circuitOpen;
  let geminiQuotaFails = circuitOpen ? geminiModels.length : 0;

  for (let i = 0; i < models.length; i++) {
    const model = models[i];
    const provider = providerForModel(model) ?? "gemini";
    const isGemini = provider === "gemini";
    if (skipGeminiFamily && isGemini) continue;
    if (
      skipSecondaryOnQuota &&
      !isGemini &&
      geminiModels.length > 0 &&
      geminiQuotaFails >= geminiModels.length
    ) {
      continue;
    }

    const isFallback = i > 0;
    const attempts = MAX_RETRIES;

    for (let attempt = 0; attempt <= attempts; attempt++) {
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
            jsonMode,
          },
        );

        if (!result.text || !result.text.trim()) {
          throw new Error(`Model ${model} returned an empty response`);
        }

        const payload: AIProviderResult = {
          text: result.text,
          provider,
          model: result.model,
          inputTokens: result.tokensIn,
          outputTokens: result.tokensOut,
          latencyMs: Date.now() - startMs,
          wasFallback: isFallback,
        };

        try {
          void logAICost(createServiceClient(), {
            userId: resolveUsageUserId(options.userId),
            action: options.action || "unknown",
            model: payload.model,
            inputTokens: payload.inputTokens,
            outputTokens: payload.outputTokens,
            latencyMs: payload.latencyMs,
            wasFallback: payload.wasFallback,
          }).catch(() => {});
        } catch (err) {
          console.error(
            "[aiProvider] Failed to schedule AI cost log:",
            err instanceof Error ? err.message : String(err),
          );
        }

        return payload;
      } catch (err) {
        lastError = err instanceof Error ? err : new Error(String(err));
        console.warn(
          JSON.stringify({
            phase: "AI_PROVIDER_ATTEMPT_FAIL",
            model,
            attempt,
            message: lastError.message.slice(0, 240),
          }),
        );

        const quota = isQuotaOrRateLimitError(lastError);
        if (isGemini && quota) {
          geminiQuotaFails += 1;
          if (geminiQuotaFails >= geminiModels.length) {
            tripGeminiCircuit();
          }
          break;
        }
        if (isGemini && isAuthOrKeyError(lastError)) {
          skipGeminiFamily = true;
          break;
        }
        if (isGemini && isModelUnavailableError(lastError)) {
          break;
        }
        if (attempt < attempts) continue;
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
    userId: string | null;
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
