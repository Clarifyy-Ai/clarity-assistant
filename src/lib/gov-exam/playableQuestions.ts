/**
 * Strip answer keys from question payloads used during a live attempt.
 */

import { stripQuestionMetadataForPlay } from "@/lib/question-bank/codingMetadata";

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
  "metadata",
] as const;

export const ANSWER_KEY_FIELDS = [
  "correct_answer",
  "explanation",
  "explanation_html",
] as const;

/** Data API relation that never includes answer keys. */
export const PLAYABLE_QUESTIONS_VIEW = "questions_playable" as const;

export function playableQuestionSelect(): string {
  return PLAYABLE_QUESTION_COLUMNS.join(",");
}

/** Answer keys are only for post-submit review of the taker's own completed paper. */
export function shouldRevealAnswerKeys(testStatus: string | null | undefined): boolean {
  return String(testStatus ?? "").toUpperCase() === "COMPLETED";
}

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
  metadata?: unknown;
};

export function stripAnswerKeys<T extends Record<string, unknown>>(row: T): PlayableQuestion {
  const next: Record<string, unknown> = { ...row };
  for (const field of ANSWER_KEY_FIELDS) {
    delete next[field];
  }
  if ("metadata" in next) {
    const stripped = stripQuestionMetadataForPlay(next.metadata);
    if (stripped) next.metadata = stripped;
    else delete next.metadata;
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
