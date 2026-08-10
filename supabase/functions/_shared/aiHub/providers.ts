// supabase/functions/_shared/aiHub/providers.ts
// Edge-safe provider adapters. Keys from Deno.env only.

import {
  estimateCostMicroUsd,
  estimateInputTokens,
  getHubModel,
  type AIHubProvider,
} from "./registry.ts";

export interface HubGenerateRequest {
  provider: AIHubProvider;
  model: string;
  prompt: string;
  systemPrompt?: string;
  maxOutputTokens: number;
  temperature?: number;
}

export interface HubGenerateResult {
  provider: AIHubProvider | "mock";
  model: string;
  responseText: string;
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  latencyMs: number;
  estimatedCostMicroUsd: number;
  actualCostMicroUsd: number;
  finishReason: string;
  success: boolean;
  errorCode?: string;
  errorMessage?: string;
}

function providerMode(): "mock" | "live" {
  const m = (Deno.env.get("AI_PROVIDER_MODE") ?? "mock").toLowerCase();
  return m === "live" ? "live" : "mock";
}

function missingKeyMessage(provider: AIHubProvider): string {
  if (provider === "openai") return "OpenAI API is not configured.";
  if (provider === "gemini") return "Gemini API is not configured.";
  return "Anthropic API is not configured.";
}

function getKey(provider: AIHubProvider): string | null {
  const map: Record<AIHubProvider, string | undefined> = {
    openai: Deno.env.get("OPENAI_API_KEY"),
    gemini: Deno.env.get("GEMINI_API_KEY"),
    anthropic: Deno.env.get("ANTHROPIC_API_KEY"),
  };
  const v = (map[provider] ?? "").trim();
  return v || null;
}

export function providerConfigured(provider: AIHubProvider): boolean {
  return Boolean(getKey(provider));
}

async function mockGenerate(req: HubGenerateRequest): Promise<HubGenerateResult> {
  const start = Date.now();
  await new Promise((r) => setTimeout(r, 40 + Math.floor(Math.random() * 80)));
  const inputTokens = estimateInputTokens(
    `${req.systemPrompt ?? ""}\n${req.prompt}`,
  );
  const outputTokens = Math.min(120, req.maxOutputTokens);
  const estimated = estimateCostMicroUsd(req.model, inputTokens, outputTokens);
  return {
    provider: "mock",
    model: req.model,
    responseText:
      `[MOCK ${req.provider}/${req.model}] ` +
      `Echo: ${req.prompt.slice(0, 280)}${req.prompt.length > 280 ? "…" : ""}`,
    inputTokens,
    outputTokens,
    totalTokens: inputTokens + outputTokens,
    latencyMs: Date.now() - start,
    estimatedCostMicroUsd: estimated,
    actualCostMicroUsd: estimated,
    finishReason: "stop",
    success: true,
  };
}

async function openaiGenerate(req: HubGenerateRequest, key: string): Promise<HubGenerateResult> {
  const start = Date.now();
  const messages: Array<{ role: string; content: string }> = [];
  if (req.systemPrompt) messages.push({ role: "system", content: req.systemPrompt });
  messages.push({ role: "user", content: req.prompt });

  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: req.model,
      messages,
      max_tokens: req.maxOutputTokens,
      temperature: req.temperature ?? 0.4,
    }),
  });
  const data = await res.json().catch(() => ({}));
  const latencyMs = Date.now() - start;
  if (!res.ok) {
    return {
      provider: "openai",
      model: req.model,
      responseText: "",
      inputTokens: 0,
      outputTokens: 0,
      totalTokens: 0,
      latencyMs,
      estimatedCostMicroUsd: 0,
      actualCostMicroUsd: 0,
      finishReason: "error",
      success: false,
      errorCode: res.status === 429 ? "RATE_LIMITED" : "PROVIDER_UNAVAILABLE",
      errorMessage: missingOrSafeError(data, "OpenAI request failed"),
    };
  }
  const inputTokens = Number(data?.usage?.prompt_tokens ?? estimateInputTokens(req.prompt));
  const outputTokens = Number(data?.usage?.completion_tokens ?? 0);
  const text = data?.choices?.[0]?.message?.content ?? "";
  const actual = estimateCostMicroUsd(req.model, inputTokens, outputTokens);
  return {
    provider: "openai",
    model: req.model,
    responseText: text,
    inputTokens,
    outputTokens,
    totalTokens: inputTokens + outputTokens,
    latencyMs,
    estimatedCostMicroUsd: actual,
    actualCostMicroUsd: actual,
    finishReason: data?.choices?.[0]?.finish_reason ?? "stop",
    success: true,
  };
}

