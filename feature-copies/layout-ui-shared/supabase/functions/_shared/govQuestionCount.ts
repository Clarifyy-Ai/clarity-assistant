/** Shared question-count bounds for gov exam custom papers (UI + Edge). */

export const GOV_QUESTION_COUNT_MIN = 5;
export const GOV_QUESTION_COUNT_ABS_MAX = 100;

/**
 * Clamp/reject untrusted questionCount.
 * Rejects scientific notation and non-integers so values like "5e55" cannot
 * become huge operations.
 */
export function clampGovQuestionCount(
  raw: unknown,
  max = GOV_QUESTION_COUNT_ABS_MAX,
): number {
  const ceiling = Math.max(GOV_QUESTION_COUNT_MIN, Math.floor(max));
  if (typeof raw === "string") {
    const trimmed = raw.trim();
    if (!trimmed || /[eE.+-]/.test(trimmed)) return GOV_QUESTION_COUNT_MIN;
    const n = Number.parseInt(trimmed, 10);
    if (!Number.isFinite(n)) return GOV_QUESTION_COUNT_MIN;
    return Math.min(Math.max(GOV_QUESTION_COUNT_MIN, n), ceiling);
  }
  if (typeof raw === "number") {
    if (!Number.isFinite(raw) || !Number.isInteger(raw)) return GOV_QUESTION_COUNT_MIN;
    return Math.min(Math.max(GOV_QUESTION_COUNT_MIN, Math.floor(raw)), ceiling);
  }
  return GOV_QUESTION_COUNT_MIN;
}
