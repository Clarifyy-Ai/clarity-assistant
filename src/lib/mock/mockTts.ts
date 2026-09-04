/**
 * TTS helpers tied to question identity for mock interviews.
 *
 * Delivery order (honesty):
 *  1. Optional Edge/server TTS when enabled and audio is returned
 *  2. Browser speechSynthesis as a basic fallback only
 *  3. Text-on-screen when both are unavailable
 *
 * Never claim licensed server voices are working without real Edge audio.
 *
 * Chrome will silently drop utterances after cancel(), pause the synth after a
 * few seconds, and block speak() without a user gesture. Callers must:
 *  - unlock on an explicit click (Start / Play)
 *  - restart speak only when the question identity changes
 */

import {
  getInterviewerVoice,
  resolveBrowserVoiceForCatalogue,
} from "@/lib/mock/interviewerVoiceCatalog";
import { requestServerTts } from "@/lib/mock/serverTts";

export type TtsOutcomeStatus =
  | "playing"
  | "blocked"
  | "unavailable"
  | "ended"
  | "error"
  | "cancelled";

export type TtsOutcome = {
  status: TtsOutcomeStatus;
  reason?: string;
  /** Provenance for UI honesty. */
  source?: "server" | "browser" | "none";
};

export type QuestionTtsIdentity = {
  id: string;
  text: string;
};

const VOICE_READY_MS = 600;
const AUTOPLAY_DETECT_MS = 900;
/** Chrome pauses speechSynthesis after a few seconds unless resume() is poked. */
export const TTS_KEEPALIVE_MS = 4_000;
const SPEAK_AFTER_CANCEL_MS = 40;

let voicesReady: Promise<void> | null = null;

/** Test-only: drop cached voice waiters between cases. */
export function resetTtsModuleStateForTests(): void {
  voicesReady = null;
  stopServerTtsAudio();
}

function waitForVoices(): Promise<void> {
  if (typeof window === "undefined" || !window.speechSynthesis) {
    return Promise.resolve();
  }
  if (voicesReady) return voicesReady;

  voicesReady = new Promise((resolve) => {
    const synth = window.speechSynthesis;
    const finish = () => resolve();
    try {
      const voices = synth.getVoices();
      if (voices.length > 0) {
        finish();
        return;
      }
      synth.addEventListener("voiceschanged", finish, { once: true });
      window.setTimeout(finish, VOICE_READY_MS);
    } catch {
      finish();
    }
  });

  return voicesReady;
}

export function questionTtsIdentity(
  question: { id?: string | null; question_text?: string | null } | string | null | undefined,
  index: number,
): QuestionTtsIdentity {
  if (typeof question === "string") {
    return { id: `q-${index}`, text: question.trim() };
  }
  const text = (question?.question_text ?? "").trim();
  const id = (question?.id && String(question.id).trim()) || `q-${index}`;
  return { id, text };
}

/** True only when a new question should start TTS (not on timer / transcript ticks). */
export function shouldRestartQuestionTts(
  prev: QuestionTtsIdentity | null,
  next: QuestionTtsIdentity,
): boolean {
  if (!next.text) return false;
  if (!prev) return true;
  return prev.id !== next.id || prev.text !== next.text;
}

function startSpeakKeepAlive(): () => void {
  if (typeof window === "undefined" || !window.speechSynthesis) {
    return () => undefined;
  }
  const id = window.setInterval(() => {
    try {
      const synth = window.speechSynthesis;
      if (synth.speaking && synth.paused) {
        synth.resume();
      }
    } catch {
      /* ignore */
    }
  }, TTS_KEEPALIVE_MS);
  return () => window.clearInterval(id);
}

/** Prime speech synthesis after an explicit user gesture (autoplay unlock). */
export function unlockBrowserTts(): void {
  if (typeof window === "undefined" || !window.speechSynthesis) return;
  try {
    if (window.speechSynthesis.paused) {
      window.speechSynthesis.resume();
    }
    const u = new SpeechSynthesisUtterance(" ");
    u.volume = 0;
    u.rate = 1;
    window.speechSynthesis.speak(u);
    window.speechSynthesis.cancel();
  } catch {
    /* ignore */
  }
}

export function stopBrowserTts(): void {
  stopServerTtsAudio();
  if (typeof window === "undefined") return;
  if (!window.speechSynthesis) return;
  try {
    window.speechSynthesis.cancel();
  } catch {
    /* ignore */
  }
}

function isCancelError(error: string | undefined): boolean {
  return error === "canceled" || error === "cancelled" || error === "interrupted";
}

let activeServerAudio: HTMLAudioElement | null = null;