async function geminiGenerate(req: HubGenerateRequest, key: string): Promise<HubGenerateResult> {
  const start = Date.now();
  const version = Deno.env.get("GEMINI_API_VERSION") ?? "v1beta";
  const url =
    `https://generativelanguage.googleapis.com/${version}/models/${req.model}:generateContent`;
  const payload: Record<string, unknown> = {
    contents: [{ role: "user", parts: [{ text: req.prompt }] }],
    generationConfig: {
      maxOutputTokens: req.maxOutputTokens,
      temperature: req.temperature ?? 0.4,
    },
  };
  if (req.systemPrompt) {
    payload.systemInstruction = { parts: [{ text: req.systemPrompt }] };
  }
  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-goog-api-key": key,
    },
    body: JSON.stringify(payload),
  });
  const data = await res.json().catch(() => ({}));
  const latencyMs = Date.now() - start;
  if (!res.ok) {
    return {
      provider: "gemini",
      model: req.model,
      responseText: "",
      inputTokens: 0,
      outputTokens: 0,
      totalTokens: 0,
      latencyMs,
      estimatedCostMicroUsd: 0,
      actualCostMicroUsd: 0,
      finishReason: "error",
      success: false,
      errorCode: res.status === 429 ? "RATE_LIMITED" : "PROVIDER_UNAVAILABLE",
      errorMessage: missingOrSafeError(data, "Gemini request failed"),
    };
  }
  const parts = data?.candidates?.[0]?.content?.parts;
  const text = Array.isArray(parts)
    ? parts.map((p: { text?: string }) => p.text ?? "").join("")
    : "";
  const inputTokens = Number(
    data?.usageMetadata?.promptTokenCount ?? estimateInputTokens(req.prompt),
  );
  const outputTokens = Number(
    data?.usageMetadata?.candidatesTokenCount ?? Math.ceil(text.length / 4),
  );
  const actual = estimateCostMicroUsd(req.model, inputTokens, outputTokens);
  return {
    provider: "gemini",
    model: req.model,
    responseText: text,
    inputTokens,
    outputTokens,
    totalTokens: inputTokens + outputTokens,
    latencyMs,
    estimatedCostMicroUsd: actual,
    actualCostMicroUsd: actual,
    finishReason: data?.candidates?.[0]?.finishReason ?? "stop",
    success: true,
  };
}

async function anthropicGenerate(req: HubGenerateRequest, key: string): Promise<HubGenerateResult> {
  const start = Date.now();
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "x-api-key": key,
      "anthropic-version": "2023-06-01",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: req.model,
      max_tokens: req.maxOutputTokens,
      temperature: req.temperature ?? 0.4,
      system: req.systemPrompt || undefined,
      messages: [{ role: "user", content: req.prompt }],
    }),
  });
  const data = await res.json().catch(() => ({}));
  const latencyMs = Date.now() - start;
  if (!res.ok) {
    return {
      provider: "anthropic",
      model: req.model,
      responseText: "",
      inputTokens: 0,
      outputTokens: 0,
      totalTokens: 0,
      latencyMs,
      estimatedCostMicroUsd: 0,
      actualCostMicroUsd: 0,
      finishReason: "error",
      success: false,
      errorCode: res.status === 429 ? "RATE_LIMITED" : "PROVIDER_UNAVAILABLE",
      errorMessage: missingOrSafeError(data, "Anthropic request failed"),
    };
  }
  const blocks = data?.content;
  const text = Array.isArray(blocks)
    ? blocks.map((b: { text?: string }) => b.text ?? "").join("")
    : "";
  const inputTokens = Number(data?.usage?.input_tokens ?? estimateInputTokens(req.prompt));
  const outputTokens = Number(data?.usage?.output_tokens ?? Math.ceil(text.length / 4));
  const actual = estimateCostMicroUsd(req.model, inputTokens, outputTokens);
  return {
    provider: "anthropic",
    model: req.model,
    responseText: text,
    inputTokens,
    outputTokens,
    totalTokens: inputTokens + outputTokens,
    latencyMs,
    estimatedCostMicroUsd: actual,
    actualCostMicroUsd: actual,
    finishReason: data?.stop_reason ?? "stop",
    success: true,
  };
}

