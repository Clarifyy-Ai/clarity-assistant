/** Shared helpers for Interview Practice Workspace answer + draft state. */

export const MIN_ANSWER_LENGTH = 10;
export const MAX_ANSWER_LENGTH = 5000;

export type PracticeAnswerStatus =
  | "unanswered"
  | "skipped"
  | "draft"
  | "answered"
  | "invalid";

export function safeTrim(value: unknown): string {
  if (typeof value !== "string") return "";
  return value.trim();
}

export function normalizeAnswerText(value: unknown): string {
  if (typeof value !== "string") return "";
  return value.slice(0, MAX_ANSWER_LENGTH);
}

export function deriveAnswerStatus(
  answer: unknown,
  skipped: boolean,
): PracticeAnswerStatus {
  if (skipped) return "skipped";
  const text = safeTrim(answer);
  if (!text) return "unanswered";
  if (text.length < MIN_ANSWER_LENGTH) return "invalid";
  if (text.length >= MIN_ANSWER_LENGTH) return "answered";
  return "draft";
}

export function initAnswerSlots(count: number): {
  answers: string[];
  skipped: boolean[];
  statuses: PracticeAnswerStatus[];
} {
  const n = Math.max(0, count);
  return {
    answers: Array.from({ length: n }, () => ""),
    skipped: Array.from({ length: n }, () => false),
    statuses: Array.from({ length: n }, () => "unanswered" as const),
  };
}

export type PackedPracticeAnswer = {
  question: string;
  answer: string;
  status: "skipped" | "answered" | "unanswered" | "invalid";
};

export function packPracticeAnswers(
  questions: Array<{ question: string }>,
  answers: string[],
  skipped: boolean[],
): PackedPracticeAnswer[] {
  return questions.map((q, i) => {
    const status = deriveAnswerStatus(answers[i], Boolean(skipped[i]));
    return {
      question: q.question,
      answer: normalizeAnswerText(answers[i] ?? ""),
      status:
        status === "draft"
          ? "unanswered"
          : status === "answered"
            ? "answered"
            : status === "skipped"
              ? "skipped"
              : status === "invalid"
                ? "invalid"
                : "unanswered",
    };
  });
}

export function findInvalidAnswerIndex(
  answers: string[],
  skipped: boolean[],
): number {
  return answers.findIndex((answer, i) => {
    if (skipped[i]) return false;
    const text = safeTrim(answer);
    return text.length > 0 && text.length < MIN_ANSWER_LENGTH;
  });
}

export function countAnswerStates(
  questionsLength: number,
  answers: string[],
  skipped: boolean[],
): { answered: number; skipped: number; unanswered: number; invalid: number } {
  let answered = 0;
  let skippedCount = 0;
  let unanswered = 0;
  let invalid = 0;
  for (let i = 0; i < questionsLength; i++) {
    const status = deriveAnswerStatus(answers[i], Boolean(skipped[i]));
    if (status === "answered") answered += 1;
    else if (status === "skipped") skippedCount += 1;
    else if (status === "invalid") invalid += 1;
    else unanswered += 1;
  }
  return { answered, skipped: skippedCount, unanswered, invalid };
}

export type PracticeDraftPayload = {
  version: number;
  currentIndex: number;
  role: string;
  difficulty: string;
  interviewType: string;
  seconds: number;
  notes: string;
  questions: Array<{ id?: string; question: string; topic?: string }>;
  answers: string[];
  skipped: boolean[];
  questionSource: string;
  startedAt: string;
  expiresAt: string;
};

export const PRACTICE_DRAFT_TTL_MS = 4 * 60 * 60 * 1000;

export function buildDraftExpiresAt(from = Date.now()): string {
  return new Date(from + PRACTICE_DRAFT_TTL_MS).toISOString();
}

export function isDraftExpired(expiresAt: string | null | undefined): boolean {
  if (!expiresAt) return false;
  const t = Date.parse(expiresAt);
  return Number.isFinite(t) && t <= Date.now();
}
