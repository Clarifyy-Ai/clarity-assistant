/** Shared gov exam custom paper question-count validation (client + tests). */

export const GOV_QUESTION_COUNT_MIN = 5;
export const GOV_QUESTION_COUNT_ABS_MAX = 100;
export const GOV_QUESTION_COUNT_CUSTOM_DEFAULT = 25;

/** Paper bases that lock question count to the official exam pattern. */
export const GOV_EXACT_PATTERN_BASES = [
  "full_sim",
  "hybrid",
  "official_previous",
] as const;

export function isGovExactPatternBasis(basis: string): boolean {
  return (GOV_EXACT_PATTERN_BASES as readonly string[]).includes(basis);
}

function resolvePatternTotal(patternTotal: number | null | undefined): number {
  if (typeof patternTotal === "number" && Number.isFinite(patternTotal) && patternTotal > 0) {
    return Math.floor(patternTotal);
  }
  return GOV_QUESTION_COUNT_ABS_MAX;
}

function customMaxForBasis(basis: string, patternTotal: number | null | undefined): number {
  if (basis === "topic") return GOV_QUESTION_COUNT_ABS_MAX;
  return Math.min(GOV_QUESTION_COUNT_ABS_MAX, resolvePatternTotal(patternTotal));
}

function clampToRange(n: number, max: number): number {
  return Math.min(Math.max(GOV_QUESTION_COUNT_MIN, n), max);
}

/**
 * Keep the numeric count and the text input in lockstep when paper basis changes.
 * Exact / Full Mock → pattern total (or 100 if the pattern is missing).
 * Custom / quick / topic → reset to 25 only when the field still shows the
 * full-mock total; otherwise keep a user-chosen custom count.
 */
export function syncQuestionCountForBasis(
  basis: string,
  patternTotal: number | null | undefined,
  currentInput: string,
): { count: number; input: string } {
  const fullMockTotal = resolvePatternTotal(patternTotal);

  if (isGovExactPatternBasis(basis)) {
    return { count: fullMockTotal, input: String(fullMockTotal) };
  }

  const customMax = customMaxForBasis(basis, patternTotal);
  const customDefault = clampToRange(GOV_QUESTION_COUNT_CUSTOM_DEFAULT, customMax);
  const trimmed = currentInput.trim();
  const parsedInt = Number.parseInt(trimmed, 10);
  const matchesFullMock =
    trimmed === String(fullMockTotal) ||
    (Number.isFinite(parsedInt) && parsedInt === fullMockTotal);

  if (matchesFullMock) {
    return { count: customDefault, input: String(customDefault) };
  }

  const parsed = parseGovQuestionCount(trimmed, customMax);
  if (parsed.valid) {
    return { count: parsed.value, input: String(parsed.value) };
  }

  return { count: customDefault, input: String(customDefault) };
}

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
