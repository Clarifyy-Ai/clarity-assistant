/**
 * Canonical AI request contract — shared field groups for Edge validation.
 * Keep aligned with src/lib/ai/aiRequestContract.ts (client mirror).
 */

import { DomainError } from "./domainErrors.ts";
import { getContextPolicy, type OperationKey } from "./contextPolicies.ts";
import {
  sanitizeAnswerMode,
  sanitizeCoachTone,
  sanitizeHintStyle,
  type PracticeCoachRequestFields,
} from "./practiceCoachContract.ts";
import {
  classifyCoachQuestion,
  sanitizeQuestionClass,
  type CoachQuestionClass,
} from "./coachQuestionClassify.ts";

export type ContextValidationCode =
  | "NO_CONTEXT"
  | "NO_QUESTION"
  | "NO_RESUME"
  | "NO_DATA"
  | "UNKNOWN_OPERATION";

export type ProfileContext = {
  role?: string;
  experience_level?: string;
  target_company?: string;
  industry?: string;
  seniority?: string;
};

export type QuestionContext = {
  text: string;
  question_class?: CoachQuestionClass;
  source?: string;
};

export type NormalizedAIRequest = {
  operation: OperationKey;
  userId: string;
  sessionId?: string;
  question?: QuestionContext;
  profile?: ProfileContext;
  resume_context?: string;
  job_description?: string;
  transcript?: string;
  preferences?: PracticeCoachRequestFields;
  question_class?: CoachQuestionClass;
  context_hash?: string;
  /** Raw payload passthrough for Edge-specific fields. */
  raw?: Record<string, unknown>;
};

function hasNonEmptyString(value: unknown): boolean {
  return typeof value === "string" && value.trim().length > 0;
}

function pickString(payload: Record<string, unknown>, keys: string[]): string | undefined {
  for (const key of keys) {
    const v = payload[key];
    if (hasNonEmptyString(v)) return String(v).trim();
  }
  return undefined;
}

/**
 * Validate payload against operation context policy before credit deduct.
 * Throws DomainError with INVALID_REQUEST and structured cause code.
 */
export function assertContextForOperation(
  operation: string,
  payload: Record<string, unknown>,
): void {
  const policy = getContextPolicy(operation);
  if (!policy) {
    throw new DomainError("UNKNOWN_OPERATION", `Unknown AI operation: ${operation}`);
  }

  for (const key of policy.requiredKeys) {
    const value = payload[key];
    if (value == null || (typeof value === "string" && !value.trim())) {
      const code: ContextValidationCode =
        key === "question" || key === "message"
          ? "NO_QUESTION"
          : key === "resume_context" || key === "resume_text" || key === "document_id"
            ? "NO_RESUME"
            : key === "session_id" || key === "test_id"
              ? "NO_DATA"
              : "NO_CONTEXT";
      throw new DomainError("INVALID_REQUEST", `Missing required context: ${key}`, {
        cause: { code, operation, key },
      });
    }
  }
}

/** Normalize coach/hint/answer payloads with classification and style sanitization. */
export function normalizeCoachPayload(
  operation: OperationKey,
  payload: Record<string, unknown>,
): Record<string, unknown> {
  assertContextForOperation(operation, payload);

  const questionText =
    pickString(payload, ["question", "message", "latest_interviewer_question"]) ?? "";
  const interviewType = pickString(payload, ["interview_type", "session_type"]) ?? "behavioral";

  const question_class = payload.question_class
    ? sanitizeQuestionClass(payload.question_class)
    : questionText
      ? classifyCoachQuestion(questionText, interviewType)
      : "mixed";

  const hint_style = sanitizeHintStyle(payload.hint_style);
  const coach_tone = sanitizeCoachTone(payload.coach_tone);
  const answer_mode = sanitizeAnswerMode(payload.answer_mode);

  const role = pickString(payload, ["role", "target_role"]);
  const experience_level = pickString(payload, ["experience_level", "seniority"]);

  return {
    ...payload,
    question_class,
    hint_style,
    coach_tone,
    answer_mode,
    ...(role ? { role } : {}),
    ...(experience_level ? { experience_level } : {}),
    skills_not_to_claim: Array.isArray(payload.skills_not_to_claim)
      ? payload.skills_not_to_claim.filter((s): s is string => typeof s === "string")
      : [],
  };
}

export function contextValidationCodeFromError(err: unknown): ContextValidationCode | null {
  if (!(err instanceof DomainError) || err.code !== "INVALID_REQUEST") return null;
  const cause = err.cause as { code?: ContextValidationCode } | undefined;
  return cause?.code ?? null;
}
