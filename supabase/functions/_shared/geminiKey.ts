/**
 * Gemini API key resolution and validation.
 *
 * Precedence (Google docs + legacy aliases):
 *   GOOGLE_API_KEY → GEMINI_API_KEY → GOOGLE_AI_API_KEY
 *
 * Accepts standard AIza… keys and Sept-2026-era AQ.… authorization keys.
 * Never log or return the raw key from health endpoints.
 */

import { DEFAULT_TEXT_MODEL } from "./modelCatalog.ts";

export type GeminiProbeReason =
  | "missing"
  | "invalid_format"
  | "auth_failed"
  | "model_unavailable"
  | "timeout"
  | "unavailable";

export type GeminiProbeResult = {
  ok: boolean;
  reason?: GeminiProbeReason;
  model?: string;
  latencyMs?: number;
  status?: number;
};

export function geminiKeyLooksValid(value: string | undefined): boolean {
  const v = (value ?? "").trim();
  if (!v || v.length < 20) return false;
  return (
    /^AIza[0-9A-Za-z_-]{20,}$/.test(v) ||
    /^AQ\.[A-Za-z0-9_-]{20,}$/.test(v)
  );
}

/** Server-side Gemini key — never expose to the browser. */
export function resolveGeminiApiKey(): string {
  return (
    Deno.env.get("GOOGLE_API_KEY") ??
    Deno.env.get("GEMINI_API_KEY") ??
    Deno.env.get("GOOGLE_AI_API_KEY") ??
    ""
  ).trim();
}

export function resolveGeminiProbeModel(): string {
  const override = (Deno.env.get("GEMINI_MODEL_DEFAULT") ?? "").trim();
  if (override && /^gemini-[a-z0-9.-]+$/i.test(override)) return override;
  return DEFAULT_TEXT_MODEL;
}

/** Lightweight live probe — does not log the key. */
export async function probeGeminiApiKeyDetailed(
  apiKey: string,
  model = resolveGeminiProbeModel(),
): Promise<GeminiProbeResult> {
  if (!apiKey.trim()) {
    return { ok: false, reason: "missing", model };
  }
  if (!geminiKeyLooksValid(apiKey)) {
    return { ok: false, reason: "invalid_format", model };
  }

  const version = Deno.env.get("GEMINI_API_VERSION") ?? "v1beta";
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 12_000);
  const start = Date.now();
  try {
    const res = await fetch(
      `https://generativelanguage.googleapis.com/${version}/models/${model}:generateContent`,
      {
        method: "POST",
        signal: controller.signal,
        headers: {
          "Content-Type": "application/json",
          "x-goog-api-key": apiKey,
        },
        body: JSON.stringify({
          contents: [{ parts: [{ text: "ping" }] }],
          generationConfig: { maxOutputTokens: 8 },
        }),
      },
    );
    const latencyMs = Date.now() - start;
    if (res.ok) {
      return { ok: true, model, latencyMs, status: res.status };
    }
    if (res.status === 401 || res.status === 403) {
      return { ok: false, reason: "auth_failed", model, latencyMs, status: res.status };
    }
    if (res.status === 404) {
      return {
        ok: false,
        reason: "model_unavailable",
        model,
        latencyMs,
        status: res.status,
      };
    }
    return {
      ok: false,
      reason: "unavailable",
      model,
      latencyMs,
      status: res.status,
    };
  } catch (err) {
    const latencyMs = Date.now() - start;
    if (err instanceof Error && err.name === "AbortError") {
      return { ok: false, reason: "timeout", model, latencyMs };
    }
    return { ok: false, reason: "unavailable", model, latencyMs };
  } finally {
    clearTimeout(timer);
  }
}

/** @deprecated Prefer probeGeminiApiKeyDetailed for typed reasons. */
export async function probeGeminiApiKey(
  apiKey: string,
  model = resolveGeminiProbeModel(),
): Promise<boolean> {
  const result = await probeGeminiApiKeyDetailed(apiKey, model);
  return result.ok;
}
