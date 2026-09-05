/**
 * Client mirror of supabase/functions/_shared/practiceCoachContract.ts
 * Keep field names aligned with Edge DTOs.
 */
import type { CoachTone, HintStyle } from "@/types/user.types";

export const HINT_STYLES = ["short_hints", "keywords_only", "full_answer"] as const;
export const COACH_TONES = ["encouraging", "direct", "formal", "casual"] as const;
export const ANSWER_MODES = ["hint", "full_answer"] as const;

export type AnswerMode = (typeof ANSWER_MODES)[number];

export function sanitizeHintStyle(input: unknown, fallback: HintStyle = "short_hints"): HintStyle {
  const value = String(input ?? "").trim().toLowerCase();
  if ((HINT_STYLES as readonly string[]).includes(value)) {
    return value as HintStyle;
  }
  switch (value) {
    case "minimal":
      return "keywords_only";
    case "balanced":
      return "short_hints";
    case "detailed":
      return "full_answer";
    default:
      return fallback;
  }
}

export function sanitizeCoachTone(input: unknown, fallback: CoachTone = "encouraging"): CoachTone {
  const value = String(input ?? "").trim().toLowerCase();
  return (COACH_TONES as readonly string[]).includes(value)
    ? (value as CoachTone)
    : fallback;
}

export function sanitizeAnswerMode(input: unknown, fallback: AnswerMode = "hint"): AnswerMode {
  const value = String(input ?? "").trim().toLowerCase();
  return (ANSWER_MODES as readonly string[]).includes(value)
    ? (value as AnswerMode)
    : fallback;
}

/** Fields sent with generate-hint / generate-answer requests. */
export function practiceCoachStylePayload(opts: {
  hintStyle?: unknown;
  coachTone?: unknown;
  answerMode?: unknown;
}) {
  return {
    hint_style: sanitizeHintStyle(opts.hintStyle),
    coach_tone: sanitizeCoachTone(opts.coachTone),
    answer_mode: sanitizeAnswerMode(opts.answerMode),
  };
}
