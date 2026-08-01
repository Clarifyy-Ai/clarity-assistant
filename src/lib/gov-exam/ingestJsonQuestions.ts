/**
 * Structured JSON question import validation for admin ingest-source-document.
 * Validates with the same MCQ rules as the paper engine; does not scrape or fetch.
 */

import { validateSingleCorrectMcq, type McqCandidate } from "./mcqValidator";

export type IngestQuestionInput = {
  question_text: string;
  options: string[];
  /** 0-based index preferred; alternatively correct_answer A|B|C|D */
  correct_index?: number;
  correct_answer?: string;
  explanation?: string;
  subject?: string;
  topic?: string;
  difficulty?: string;
  section_code?: string;
  page_ref?: string;
};

export type IngestQuestionNormalized = McqCandidate & {
  correct_letter: "A" | "B" | "C" | "D" | "E" | "F";
  subject: string;
  topic: string;
  difficulty: "EASY" | "MEDIUM" | "HARD";
  section_code?: string;
  page_ref?: string;
};

export type IngestValidationResult =
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
    };

const LETTERS = ["A", "B", "C", "D", "E", "F"] as const;

function resolveCorrectIndex(q: IngestQuestionInput): number | null {
  if (Number.isInteger(q.correct_index)) {
    return q.correct_index as number;
  }
  const letter = String(q.correct_answer ?? "")
    .trim()
    .toUpperCase();
  const idx = LETTERS.indexOf(letter as (typeof LETTERS)[number]);
  return idx >= 0 ? idx : null;
}

function normalizeDifficulty(raw: unknown): "EASY" | "MEDIUM" | "HARD" {
  const d = String(raw ?? "MEDIUM").toUpperCase();
  if (d === "EASY" || d === "HARD") return d;
  return "MEDIUM";
}

/**
 * Validate an admin-supplied questions array for ingest.
 * Rejects empty batches; collects per-item failures; requires ≥1 valid question when ok.
 */
export function validateIngestQuestionsPayload(
  raw: unknown,
  opts?: { maxQuestions?: number; requireAllValid?: boolean },
): IngestValidationResult {
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
    const q = item as IngestQuestionInput;
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

    const candidate: McqCandidate = {
      question_text: String(q.question_text ?? ""),
      options,
      correct_index,
      explanation: q.explanation ? String(q.explanation) : undefined,
    };
    const v = validateSingleCorrectMcq(candidate);
    if (v.ok === false) {
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
      ...candidate,
      correct_letter: letter,
      subject: String(q.subject ?? "General").slice(0, 120) || "General",
      topic: String(q.topic ?? "PYQ").slice(0, 120) || "PYQ",
      difficulty: normalizeDifficulty(q.difficulty),
      section_code: q.section_code ? String(q.section_code).slice(0, 64) : undefined,
      page_ref: q.page_ref ? String(q.page_ref).slice(0, 64) : undefined,
      explanation: candidate.explanation?.slice(0, 4000),
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