export function stopServerTtsAudio(): void {
  if (!activeServerAudio) return;
  try {
    activeServerAudio.pause();
    activeServerAudio.removeAttribute("src");
    activeServerAudio.load();
  } catch {
    /* ignore */
  }
  activeServerAudio = null;
}

/** Stop both server audio element and browser speechSynthesis. */
export function stopAllTts(): void {
  stopServerTtsAudio();
  stopBrowserTts();
}

function playServerAudioUrl(
  url: string,
  options: {
    questionId: string;
    isCurrent: (questionId: string) => boolean;
    onStart?: () => void;
    onEnd?: () => void;
  },
): Promise<TtsOutcome> {
  if (typeof window === "undefined" || typeof Audio === "undefined") {
    return Promise.resolve({ status: "unavailable", source: "none" as const, reason: "no_audio_api" });
  }

  stopServerTtsAudio();
  stopBrowserTts();

  return new Promise<TtsOutcome>((resolve) => {
    if (!options.isCurrent(options.questionId)) {
      resolve({ status: "cancelled", source: "server" });
      return;
    }

    let settled = false;
    const finish = (status: TtsOutcomeStatus, reason?: string) => {
      if (settled) return;
      settled = true;
      resolve(reason ? { status, reason, source: "server" } : { status, source: "server" });
    };

    const audio = new Audio(url);
    activeServerAudio = audio;
    audio.onplay = () => {
      if (!options.isCurrent(options.questionId)) {
        stopServerTtsAudio();
        finish("cancelled");
        return;
      }
      options.onStart?.();
    };
    audio.onended = () => {
      if (activeServerAudio === audio) activeServerAudio = null;
      if (!options.isCurrent(options.questionId)) {
        finish("cancelled");
        return;
      }
      options.onEnd?.();
      finish("ended");
    };
    audio.onerror = () => {
      if (activeServerAudio === audio) activeServerAudio = null;
      finish("error", "server_audio_failed");
    };

    void audio.play().catch((err) => {
      const name = err instanceof Error ? err.name : "";
      if (name === "NotAllowedError") {
        finish("blocked", "autoplay");
        return;
      }
      finish("error", err instanceof Error ? err.message : "play_failed");
    });
  });
}

export function speakQuestionText(
  text: string,
  options: {
    questionId: string;
    isCurrent: (questionId: string) => boolean;
    onStart?: () => void;
    onEnd?: () => void;
    autoplayDetectMs?: number;
    /** Optional voiceURI or voice name from the wizard TTS catalogue. */
    voice?: string | null;
    /** Catalogue id — used for rate/pitch when mapping browser voices. */
    catalogueVoiceId?: string | null;
  },
): Promise<TtsOutcome> {
  if (typeof window === "undefined" || !window.speechSynthesis) {
    return Promise.resolve({ status: "unavailable" as const, source: "none" as const }).then((outcome) => {
      queueMicrotask(() => {
        if (options.isCurrent(options.questionId)) options.onEnd?.();
      });
      return outcome;
    });
  }

  const trimmed = text.trim();
  if (!trimmed) {
    return Promise.resolve({
      status: "unavailable" as const,
      reason: "empty",
      source: "none" as const,
    }).then((outcome) => {
      queueMicrotask(() => {
        if (options.isCurrent(options.questionId)) options.onEnd?.();
      });
      return outcome;
    });
  }

  stopBrowserTts();

  const autoplayDetectMs = options.autoplayDetectMs ?? AUTOPLAY_DETECT_MS;
  const catalog = getInterviewerVoice(options.catalogueVoiceId);

  return waitForVoices().then(
    () =>
      new Promise<TtsOutcome>((resolve) => {
        if (!options.isCurrent(options.questionId)) {
          resolve({ status: "cancelled", source: "browser" });
          return;
        }

        let settled = false;
        let started = false;
        let stopKeepAlive: () => void = () => undefined;

        const finish = (status: TtsOutcomeStatus, reason?: string) => {
          if (settled) return;
          settled = true;
          stopKeepAlive();
          window.clearTimeout(autoplayTimer);
          resolve(
            reason
              ? { status, reason, source: "browser" }
              : { status, source: "browser" },
          );
        };

        const utterance = new SpeechSynthesisUtterance(trimmed);
        utterance.rate = catalog.browserRate;
        utterance.pitch = catalog.browserPitch;

        const preferred =
          (options.voice ?? "").trim() ||
          resolveBrowserVoiceForCatalogue(options.catalogueVoiceId) ||
          "";
        if (preferred) {
          const voices = window.speechSynthesis.getVoices();
          const match =
            voices.find((v) => v.voiceURI === preferred) ||
            voices.find((v) => v.name === preferred) ||
            voices.find((v) => v.name.toLowerCase().includes(preferred.toLowerCase()));
          if (match) utterance.voice = match;
        }

        utterance.onstart = () => {
          if (!options.isCurrent(options.questionId)) {
            stopBrowserTts();
            finish("cancelled");
            return;
          }
          started = true;
          stopKeepAlive = startSpeakKeepAlive();
          options.onStart?.();
        };

        utterance.onend = () => {
          if (!options.isCurrent(options.questionId)) {
            finish("cancelled");
            return;
          }
          options.onEnd?.();
          finish("ended");
        };

        utterance.onerror = (event) => {
          const err = (event as SpeechSynthesisErrorEvent).error;
          if (isCancelError(err)) {
            finish("cancelled", err);
            return;
          }
          if (!options.isCurrent(options.questionId)) {
            finish("cancelled");
            return;
          }
          if (err === "not-allowed") {
            finish("blocked", err);
            return;
          }
          if (options.isCurrent(options.questionId)) options.onEnd?.();
          finish(started ? "error" : "blocked", err);
        };

        const autoplayTimer = window.setTimeout(() => {
          if (settled || started) return;
          if (!options.isCurrent(options.questionId)) {
            finish("cancelled");
            return;
          }
          finish("blocked", "autoplay");
        }, autoplayDetectMs);

        const speakNow = () => {
          if (settled) return;
          if (!options.isCurrent(options.questionId)) {
            finish("cancelled");
            return;
          }
          try {
            if (window.speechSynthesis.paused) {
              try {
                window.speechSynthesis.resume();
              } catch {
                /* ignore */
              }
            }
            window.speechSynthesis.speak(utterance);
          } catch (err) {
            if (options.isCurrent(options.questionId)) options.onEnd?.();
            finish("error", err instanceof Error ? err.message : "speak_failed");
          }
        };

        window.setTimeout(speakNow, SPEAK_AFTER_CANCEL_MS);
      }),
  );
}

