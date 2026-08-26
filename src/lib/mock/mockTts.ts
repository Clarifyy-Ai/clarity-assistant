/**
 * Browser TTS helpers tied to question identity for mock interviews.
 */

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
): void {
  if (typeof window === "undefined" || !window.speechSynthesis) {
    queueMicrotask(() => {
      if (options.isCurrent(options.questionId)) options.onEnd?.();
    });
    return;
  }
  const trimmed = text.trim();
  if (!trimmed) {
    queueMicrotask(() => {
      if (options.isCurrent(options.questionId)) options.onEnd?.();
    });
    return;
  }

  stopBrowserTts();

  const utterance = new SpeechSynthesisUtterance(trimmed);
  utterance.rate = 1.0;

  utterance.onstart = () => {
    if (!options.isCurrent(options.questionId)) {
      stopBrowserTts();
      return;
    }
    options.onStart?.();
  };

  utterance.onend = () => {
    if (!options.isCurrent(options.questionId)) return;
    options.onEnd?.();
  };

  utterance.onerror = () => {
    if (!options.isCurrent(options.questionId)) return;
    options.onEnd?.();
  };

  // Defer speak so cancel() of prior utterance settles (must use queueMicrotask — queueMicrotask is not a browser API).
  queueMicrotask(() => {
    if (!options.isCurrent(options.questionId)) {
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
    }
  });
}
