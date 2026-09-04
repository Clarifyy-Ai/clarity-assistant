/**
 * Mock interviewer TTS Edge function.
 *
 * Honesty:
 * - Returns unavailable unless SERVER_TTS_ENABLED=true AND a provider key exists.
 * - Does not claim licensed voices work when only STT keys (e.g. Deepgram listen) are set.
 * - Provider voice IDs stay server-side; clients send catalogue voice_id only.
 */

import { handleCors, getCorsHeaders, withCorsHeaders } from "../_shared/cors.ts";
import { authenticateRequest } from "../_shared/auth.ts";
import { createServiceClient } from "../_shared/supabase.ts";
import { enforceSessionRateLimitAsync } from "../_shared/rateLimit.ts";

/** Catalogue id → Deepgram Aura speak model (server-only). */
const CATALOGUE_TO_DEEPGRAM: Record<string, string> = {
  classic_professional: "aura-orion-en",
  calm_mentor: "aura-luna-en",
  clear_interviewer: "aura-asteria-en",
  warm_recruiter: "aura-stella-en",
  technical_panelist: "aura-arcas-en",
  executive_formal: "aura-helios-en",
};

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
  const enabled = (Deno.env.get("SERVER_TTS_ENABLED") ?? "").trim().toLowerCase();
  if (!(enabled === "1" || enabled === "true" || enabled === "yes")) {
    return {
      ok: false,
      reason: "Server TTS not enabled (set SERVER_TTS_ENABLED=true) — using browser voice.",
    };
  }
  const apiKey = (Deno.env.get("DEEPGRAM_API_KEY") ?? "").trim();
  if (!apiKey) {
    return {
      ok: false,
      reason: "Server TTS provider key missing — using browser voice.",
    };
  }
  return { ok: true, reason: "ok", apiKey };
}

function resolveDeepgramModel(voiceId: string): string {
  return CATALOGUE_TO_DEEPGRAM[voiceId] ?? CATALOGUE_TO_DEEPGRAM.classic_professional;
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
      // Honest unavailable — client must fall back to browser TTS + text.
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
    const model = resolveDeepgramModel(voiceId);
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15_000);

    let speakRes: Response;
    try {
      speakRes = await fetch(
        `https://api.deepgram.com/v1/speak?model=${encodeURIComponent(model)}`,
        {
          method: "POST",
          headers: {
            Authorization: `Token ${config.apiKey}`,
            "Content-Type": "application/json",
            Accept: "audio/mpeg",
          },
          body: JSON.stringify({ text }),
          signal: controller.signal,
        },
      );
    } finally {
      clearTimeout(timeout);
    }

    if (!speakRes.ok) {
      const errText = await speakRes.text().catch(() => "");
      console.error("[mock-tts] Deepgram speak failed:", speakRes.status, errText.slice(0, 200));
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

    let binary = "";
    const chunk = 0x8000;
    for (let i = 0; i < bytes.length; i += chunk) {
      binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
    }
    const audio_base64 = btoa(binary);

    return json(headers, 200, {
      unavailable: false,
      audio_base64,
      audio_mime: "audio/mpeg",
      voice_id: voiceId,
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
