/** Shared question-count bounds for gov exam custom papers (UI + Edge). */

export const GOV_QUESTION_COUNT_MIN = 5;
export const GOV_QUESTION_COUNT_ABS_MAX = 100;

export type QuestionCountValidation =
  | { ok: true; value: number }
  | { ok: false; code: "INVALID_QUESTION_COUNT"; error: string };

const INVALID_CHARS = /[eE.+-]/;

export function validateGovQuestionCount(
  raw: unknown,
  max = GOV_QUESTION_COUNT_ABS_MAX,
): QuestionCountValidation {
  const ceiling = Math.max(GOV_QUESTION_COUNT_MIN, Math.floor(max));

  if (typeof raw === "string") {
    const trimmed = raw.trim();
    if (!trimmed) {
      return { ok: false, code: "INVALID_QUESTION_COUNT", error: "questionCount is required" };
    }
    if (INVALID_CHARS.test(trimmed) || !/^\d+$/.test(trimmed)) {
      return {
        ok: false,
        code: "INVALID_QUESTION_COUNT",
        error: "questionCount must be a whole number without scientific notation",
      };
    }
    const n = Number.parseInt(trimmed, 10);
    if (!Number.isFinite(n)) {
      return { ok: false, code: "INVALID_QUESTION_COUNT", error: "questionCount is invalid" };
    }
    if (n < GOV_QUESTION_COUNT_MIN || n > ceiling) {
      return {
        ok: false,
        code: "INVALID_QUESTION_COUNT",
        error: `questionCount must be between ${GOV_QUESTION_COUNT_MIN} and ${ceiling}`,
      };
    }
    return { ok: true, value: n };
  }

  if (typeof raw === "number") {
    if (!Number.isFinite(raw) || !Number.isInteger(raw)) {
      return { ok: false, code: "INVALID_QUESTION_COUNT", error: "questionCount must be an integer" };
    }
    if (raw < GOV_QUESTION_COUNT_MIN || raw > ceiling) {
      return {
        ok: false,
        code: "INVALID_QUESTION_COUNT",
        error: `questionCount must be between ${GOV_QUESTION_COUNT_MIN} and ${ceiling}`,
      };
    }
    return { ok: true, value: raw };
  }

  return { ok: false, code: "INVALID_QUESTION_COUNT", error: "questionCount is required" };
}

/**
 * Clamp/reject untrusted questionCount.
 * Prefer validateGovQuestionCount at API boundaries.
 */
export function clampGovQuestionCount(
  raw: unknown,
  max = GOV_QUESTION_COUNT_ABS_MAX,
): number {
  const v = validateGovQuestionCount(raw, max);
  return v.ok ? v.value : GOV_QUESTION_COUNT_MIN;
}
