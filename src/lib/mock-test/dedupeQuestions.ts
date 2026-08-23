import { normalizeMcqOptions } from "@/lib/gov-exam/mcqValidator";
import {
  conflictsWithSelected,
  questionFingerprint,
} from "@/lib/gov-exam/validators/similarity";
import { sanitizeQuestionStem } from "@/lib/mock-test/questionMedia";
import { DEDUP_POLICY } from "@/lib/gov-exam/algorithmCatalog";

export type DedupeableQuestion = {
  id: string;
  question_text: string;
  options?: unknown;
};

/** Drop exact / near-duplicate stems so a paper never shows the same MCQ twice. */
export function dedupeQuestionsByStem<T extends DedupeableQuestion>(
  questions: T[],
  threshold = DEDUP_POLICY.stem_only_conflict,
): T[] {
  const out: T[] = [];
  const stems: string[] = [];
  const seenFp = new Set<string>();

  for (const question of questions) {
    const text = sanitizeQuestionStem(question.question_text);
    if (!text) continue;
    const options = normalizeMcqOptions(question.options);
    const fingerprint = questionFingerprint(text, options);
    if (seenFp.has(fingerprint)) continue;
    if (conflictsWithSelected(text, stems, threshold)) continue;
    seenFp.add(fingerprint);
    stems.push(text);
    out.push({ ...question, question_text: text });
  }

  return out;
}

/**
 * Live sessions should not shrink an assembled paper. Only drop identical
 * copies (same fingerprint / same id) so related topic questions stay.
 */
export function dedupeExactQuestionCopies<T extends DedupeableQuestion>(
  questions: T[],
): T[] {
  const out: T[] = [];
  const seenId = new Set<string>();
  const seenFp = new Set<string>();

  for (const question of questions) {
    if (seenId.has(question.id)) continue;
    const text = sanitizeQuestionStem(question.question_text);
    if (!text) continue;
    const options = normalizeMcqOptions(question.options);
    const fingerprint = questionFingerprint(text, options);
    if (seenFp.has(fingerprint)) continue;
    seenId.add(question.id);
    seenFp.add(fingerprint);
    out.push({ ...question, question_text: text });
  }

  return out;
}
