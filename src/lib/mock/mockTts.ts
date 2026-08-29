/**
 * Browser TTS helpers tied to question identity for mock interviews.
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
};

const VOICE_READY_MS = 600;
const AUTOPLAY_DETECT_MS = 900;

let voicesReady: Promise<void> | null = null;

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

/** Prime speech synthesis after an explicit user gesture (autoplay unlock). */
export function unlockBrowserTts(): void {
  if (typeof window === "undefined" || !window.speechSynthesis) return;
  try {
    if (window.speechSynthesis.paused) {
      window.speechSynthesis.resume();
    }
    const u = new SpeechSynthesisUtterance("");
    u.volume = 0;
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

export function speakQuestionText(
  text: string,
  options: {
    questionId: string;
    isCurrent: (questionId: string) => boolean;
    onStart?: () => void;
    onEnd?: () => void;
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
    return Promise.resolve({ status: "unavailable" as const }).then((outcome) => {
      queueMicrotask(() => {
        if (options.isCurrent(options.questionId)) options.onEnd?.();
      });
      return outcome;
    });
  }

  stopBrowserTts();

  return waitForVoices().then(
    () =>
      new Promise<TtsOutcome>((resolve) => {
        if (!options.isCurrent(options.questionId)) {
          resolve({ status: "cancelled" });
          return;
        }

        let settled = false;
        let started = false;

        const finish = (status: TtsOutcomeStatus) => {
          if (settled) return;
          settled = true;
          window.clearTimeout(autoplayTimer);
          resolve({ status });
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
          options.onStart?.();
        };

        utterance.onend = () => {
          if (!options.isCurrent(options.questionId)) return;
          if (options.isCurrent(options.questionId)) options.onEnd?.();
          finish("ended");
        };

        utterance.onerror = () => {
          if (!options.isCurrent(options.questionId)) return;
          if (options.isCurrent(options.questionId)) options.onEnd?.();
          finish(started ? "error" : "blocked");
        };

        const autoplayTimer = window.setTimeout(() => {
          if (settled || started) return;
          if (!options.isCurrent(options.questionId)) {
            finish("cancelled");
            return;
          }
          if (options.isCurrent(options.questionId)) options.onEnd?.();
          finish("blocked");
        }, AUTOPLAY_DETECT_MS);

        queueMicrotask(() => {
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
          } catch {
            if (options.isCurrent(options.questionId)) options.onEnd?.();
            finish("error");
          }
        });
      }),
  );
}
