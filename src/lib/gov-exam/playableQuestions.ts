/**
 * Strip answer keys from question payloads used during a live attempt.
 */

export const PLAYABLE_QUESTION_COLUMNS = [
  "id",
  "question_text",
  "question_html",
  "question_type",
  "options",
  "subject",
  "topic",
  "subtopic",
  "difficulty",
  "exam_type",
  "marks_positive",
  "marks_negative",
  "has_image",
  "image_url",
  "latex_present",
] as const;

export const ANSWER_KEY_FIELDS = [
  "correct_answer",
  "explanation",
  "explanation_html",
] as const;

export type PlayableQuestion = {
  id: string;
  question_text: string;
  question_html?: string | null;
  question_type: string;
  options: unknown;
  subject: string;
  topic: string;
  subtopic?: string | null;
  difficulty?: string | null;
  exam_type?: string | null;
  marks_positive?: number | null;
  marks_negative?: number | null;
  has_image?: boolean | null;
  image_url?: string | null;
  latex_present?: boolean | null;
};

export function stripAnswerKeys<T extends Record<string, unknown>>(row: T): PlayableQuestion {
  const next = { ...row };
  for (const field of ANSWER_KEY_FIELDS) {
    delete next[field];
  }
  return next as unknown as PlayableQuestion;
}

export function assertNoAnswerKeys(row: Record<string, unknown>): void {
  for (const field of ANSWER_KEY_FIELDS) {
    if (field in row && row[field] != null && String(row[field]).length > 0) {
      throw new Error(`Answer key field "${field}" must not be present during an active attempt.`);
    }
  }
}

export function hasAnswerKeys(row: Record<string, unknown> | null | undefined): boolean {
  if (!row) return false;
  return ANSWER_KEY_FIELDS.some((field) => field in row && row[field] != null && String(row[field]).length > 0);
}
