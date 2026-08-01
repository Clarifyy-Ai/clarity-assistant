/**
 * Deterministic MCQ validation (single-correct).
 * Similarity helpers live in validators/similarity — re-exported for compat.
 */

export interface McqCandidate {
  question_text: string;
  options: string[];
  correct_index: number; // 0-based
  explanation?: string;
}

export function validateSingleCorrectMcq(
  q: McqCandidate,
): { ok: true } | { ok: false; code: string; message: string } {
  const text = q.question_text?.trim() ?? "";
  if (text.length < 8) {
    return { ok: false, code: "QUESTION_VALIDATION_FAILED", message: "Question text too short." };
  }
  if (!Array.isArray(q.options) || q.options.length < 2) {
    return { ok: false, code: "QUESTION_VALIDATION_FAILED", message: "Need at least 2 options." };
  }
  if (q.options.some((o) => !String(o ?? "").trim())) {
    return { ok: false, code: "QUESTION_VALIDATION_FAILED", message: "Empty option." };
  }
  const normalized = q.options.map((o) => o.trim().toLowerCase());
  if (new Set(normalized).size !== normalized.length) {
    return { ok: false, code: "QUESTION_VALIDATION_FAILED", message: "Duplicate options." };
  }
  if (
    !Number.isInteger(q.correct_index) ||
    q.correct_index < 0 ||
    q.correct_index >= q.options.length
  ) {
    return {
      ok: false,
      code: "ANSWER_VERIFICATION_FAILED",
      message: "correct_index out of range.",
    };
  }
  return { ok: true };
}

export {
  normalizeQuestionText,
  questionFingerprint,
  isNearDuplicate,
  tokenJaccard,
  ngramJaccard,
  similarityBreakdown,
  findNearDuplicatesInSet,
  conflictsWithSelected,
} from "@/lib/gov-exam/validators/similarity";
