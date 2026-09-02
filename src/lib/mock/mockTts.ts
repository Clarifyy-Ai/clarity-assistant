/**
 * Browser TTS helpers tied to question identity for mock interviews.
 *
 * Chrome will silently drop utterances after cancel(), pause the synth after a
 * few seconds, and block speak() without a user gesture. Callers must:
 *  - unlock on an explicit click (Start / Play)
 *  - restart speak only when the question identity changes
 */

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
      if (synth.speaking) {
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

export function speakQuestionText(
  text: string,
  options: {
    questionId: string;
    isCurrent: (questionId: string) => boolean;
    onStart?: () => void;
    onEnd?: () => void;
    autoplayDetectMs?: number;
  },
): Promise<TtsOutcome> {
  if (typeof window === "undefined" || !window.speechSynthesis) {
    return Promise.resolve({ status: "unavailable" as const }).then((outcome) => {
      queueMicrotask(() => {
        if (options.isCurrent(options.questionId)) options.onEnd?.();
      });
      return outcome;
    });
  }

  const trimmed = text.trim();
  if (!trimmed) {
    return Promise.resolve({ status: "unavailable" as const, reason: "empty" }).then((outcome) => {
      queueMicrotask(() => {
        if (options.isCurrent(options.questionId)) options.onEnd?.();
      });
      return outcome;
    });
  }

  stopBrowserTts();

  const autoplayDetectMs = options.autoplayDetectMs ?? AUTOPLAY_DETECT_MS;

  return waitForVoices().then(
    () =>
      new Promise<TtsOutcome>((resolve) => {
        if (!options.isCurrent(options.questionId)) {
          resolve({ status: "cancelled" });
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
          resolve(reason ? { status, reason } : { status });
        };

        const utterance = new SpeechSynthesisUtterance(trimmed);
        utterance.rate = 1.0;

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
