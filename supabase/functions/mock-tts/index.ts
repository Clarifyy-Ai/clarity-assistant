/**
 * Interviewer / coach TTS Edge function (Deepgram Flux Speak v2).
 *
 * Honesty:
 * - Returns unavailable unless DEEPGRAM_API_KEY is configured (SERVER_TTS_ENABLED
 *   defaults on when the key is present; set SERVER_TTS_ENABLED=false to force off).
 * - Speaks AI-generated question/hint text via flux-* models on POST /v2/speak.
 * - Provider voice IDs stay server-side; clients send catalogue voice_id only.
 */

import { handleCors, getCorsHeaders, withCorsHeaders } from "../_shared/cors.ts";
import { authenticateRequest } from "../_shared/auth.ts";
import { createServiceClient } from "../_shared/supabase.ts";
import { enforceSessionRateLimitAsync } from "../_shared/rateLimit.ts";

/** Catalogue id → Deepgram Flux Speak v2 model (server-only). */
const CATALOGUE_TO_FLUX: Record<string, string> = {
  classic_professional: "flux-hannah-en",
  calm_mentor: "flux-heather-en",
  clear_interviewer: "flux-marcus-en",
  warm_recruiter: "flux-hannah-en",
  technical_panelist: "flux-wade-en",
  executive_formal: "flux-bruce-en",
};

const DEFAULT_FLUX_MODEL = "flux-hannah-en";

function json(
  headers: HeadersInit,
  status: number,
  body: Record<string, unknown>,
): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...headers, "Content-Type": "application/json", "Cache-Control": "no-store" },
  });
}

function serverTtsConfigured(): { ok: boolean; reason: string; apiKey?: string } {
  const apiKey = (Deno.env.get("DEEPGRAM_API_KEY") ?? "").trim();
  if (!apiKey) {
    return {
      ok: false,
      reason: "Server TTS provider key missing — using browser voice.",
    };
  }
  const enabledRaw = (Deno.env.get("SERVER_TTS_ENABLED") ?? "").trim().toLowerCase();
  // Key present → on by default. Explicit false/0/no disables.
  if (enabledRaw === "0" || enabledRaw === "false" || enabledRaw === "no") {
    return {
      ok: false,
      reason: "Server TTS disabled (SERVER_TTS_ENABLED=false) — using browser voice.",
    };
  }
  return { ok: true, reason: "ok", apiKey };
}

function resolveFluxModel(voiceId: string): string {
  const override = (Deno.env.get("DEEPGRAM_AGENT_SPEAK_MODEL") ?? "").trim();
  if (override.startsWith("flux-")) return override;
  return CATALOGUE_TO_FLUX[voiceId] ?? DEFAULT_FLUX_MODEL;
}

function bytesToBase64(bytes: Uint8Array): string {
  let binary = "";
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(binary);
}

Deno.serve(async (req: Request) => {
  const cors = handleCors(req);
  if (cors) return cors;

  const headers = getCorsHeaders(req);

  try {
    const auth = await authenticateRequest(req);
    if (auth.error) return auth.error;
    const user = auth.context.user;

    const db = createServiceClient();
    const rateLimited = await enforceSessionRateLimitAsync(db, "mock-tts", user.id);
    if (rateLimited) return withCorsHeaders(req, rateLimited);

    if (req.method !== "POST") {
      return json(headers, 405, {
        unavailable: true,
        error: "Method not allowed",
        code: "METHOD_NOT_ALLOWED",
      });
    }

    const config = serverTtsConfigured();
    if (!config.ok || !config.apiKey) {
      return json(headers, 200, {
        unavailable: true,
        message: config.reason,
        code: "SERVER_TTS_UNAVAILABLE",
      });
    }

    let body: {
      text?: string;
      voice_id?: string;
      language?: string;
      playback_id?: string;
      speed?: number;
      expressivity?: number;
    } = {};
    try {
      body = (await req.json()) as typeof body;
    } catch {
      return json(headers, 400, {
        unavailable: true,
        error: "Invalid JSON body",
        code: "INVALID_BODY",
      });
    }

    const text = String(body.text ?? "").trim();
    if (!text) {
      return json(headers, 400, {
        unavailable: true,
        error: "text is required",
        code: "EMPTY_TEXT",
      });
    }
    if (text.length > 4_000) {
      return json(headers, 400, {
        unavailable: true,
        error: "text too long",
        code: "TEXT_TOO_LONG",
      });
    }

    const voiceId = String(body.voice_id ?? "classic_professional").trim();
    const model = resolveFluxModel(voiceId);
    const speed = Number.isFinite(Number(body.speed)) ? Number(body.speed) : 1;
    const expressivity = Number.isFinite(Number(body.expressivity))
      ? Math.round(Number(body.expressivity))
      : 0;

    const params = new URLSearchParams({
      model,
      encoding: "mp3",
      speed: String(speed),
      expressivity: String(expressivity),
    });

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 20_000);

    let speakRes: Response;
    try {
      // Flux TTS batch — matches Deepgram speak.v2 / POST /v2/speak
      speakRes = await fetch(`https://api.deepgram.com/v2/speak?${params.toString()}`, {
        method: "POST",
        headers: {
          Authorization: `Token ${config.apiKey}`,
          "Content-Type": "application/json",
          Accept: "audio/mpeg",
        },
        body: JSON.stringify({ text }),
        signal: controller.signal,
      });
    } finally {
      clearTimeout(timeout);
    }

    if (!speakRes.ok) {
      const errText = await speakRes.text().catch(() => "");
      console.error("[mock-tts] Deepgram speak v2 failed:", speakRes.status, errText.slice(0, 300));
      return json(headers, 200, {
        unavailable: true,
        message: "Server TTS provider failed — using browser voice.",
        code: "PROVIDER_FAILED",
      });
    }

    const bytes = new Uint8Array(await speakRes.arrayBuffer());
    if (bytes.byteLength < 32) {
      return json(headers, 200, {
        unavailable: true,
        message: "Server TTS returned empty audio — using browser voice.",
        code: "EMPTY_AUDIO",
      });
    }

    return json(headers, 200, {
      unavailable: false,
      audio_base64: bytesToBase64(bytes),
      audio_mime: "audio/mpeg",
      voice_id: voiceId,
      model,
      speak_api: "v2",
      playback_id: body.playback_id ?? null,
      message: "ok",
    });
  } catch (err) {
    console.error("[mock-tts] unexpected error:", err);
    return json(headers, 200, {
      unavailable: true,
      message: "Server TTS error — using browser voice.",
      code: "SERVER_TTS_ERROR",
    });
  }
});
