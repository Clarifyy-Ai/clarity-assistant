/**
 * Deepgram STT / Voice Agent cost estimates for ai_usage_logs.
 * Rates are USD per audio minute (pay-as-you-go approximations).
 */
import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";

/** USD per minute → stored as microcents (1 USD cent = 10_000 microcents). */
const USD_CENTS_PER_MINUTE: Record<string, number> = {
  "nova-2": 0.43,
  "nova-2-meeting": 0.43,
  "nova-2-phonecall": 0.43,
  "nova-2-general": 0.43,
  "nova-3": 0.48,
  "flux-general-en": 0.5,
  "flux-kit-en": 0.55,
  whisper: 0.48,
};

const DEFAULT_STT_MODEL = "nova-2-meeting";

export function resolveDeepgramSttModel(): string {
  const raw = (Deno.env.get("DEEPGRAM_STT_MODEL") ?? "").trim();
  return raw || DEFAULT_STT_MODEL;
}

export function deepgramKeyLooksValid(value: string | undefined): boolean {
  const v = (value ?? "").trim();
  if (v.length < 32) return false;
  return /^[a-f0-9]{32,}$/i.test(v) || /^[A-Za-z0-9_-]{32,}$/.test(v);
}

export function inferDeepgramProvider(modelId: string): "deepgram" | "other" {
  const m = modelId.toLowerCase();
  if (
    m.startsWith("nova") ||
    m.startsWith("flux") ||
    m.startsWith("whisper") ||
    m.startsWith("deepgram")
  ) {
    return "deepgram";
  }
  return "other";
}

/** Microcents for N seconds of audio at model rate. */
export function estimateDeepgramAudioMicrocents(
  model: string,
  audioSeconds: number,
): number {
  const minutes = Math.max(0, audioSeconds) / 60;
  const key = model.toLowerCase();
  const rateUsdCentsPerMin =
    USD_CENTS_PER_MINUTE[key] ??
    USD_CENTS_PER_MINUTE[Object.keys(USD_CENTS_PER_MINUTE).find((k) => key.includes(k)) ?? ""] ??
    USD_CENTS_PER_MINUTE[DEFAULT_STT_MODEL];
  return Math.round(minutes * rateUsdCentsPerMin * 10_000);
}

/** Reserved estimate when minting a scoped token (max TTL window). */
export function estimateDeepgramSessionReserveMicrocents(
  model: string,
  ttlSeconds: number,
): number {
  return estimateDeepgramAudioMicrocents(model, ttlSeconds);
}

export async function logDeepgramUsage(
  supabaseAdmin: SupabaseClient,
  params: {
    userId: string;
    action: string;
    model: string;
    audioSeconds: number;
    latencyMs: number;
    wasFallback?: boolean;
  },
): Promise<void> {
  try {
    const costMicrocents = estimateDeepgramAudioMicrocents(
      params.model,
      params.audioSeconds,
    );
    await supabaseAdmin.from("ai_usage_logs").insert({
      user_id: params.userId,
      action: params.action,
      model: params.model,
      input_tokens: 0,
      output_tokens: Math.round(params.audioSeconds),
      latency_ms: params.latencyMs,
      was_fallback: params.wasFallback ?? false,
      cost_microcents: costMicrocents,
    });
  } catch (err) {
    console.error(
      "[deepgramCost] Failed to log usage:",
      err instanceof Error ? err.message : String(err),
    );
  }
}