/**
 * Prefer Edge/server TTS when configured; otherwise validated browser mapping.
 * Never fakes licensed server voices as working.
 */
export async function speakInterviewerWithFallback(
  text: string,
  options: {
    questionId: string;
    playbackId: string;
    catalogueVoiceId: string | null | undefined;
    isCurrent: (questionId: string) => boolean;
    onStart?: () => void;
    onEnd?: () => void;
    autoplayDetectMs?: number;
    /** Prefer browser only (e.g. wizard preview). */
    browserOnly?: boolean;
  },
): Promise<TtsOutcome> {
  const trimmed = text.trim();
  if (!trimmed) {
    return { status: "unavailable", reason: "empty", source: "none" as const };
  }

  if (!options.browserOnly) {
    const voiceId = options.catalogueVoiceId ?? "classic_professional";
    const server = await requestServerTts({
      text: trimmed,
      voice_id: voiceId,
      playback_id: options.playbackId,
      language: getInterviewerVoice(voiceId).language,
    });

    if (!options.isCurrent(options.questionId)) {
      return { status: "cancelled", source: "server" };
    }

    if (!server.unavailable) {
      let url = server.audio_url ?? "";
      if (!url && server.audio_base64) {
        const mime = server.audio_mime || "audio/mpeg";
        url = `data:${mime};base64,${server.audio_base64}`;
      }
      if (url) {
        const outcome = await playServerAudioUrl(url, options);
        if (outcome.status === "ended" || outcome.status === "playing") {
          return outcome;
        }
        if (outcome.status === "cancelled" || outcome.status === "blocked") {
          return outcome;
        }
        // Server audio failed mid-flight — fall through to browser.
      }
    }
  }

  const browserVoice = resolveBrowserVoiceForCatalogue(options.catalogueVoiceId);
  return speakQuestionText(trimmed, {
    questionId: options.questionId,
    isCurrent: options.isCurrent,
    onStart: options.onStart,
    onEnd: options.onEnd,
    autoplayDetectMs: options.autoplayDetectMs,
    voice: browserVoice,
    catalogueVoiceId: options.catalogueVoiceId,
  });
}

/** Preview a catalogue voice (browser mapping + text fallback identity). */
export function previewCatalogueVoice(
  voiceId: string | null | undefined,
  options?: {
    text?: string;
    isCurrent?: (questionId: string) => boolean;
  },
): Promise<TtsOutcome> {
  const catalog = getInterviewerVoice(voiceId);
  const text = (options?.text ?? catalog.previewText).trim();
  const questionId = `preview:${catalog.id}`;
  return speakInterviewerWithFallback(text, {
    questionId,
    playbackId: `preview_${catalog.id}_${Date.now()}`,
    catalogueVoiceId: catalog.id,
    isCurrent: options?.isCurrent ?? (() => true),
    browserOnly: true,
  });
}
