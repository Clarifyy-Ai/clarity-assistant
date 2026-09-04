/**
 * Configurable silence / end-of-answer policy for Mock Interview.
 * Single source of truth — do not hardcode timers in components.
 */

export type SilencePolicy = {
  /** Ignore silence until candidate has spoken at least this long. */
  minAnswerMs: number;
  /** First silence window before inspecting completeness (~3s). */
  silenceConfirmMs: number;
  /** Max wait after speech stops before force-finalize (~5s). */
  silenceMaxMs: number;
  /** No speech at all → show no-answer prompt. */
  noAnswerMs: number;
  /** Brief pause that must not cut the answer. */
  briefPauseMs: number;
};

export const DEFAULT_SILENCE_POLICY: SilencePolicy = {
  minAnswerMs: 1_500,
  silenceConfirmMs: 3_000,
  silenceMaxMs: 5_000,
  noAnswerMs: 25_000,
  briefPauseMs: 800,
};

export type SilenceDecision =
  | "ignore"
  | "wait"
  | "confirm_incomplete"
  | "finalize"
  | "no_answer_prompt";

/**
 * Pure decision helper for silence-driven finalize.
 * @param silenceMs how long since last speech / transcript activity
 * @param hasSpoken candidate produced content this turn
 * @param answerDurationMs time since listening started with content
 * @param transcriptLooksComplete heuristic from final transcript
 * @param interviewerSpeaking TTS playing
 * @param paused session paused
 */
export function decideSilenceAdvance(input: {
  silenceMs: number;
  hasSpoken: boolean;
  answerDurationMs: number;
  transcriptLooksComplete: boolean;
  interviewerSpeaking: boolean;
  paused: boolean;
  policy?: SilencePolicy;
}): SilenceDecision {
  const policy = input.policy ?? DEFAULT_SILENCE_POLICY;
  if (input.paused || input.interviewerSpeaking) return "ignore";
  if (!input.hasSpoken) {
    return input.silenceMs >= policy.noAnswerMs ? "no_answer_prompt" : "ignore";
  }
  if (input.answerDurationMs < policy.minAnswerMs) return "wait";
  if (input.silenceMs < policy.briefPauseMs) return "wait";
  if (input.silenceMs < policy.silenceConfirmMs) return "wait";
  if (
    input.silenceMs >= policy.silenceConfirmMs &&
    input.silenceMs < policy.silenceMaxMs &&
    !input.transcriptLooksComplete
  ) {
    return "confirm_incomplete";
  }
  if (input.silenceMs >= policy.silenceConfirmMs) return "finalize";
  return "wait";
}

/** Cheap completeness heuristic — ends with period/?/! or enough words. */
export function transcriptLooksComplete(text: string): boolean {
  const t = text.trim();
  if (t.length < 12) return false;
  if (/[.?!…]["']?$/.test(t)) return true;
  return t.split(/\s+/).filter(Boolean).length >= 18;
}
