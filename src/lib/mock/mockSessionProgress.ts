// Mid-session mock progress stored on sessions.notes (no migration).

import type { SessionQuestion } from "@/types/session.types";
import type { MockAnswerStatus, AnswerFinalizationOutcome } from "@/lib/mock/answerNextFsm";

export const SKIPPED_ANSWER_SENTINEL = "(skipped)";

export const MOCK_PROGRESS_MARKER = "__clarify_mock_progress__";

export type MockProgressAnswer = {
  question_id: string | null;
  question_text: string;
  answer_text: string;
  question_index: number;
  skipped: boolean;
  status: MockAnswerStatus;
  outcome: AnswerFinalizationOutcome;
  filler_count: number;
  wpm: number;
  duration_seconds: number;
  timestamp: string;
};

export type MockSessionProgressV1 = {
  [MOCK_PROGRESS_MARKER]: true;
  v: 1;
  current_question_index: number;
  elapsed_seconds: number;
  target_question_count: number;
  started_at: string;
  questions: SessionQuestion[];
  answers: MockProgressAnswer[];
};

export function encodeMockProgressNotes(progress: Omit<MockSessionProgressV1, typeof MOCK_PROGRESS_MARKER | "v">): string {
  const payload: MockSessionProgressV1 = {
    [MOCK_PROGRESS_MARKER]: true,
    v: 1,
    ...progress,
  };
  return JSON.stringify(payload);
}

export function parseMockProgressNotes(notes: string | null | undefined): MockSessionProgressV1 | null {
  if (!notes || typeof notes !== "string") return null;
  const trimmed = notes.trim();
  if (!trimmed.startsWith("{")) return null;
  try {
    const parsed = JSON.parse(trimmed) as Partial<MockSessionProgressV1>;
    if (!parsed || parsed[MOCK_PROGRESS_MARKER] !== true || parsed.v !== 1) return null;
    if (!Array.isArray(parsed.questions) || typeof parsed.current_question_index !== "number") {
      return null;
    }
    return {
      [MOCK_PROGRESS_MARKER]: true,
      v: 1,
      current_question_index: Math.max(0, parsed.current_question_index),
      elapsed_seconds: Math.max(0, Number(parsed.elapsed_seconds) || 0),
      target_question_count: Math.max(1, Number(parsed.target_question_count) || parsed.questions.length || 5),
      started_at:
        typeof parsed.started_at === "string" && parsed.started_at
          ? parsed.started_at
          : new Date().toISOString(),
      questions: parsed.questions as SessionQuestion[],
      answers: Array.isArray(parsed.answers) ? (parsed.answers as MockProgressAnswer[]) : [],
    };
  } catch {
    return null;
  }
}

export function isSkippedAnswerText(answer: string | null | undefined): boolean {
  const t = (answer ?? "").trim();
  return t.length === 0 || t === SKIPPED_ANSWER_SENTINEL;
}
