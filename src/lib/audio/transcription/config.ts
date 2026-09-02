/**
 * Environment-based STT configuration — no API secrets on the client.
 * Tokens are minted server-side via the deepgram-token edge function.
 */

import type { DeepgramConfig } from "@/types/audio.types";

export type ParakeetTranscriptionConfig = {
  /** When false, service surfaces provider-unavailable without calling edge. */
  enabled: boolean;
  model: DeepgramConfig["model"];
  language: string;
  interimResults: boolean;
  utteranceEndMs: number;
  fillerWords: boolean;
};

function readEnvFlag(name: string, defaultValue: boolean): boolean {
  const raw = import.meta.env[name];
  if (raw === undefined || raw === "") return defaultValue;
  return String(raw).toLowerCase() !== "false" && String(raw) !== "0";
}

export function loadParakeetTranscriptionConfig(): ParakeetTranscriptionConfig {
  const modelRaw = import.meta.env.VITE_STT_MODEL as string | undefined;
  const model =
    modelRaw === "nova-2" ||
    modelRaw === "nova-2-meeting" ||
    modelRaw === "nova-2-phonecall"
      ? modelRaw
      : "nova-2-meeting";

  return {
    enabled: readEnvFlag("VITE_ENABLE_LIVE_TRANSCRIPTION", true),
    model,
    language: (import.meta.env.VITE_STT_LANGUAGE as string | undefined) ?? "en-US",
    interimResults: readEnvFlag("VITE_STT_INTERIM_RESULTS", true),
    utteranceEndMs: Number(import.meta.env.VITE_STT_UTTERANCE_END_MS ?? 1200),
    fillerWords: readEnvFlag("VITE_STT_FILLER_WORDS", true),
  };
}