function missingOrSafeError(data: unknown, fallback: string): string {
  const err = (data as { error?: { message?: string }; message?: string })?.error?.message
    ?? (data as { message?: string })?.message
    ?? fallback;
  return String(err).slice(0, 280).replace(/sk-[a-zA-Z0-9]+/g, "[redacted]");
}

export async function hubGenerate(req: HubGenerateRequest): Promise<HubGenerateResult> {
  const model = getHubModel(req.model);
  if (!model || model.provider !== req.provider) {
    return {
      provider: req.provider,
      model: req.model,
      responseText: "",
      inputTokens: 0,
      outputTokens: 0,
      totalTokens: 0,
      latencyMs: 0,
      estimatedCostMicroUsd: 0,
      actualCostMicroUsd: 0,
      finishReason: "error",
      success: false,
      errorCode: "MODEL_NOT_AVAILABLE",
      errorMessage: `Model ${req.model} is not available for ${req.provider}.`,
    };
  }

  if (providerMode() === "mock") {
    return mockGenerate(req);
  }

  const key = getKey(req.provider);
  if (!key) {
    return {
      provider: req.provider,
      model: req.model,
      responseText: "",
      inputTokens: 0,
      outputTokens: 0,
      totalTokens: 0,
      latencyMs: 0,
      estimatedCostMicroUsd: 0,
      actualCostMicroUsd: 0,
      finishReason: "error",
      success: false,
      errorCode: "INVALID_API_KEY",
      errorMessage: missingKeyMessage(req.provider),
    };
  }

  if (req.provider === "openai") return openaiGenerate(req, key);
  if (req.provider === "gemini") return geminiGenerate(req, key);
  return anthropicGenerate(req, key);
}

export async function cheapConnectionTest(
  provider: AIHubProvider,
): Promise<{ ok: boolean; latencyMs: number; error?: string }> {
  if (providerMode() === "mock") {
    return { ok: true, latencyMs: 12 };
  }
  const key = getKey(provider);
  if (!key) return { ok: false, latencyMs: 0, error: missingKeyMessage(provider) };

  const start = Date.now();
  try {
    if (provider === "openai") {
      const res = await fetch("https://api.openai.com/v1/models", {
        headers: { Authorization: `Bearer ${key}` },
      });
      return {
        ok: res.ok,
        latencyMs: Date.now() - start,
        error: res.ok ? undefined : `HTTP ${res.status}`,
      };
    }
    if (provider === "gemini") {
      const version = Deno.env.get("GEMINI_API_VERSION") ?? "v1beta";
      const res = await fetch(
        `https://generativelanguage.googleapis.com/${version}/models?key=${encodeURIComponent(key)}`,
      );
      return {
        ok: res.ok,
        latencyMs: Date.now() - start,
        error: res.ok ? undefined : `HTTP ${res.status}`,
      };
    }
    // Anthropic has no cheap models list — tiny message
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "x-api-key": key,
        "anthropic-version": "2023-06-01",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "claude-3-haiku-20240307",
        max_tokens: 1,
        messages: [{ role: "user", content: "ping" }],
      }),
    });
    return {
      ok: res.ok,
      latencyMs: Date.now() - start,
      error: res.ok ? undefined : `HTTP ${res.status}`,
    };
  } catch (e) {
    return {
      ok: false,
      latencyMs: Date.now() - start,
      error: e instanceof Error ? e.message.slice(0, 160) : "Connection failed",
    };
  }
}
