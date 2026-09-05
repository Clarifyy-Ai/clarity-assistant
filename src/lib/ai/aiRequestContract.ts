/**
 * Client mirror of supabase/functions/_shared/aiRequestContract.ts
 */

import { classifyCoachQuestion, type CoachQuestionClass } from "./coachQuestionClassify";
import { practiceCoachStylePayload } from "./practiceCoachContract";
import { getClientContextPolicy, type OperationKey } from "./contextPolicies";

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

export type BuildFeatureContextResult = {
  operation: OperationKey;
  payload: Record<string, unknown>;
  question_class: CoachQuestionClass;
  context_hash?: string;
};

export class ContextValidationError extends Error {
  readonly code: ContextValidationCode;
  readonly operation: string;
  readonly key?: string;

  constructor(code: ContextValidationCode, operation: string, key?: string) {
    super(`Missing required context: ${key ?? code}`);
    this.name = "ContextValidationError";
    this.code = code;
    this.operation = operation;
    this.key = key;
  }
}

export function assertClientContextForOperation(
  operation: string,
  payload: Record<string, unknown>,
): void {
  const policy = getClientContextPolicy(operation);
  if (!policy) return;

  for (const key of policy.requiredKeys) {
    const value = payload[key];
    if (value == null || (typeof value === "string" && !value.trim())) {
      const code: ContextValidationCode =
        key === "question" || key === "message"
          ? "NO_QUESTION"
          : key === "resume_context" || key === "resume_text"
            ? "NO_RESUME"
            : "NO_CONTEXT";
      throw new ContextValidationError(code, operation, key);
    }
  }
}

/** Build normalized Edge payload with classification and style fields. */
export function normalizeCoachPayload(
  operation: OperationKey,
  payload: Record<string, unknown>,
): Record<string, unknown> {
  assertClientContextForOperation(operation, payload);

  const questionText = String(
    payload.question ?? payload.message ?? payload.latest_interviewer_question ?? "",
  ).trim();
  const interviewType = String(payload.interview_type ?? payload.session_type ?? "behavioral");

  const question_class = payload.question_class
    ? String(payload.question_class)
    : questionText
      ? classifyCoachQuestion(questionText, interviewType)
      : "mixed";

  const styleFields = practiceCoachStylePayload({
    hintStyle: payload.hint_style,
    coachTone: payload.coach_tone,
    answerMode: payload.answer_mode,
  });

  return {
    ...payload,
    question_class,
    ...styleFields,
    role: payload.role ?? payload.target_role ?? "",
    experience_level: payload.experience_level ?? payload.seniority ?? "",
    skills_not_to_claim: Array.isArray(payload.skills_not_to_claim)
      ? payload.skills_not_to_claim
      : [],
  };
}

export type { OperationKey };
