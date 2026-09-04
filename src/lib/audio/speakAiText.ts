/**
 * Shared Deepgram Flux TTS playback for AI-generated text
 * (mock questions, Practice Coach hints/answers).
 * Never embeds API keys — uses Edge `mock-tts` only.
 */

import { speakInterviewerWithFallback, stopBrowserTts, type TtsOutcome } from "@/lib/mock/mockTts";
import { isServerTtsClientEnabled } from "@/lib/mock/serverTts";

export type SpeakAiTextOptions = {
  text: string;
  /** Stable id for cancellation (question id, hint id, etc.). */
  playbackId: string;
  catalogueVoiceId?: string | null;
  isCurrent?: (id: string) => boolean;
  onStart?: () => void;
  onEnd?: () => void;
};

let activeSpeakId: string | null = null;

export function stopAiTextSpeech(): void {
  activeSpeakId = null;
  stopBrowserTts();
}

/**
 * Speak AI-generated copy aloud (Flux Hannah via Edge when available).
 * Safe for mock questions and optional Practice Coach hint playback.
 */
export async function speakAiGeneratedText(options: SpeakAiTextOptions): Promise<TtsOutcome> {
  const text = options.text.trim();
  if (!text) {
    return { status: "unavailable", reason: "empty", source: "none" };
  }

  const id = options.playbackId || `ai-speak-${Date.now()}`;
  activeSpeakId = id;
  const isCurrent =
    options.isCurrent ??
    ((checkId: string) => activeSpeakId === checkId && checkId === id);

  return speakInterviewerWithFallback(text, {
    questionId: id,
    playbackId: id,
    catalogueVoiceId: options.catalogueVoiceId ?? "classic_professional",
    isCurrent,
    onStart: options.onStart,
    onEnd: options.onEnd,
  });
}

export function isAiSpeechConfigured(): boolean {
  return isServerTtsClientEnabled();
}
