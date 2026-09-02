/**
 * Deepgram streaming payloads for E2E WebSocket mocks and unit tests.
 * Shape matches what DeepgramStreamClient.handleMessage expects.
 */

export type DeepgramMockScheduleItem = {
  delayMs?: number;
  payload: Record<string, unknown>;
};

export function buildDeepgramInterimResult(transcript: string): Record<string, unknown> {
  return {
    type: "Results",
    is_final: false,
    channel: {
      alternatives: [{ transcript, confidence: 0.88, words: [] }],
    },
  };
}

export function buildDeepgramFinalResult(
  transcript: string,
  opts?: { start?: number; duration?: number; speaker?: number },
): Record<string, unknown> {
  const start = opts?.start ?? 0;
  const duration = opts?.duration ?? 1.2;
  const speaker = opts?.speaker ?? 1;
  const words = transcript.split(/\s+/).filter(Boolean).map((word, index, all) => {
    const slice = duration / Math.max(all.length, 1);
    const wordStart = start + index * slice;
    return {
      word: word.toLowerCase(),
      start: wordStart,
      end: wordStart + slice,
      confidence: 0.92,
      speaker,
      punctuated_word: index === 0 ? word : word,
    };
  });

  return {
    type: "Results",
    is_final: true,
    start,
    duration,
    channel: {
      alternatives: [{ transcript, confidence: 0.94, words }],
    },
  };
}

export function buildDefaultTranscriptionSchedule(
  partialText: string,
  finalText: string,
): DeepgramMockScheduleItem[] {
  return [
    { delayMs: 120, payload: buildDeepgramInterimResult(partialText) },
    { delayMs: 420, payload: buildDeepgramFinalResult(finalText) },
  ];
}

/** E2E schedule: emit partial quickly, hold final so the overlay can observe both states. */
export function buildE2eTranscriptionSchedule(
  partialText: string,
  finalText: string,
  finalDelayMs = 8_000,
): DeepgramMockScheduleItem[] {
  return [
    { delayMs: 150, payload: buildDeepgramInterimResult(partialText) },
    { delayMs: finalDelayMs, payload: buildDeepgramFinalResult(finalText) },
  ];
}
