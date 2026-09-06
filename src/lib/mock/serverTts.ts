/**
 * Optional server TTS via Edge `mock-tts`.
 *
 * Honesty rules:
 * - Browser speechSynthesis is a basic fallback only (see mockTts.ts).
 * - Never report licensed/server voices as working unless Edge + env are configured
 *   and the Edge function returns real audio.
 * - When unavailable, return an explicit unavailable status for the caller to
 *   fall back to browser mapping + on-screen text.
 */

import { fetchEdgeJson } from "@/lib/network/fetchEdge";

/** After a network/CORS failure, skip further mock-tts probes for this page load. */
let serverTtsEndpointUnavailable = false;

const SERVER_TTS_TIMEOUT_MS = 5_000;

/** Test-only: reset cached endpoint-unavailable state between cases. */
export function resetServerTtsProbeForTests(): void {
  serverTtsEndpointUnavailable = false;
}

function markServerTtsEndpointUnavailable(): void {
  serverTtsEndpointUnavailable = true;
}

export type ServerTtsRequest = {
  text: string;
  voice_id: string;
  language?: string;
  playback_id: string;
};

export type ServerTtsResponse = {
  audio_url?: string;
  /** base64 audio payload when Edge returns inline bytes instead of a URL */
  audio_base64?: string;
  audio_mime?: string;
  unavailable: boolean;
  message?: string;
  /** Provenance for UI honesty — never invent "server" when falling back. */
  source?: "server" | "unavailable";
};

/** Client opt-in for Edge Flux TTS. Default on — Edge still returns unavailable without DEEPGRAM_API_KEY. */
export function isServerTtsClientEnabled(): boolean {
  try {
    const raw = String(import.meta.env.VITE_ENABLE_SERVER_TTS ?? "true")
      .trim()
      .toLowerCase();
    return !(raw === "0" || raw === "false" || raw === "no");
  } catch {
    return true;
  }
}

/**
 * Probe whether the client is allowed to attempt server TTS.
 * Does not claim the Edge provider is healthy — only that the attempt is enabled.
 */
export function getServerTtsClientStatus(): {
  enabled: boolean;
  message: string;
} {
  if (!isServerTtsClientEnabled()) {
    return {
      enabled: false,
      message: "Server TTS not configured — using browser voice.",
    };
  }
  return {
    enabled: true,
    message: "Server TTS enabled — will request Edge audio when available.",
  };
}

/** Client helper — honest unavailable unless Edge returns playable audio. */
export async function requestServerTts(
  req: ServerTtsRequest,
): Promise<ServerTtsResponse> {
  const trimmed = (req.text ?? "").trim();
  if (!trimmed) {
    return {
      unavailable: true,
      source: "unavailable",
      message: "Empty text — nothing to speak.",
    };
  }

  if (!isServerTtsClientEnabled()) {
    return {
      unavailable: true,
      source: "unavailable",
      message: "Server TTS not configured — using browser voice.",
    };
  }

  if (serverTtsEndpointUnavailable) {
    return {
      unavailable: true,
      source: "unavailable",
      message: "Server TTS endpoint unavailable — using browser voice.",
    };
  }

  try {
    const data = await fetchEdgeJson<{
      unavailable?: boolean;
      audio_url?: string;
      audio_base64?: string;
      audio_mime?: string;
      message?: string;
      error?: string;
      code?: string;
    }>(
      "mock-tts",
      {
        text: trimmed,
        voice_id: req.voice_id,
        language: req.language ?? "en",
        playback_id: req.playback_id,
      },
      { timeoutMs: SERVER_TTS_TIMEOUT_MS },
    );

    if (data?.unavailable === true) {
      return {
        unavailable: true,
        source: "unavailable",
        message:
          data.message ||
          data.error ||
          "Server TTS unavailable — using browser voice.",
      };
    }

    const audioUrl = typeof data?.audio_url === "string" ? data.audio_url.trim() : "";
    const audioBase64 =
      typeof data?.audio_base64 === "string" ? data.audio_base64.trim() : "";
    if (!audioUrl && !audioBase64) {
      return {
        unavailable: true,
        source: "unavailable",
        message:
          data?.message ||
          "Server TTS returned no audio — using browser voice.",
      };
    }

    return {
      unavailable: false,
      source: "server",
      audio_url: audioUrl || undefined,
      audio_base64: audioBase64 || undefined,
      audio_mime:
        typeof data?.audio_mime === "string" ? data.audio_mime : "audio/mpeg",
      message: data?.message,
    };
  } catch (err) {
    markServerTtsEndpointUnavailable();
    const msg =
      err instanceof Error ? err.message : "Server TTS request failed.";
    return {
      unavailable: true,
      source: "unavailable",
      message: `${msg} — using browser voice.`,
    };
  }
}

