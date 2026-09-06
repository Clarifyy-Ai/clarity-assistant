/**
 * Scorecard scorable-answer quality floor — keep in sync with
 * supabase/functions/_shared/scorecardEligibility.ts (isNonScorableAnswer).
 */

const MIN_SCORABLE_ANSWER_CHARS = 10;

const JUNK_ANSWER_PATTERN =
  /^(idk|i dont know|i do not know|dont know|do not know|no idea|not sure|n a|na|none|skip|pass|no comment)$/;

export function isNonScorableAnswer(answer: unknown): boolean {
  const text = String(answer ?? "")
    .replace(/\s+/g, " ")
    .trim();
  if (!text || text === "(skipped)") return true;
  const normalized = text
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, "")
    .replace(/\s+/g, " ")
    .trim();
  return (
    normalized.length < MIN_SCORABLE_ANSWER_CHARS ||
    JUNK_ANSWER_PATTERN.test(normalized)
  );
}

export function countScorableAnswers(
  rows: Array<{ answer?: unknown }>,
): number {
  return rows.filter((row) => !isNonScorableAnswer(row.answer)).length;
}
