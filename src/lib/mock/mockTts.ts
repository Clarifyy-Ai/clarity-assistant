/**
 * Browser TTS helpers tied to question identity for mock interviews.
 */

export function stopBrowserTts(): void {
  if (typeof window === "undefined") return;
  if (!("speechSynthesis" in window)) return;
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
  if (typeof window === "undefined" || !("speechSynthesis" in window)) {
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
    // Treat error as end so callers leave question_speaking and open listening.
    if (!options.isCurrent(options.questionId)) return;
    options.onEnd?.();
  };

  // Defer speak so cancel() of prior utterance settles.
  queueMicrotask(() => {
    if (!options.isCurrent(options.questionId)) return;
    try {
      window.speechSynthesis.speak(utterance);
    } catch {
      if (options.isCurrent(options.questionId)) options.onEnd?.();
    }
  });
}
