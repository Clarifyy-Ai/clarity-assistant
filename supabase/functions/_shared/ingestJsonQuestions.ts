/** Mirrors src/lib/gov-exam/ingestJsonQuestions.ts for Deno edge. */
import { validateSingleCorrectMcq } from "./govMcqValidator.ts";

export type IngestQuestionNormalized = {
  question_text: string;
  options: string[];
  correct_index: number;
  correct_letter: string;
  explanation?: string;
  subject: string;
  topic: string;
  difficulty: "EASY" | "MEDIUM" | "HARD";
  section_code?: string;
  page_ref?: string;
};

const LETTERS = ["A", "B", "C", "D", "E", "F"] as const;

function resolveCorrectIndex(q: Record<string, unknown>): number | null {
  if (Number.isInteger(q.correct_index)) return q.correct_index as number;
  const letter = String(q.correct_answer ?? "").trim().toUpperCase();
  const idx = LETTERS.indexOf(letter as (typeof LETTERS)[number]);
  return idx >= 0 ? idx : null;
}

function normalizeDifficulty(raw: unknown): "EASY" | "MEDIUM" | "HARD" {
  const d = String(raw ?? "MEDIUM").toUpperCase();
  if (d === "EASY" || d === "HARD") return d;
  return "MEDIUM";
}

export function validateIngestQuestionsPayload(
  raw: unknown,
  opts?: { maxQuestions?: number; requireAllValid?: boolean },
):
  | {
    ok: true;
    questions: IngestQuestionNormalized[];
    rejected: Array<{ index: number; code: string; message: string }>;
  }
  | {
    ok: false;
    code: string;
    message: string;
    rejected: Array<{ index: number; code: string; message: string }>;
  } {
  const maxQuestions = opts?.maxQuestions ?? 200;
  const requireAllValid = opts?.requireAllValid ?? false;

  if (!Array.isArray(raw)) {
    return {
      ok: false,
      code: "INVALID_PAYLOAD",
      message: "questions must be an array.",
      rejected: [],
    };
  }
  if (raw.length === 0) {
    return {
      ok: false,
      code: "EMPTY_QUESTIONS",
      message: "questions array is empty.",
      rejected: [],
    };
  }
  if (raw.length > maxQuestions) {
    return {
      ok: false,
      code: "TOO_MANY_QUESTIONS",
      message: `At most ${maxQuestions} questions per ingest job.`,
      rejected: [],
    };
  }

  const accepted: IngestQuestionNormalized[] = [];
  const rejected: Array<{ index: number; code: string; message: string }> = [];

  raw.forEach((item, index) => {
    if (!item || typeof item !== "object") {
      rejected.push({
        index,
        code: "QUESTION_VALIDATION_FAILED",
        message: "Item is not an object.",
      });
      return;
    }
    const q = item as Record<string, unknown>;
    const options = Array.isArray(q.options)
      ? q.options.map((o) => String(o ?? "").trim())
      : [];
    const correct_index = resolveCorrectIndex(q);
    if (correct_index === null) {
      rejected.push({
        index,
        code: "ANSWER_VERIFICATION_FAILED",
        message: "Provide correct_index (0-based) or correct_answer A–F.",
      });
      return;
    }

    const candidate = {
      question_text: String(q.question_text ?? ""),
      options,
      correct_index,
    };
    const v = validateSingleCorrectMcq(candidate);
    if (!v.ok) {
      rejected.push({ index, code: v.code, message: v.message });
      return;
    }

    const letter = LETTERS[correct_index];
    if (!letter) {
      rejected.push({
        index,
        code: "ANSWER_VERIFICATION_FAILED",
        message: "correct_index out of supported letter range.",
      });
      return;
    }

    accepted.push({
      question_text: candidate.question_text.trim().slice(0, 4000),
      options,
      correct_index,
      correct_letter: letter,
      explanation: q.explanation
        ? String(q.explanation).slice(0, 4000)
        : undefined,
      subject: String(q.subject ?? "General").slice(0, 120) || "General",
      topic: String(q.topic ?? "PYQ").slice(0, 120) || "PYQ",
      difficulty: normalizeDifficulty(q.difficulty),
      section_code: q.section_code
        ? String(q.section_code).slice(0, 64)
        : undefined,
      page_ref: q.page_ref ? String(q.page_ref).slice(0, 64) : undefined,
    });
  });

  if (accepted.length === 0) {
    return {
      ok: false,
      code: "NO_VALID_QUESTIONS",
      message: "No questions passed MCQ validation.",
      rejected,
    };
  }

  if (requireAllValid && rejected.length > 0) {
    return {
      ok: false,
      code: "PARTIAL_VALIDATION_FAILED",
      message: `${rejected.length} of ${raw.length} questions failed validation.`,
      rejected,
    };
  }

  return { ok: true, questions: accepted, rejected };
}
