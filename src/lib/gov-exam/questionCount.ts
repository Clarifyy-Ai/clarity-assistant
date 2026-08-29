/** Shared gov exam custom paper question-count validation (client + tests). */

export const GOV_QUESTION_COUNT_MIN = 5;
export const GOV_QUESTION_COUNT_ABS_MAX = 100;

export type QuestionCountParseResult =
  | { valid: true; value: number }
  | { valid: false; error: string; code: "INVALID_QUESTION_COUNT" };

const INVALID_CHARS = /[eE.+-]/;

/**
 * Parse user input into a bounded base-10 integer.
 * Rejects exponent notation, decimals, empty, zero, and out-of-range values.
 */
export function parseGovQuestionCount(
  raw: unknown,
  max = GOV_QUESTION_COUNT_ABS_MAX,
): QuestionCountParseResult {
  const ceiling = Math.max(GOV_QUESTION_COUNT_MIN, Math.floor(max));

  if (typeof raw === "string") {
    const trimmed = raw.trim();
    if (!trimmed) {
      return { valid: false, error: "Enter a question count.", code: "INVALID_QUESTION_COUNT" };
    }
    if (INVALID_CHARS.test(trimmed)) {
      return {
        valid: false,
        error: "Use a whole number between 5 and 100 (no decimals or scientific notation).",
        code: "INVALID_QUESTION_COUNT",
      };
    }
    if (!/^\d+$/.test(trimmed)) {
      return { valid: false, error: "Enter a valid whole number.", code: "INVALID_QUESTION_COUNT" };
    }
    const n = Number.parseInt(trimmed, 10);
    if (!Number.isFinite(n)) {
      return { valid: false, error: "Enter a valid whole number.", code: "INVALID_QUESTION_COUNT" };
    }
    if (n < GOV_QUESTION_COUNT_MIN) {
      return {
        valid: false,
        error: `Minimum ${GOV_QUESTION_COUNT_MIN} questions.`,
        code: "INVALID_QUESTION_COUNT",
      };
    }
    if (n > ceiling) {
      return {
        valid: false,
        error: `Maximum ${ceiling} questions for this paper.`,
        code: "INVALID_QUESTION_COUNT",
      };
    }
    return { valid: true, value: n };
  }

  if (typeof raw === "number") {
    if (!Number.isFinite(raw) || !Number.isInteger(raw)) {
      return { valid: false, error: "Enter a valid whole number.", code: "INVALID_QUESTION_COUNT" };
    }
    if (raw < GOV_QUESTION_COUNT_MIN || raw > ceiling) {
      return {
        valid: false,
        error: `Enter ${GOV_QUESTION_COUNT_MIN}–${ceiling} questions.`,
        code: "INVALID_QUESTION_COUNT",
      };
    }
    return { valid: true, value: raw };
  }

  return { valid: false, error: "Enter a question count.", code: "INVALID_QUESTION_COUNT" };
}

/** Legacy clamp helper — prefer parseGovQuestionCount for user-facing input. */
export function clampGovQuestionCount(raw: unknown, max = GOV_QUESTION_COUNT_ABS_MAX): number {
  const parsed = parseGovQuestionCount(raw, max);
  return parsed.valid ? parsed.value : GOV_QUESTION_COUNT_MIN;
}
