import type { SessionQuestion, InterviewType } from "@/types/session.types";
import { isDuplicateQuestion } from "@/lib/mock/questionDuplicate";

export type QuestionValidationResult =
  | { ok: true; question: SessionQuestion }
  | { ok: false; reason: string };

function asText(value: unknown): string {
  if (typeof value === "string") return value.trim();
  if (value && typeof value === "object" && "question_text" in value) {
    return String((value as { question_text?: unknown }).question_text ?? "").trim();
  }
  if (value && typeof value === "object" && "question" in value) {
    return String((value as { question?: unknown }).question ?? "").trim();
  }
  return "";
}

export function normalizeQuestionText(raw: unknown): string {
  return asText(raw)
    .replace(/\s+/g, " ")
    .replace(/[\u0000-\u001F\u007F]/g, "")
    .trim();
}

export function isDuplicateQuestionText(
  text: string,
  used: ReadonlyArray<string>,
): boolean {
  const key = normalizeQuestionText(text).toLowerCase();
  if (!key) return true;
  return used.some((u) => normalizeQuestionText(u).toLowerCase() === key);
}

function normalizeInterviewType(raw: unknown): InterviewType {
  const t = String(raw ?? "behavioural").toLowerCase().replace(/\s+/g, "_");
  if (t === "behavioral" || t === "behavioural") return "behavioural";
  if (t === "technical") return "technical";
  if (t === "system_design" || t === "system-design") return "system_design";
  if (t === "hr") return "hr";
  if (t === "mixed") return "mixed";
  return "behavioural";
}

/**
 * Validate a provider/fallback question before committing it to the UI.
 */
export function validateGeneratedQuestion(
  raw: unknown,
  options: {
    sessionId: string;
    questionNumber: number;
    usedTexts: ReadonlyArray<string>;
  },
): QuestionValidationResult {
  if (raw == null || typeof raw !== "object") {
    return { ok: false, reason: "Response is not a question object." };
  }

  const record = raw as Record<string, unknown>;
  const text = normalizeQuestionText(
    record.question_text ?? record.question ?? record.text,
  );

  if (!text || text.length < 8) {
    return { ok: false, reason: "Question text is empty or too short." };
  }

  if (isDuplicateQuestionText(text, options.usedTexts)) {
    return { ok: false, reason: "Question was already used in this session." };
  }

  const semantic = isDuplicateQuestion(text, [...options.usedTexts]);
  if (semantic.duplicate) {
    return {
      ok: false,
      reason:
        semantic.reason === "semantic"
          ? "Question is too similar to one already asked."
          : "Question was already used in this session.",
    };
  }

  const claimedSession =
    typeof record.session_id === "string" ? record.session_id : null;
  if (claimedSession && claimedSession !== options.sessionId) {
    return { ok: false, reason: "Question does not belong to this session." };
  }

  const difficultyRaw = String(record.difficulty ?? "medium").toLowerCase();
  const difficulty =
    difficultyRaw === "easy" || difficultyRaw === "hard" ? difficultyRaw : "medium";

  const question: SessionQuestion = {
    id:
      typeof record.id === "string" && record.id.trim()
        ? record.id.trim()
        : crypto.randomUUID(),
    session_id: options.sessionId,
    question_number: options.questionNumber,
    question_text: text,
    question_type: normalizeInterviewType(record.question_type ?? record.type),
    expected_duration_seconds:
      typeof record.expected_duration_seconds === "number"
        ? record.expected_duration_seconds
        : 120,
    difficulty,
    tags: Array.isArray(record.tags)
      ? record.tags.filter((t): t is string => typeof t === "string").slice(0, 10)
      : [],
    company_specific: Boolean(record.company_specific),
  };

  return { ok: true, question };
}

export function validateGeneratedQuestionsPayload(
  payload: unknown,
): { ok: true; questions: unknown[] } | { ok: false; reason: string } {
  if (!payload || typeof payload !== "object") {
    return { ok: false, reason: "Invalid generation response." };
  }
  const root = payload as Record<string, unknown>;
  const nested =
    root.data && typeof root.data === "object"
      ? (root.data as Record<string, unknown>).questions
      : undefined;
  const list = Array.isArray(root.questions)
    ? root.questions
    : Array.isArray(nested)
      ? nested
      : null;
  if (!list) {
    return { ok: false, reason: "Generation response missing questions array." };
  }
  return { ok: true, questions: list };
}
