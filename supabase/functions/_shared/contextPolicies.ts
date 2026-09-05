/**
 * Per-operation context policies — required/optional keys, freeze rules, truncation.
 * Keep aligned with src/lib/ai/contextPolicies.ts (client mirror).
 */

import type { HybridOperation } from "./operationRouter.ts";

export type CoachEdgeOperation =
  | "generate_hint"
  | "generate_answer"
  | "screenshot_answer"
  | "ai_coach_chat";

export type OperationKey = HybridOperation | CoachEdgeOperation;

export type ContextPolicy = {
  operation: OperationKey;
  requiredKeys: readonly string[];
  optionalKeys: readonly string[];
  /** Session freeze mandatory before generation. */
  requireSessionFreeze: boolean;
  /** Question classification affects prompt template selection. */
  useQuestionClassification: boolean;
  resumeMaxChars: number;
  jdMaxChars: number;
  transcriptMaxChars: number;
};

const DEFAULT_POLICY: Omit<ContextPolicy, "operation"> = {
  requiredKeys: [],
  optionalKeys: [],
  requireSessionFreeze: false,
  useQuestionClassification: false,
  resumeMaxChars: 40_000,
  jdMaxChars: 8_000,
  transcriptMaxChars: 2_500,
};

export const CONTEXT_POLICIES: Record<OperationKey, ContextPolicy> = {
  generate_hint: {
    ...DEFAULT_POLICY,
    operation: "generate_hint",
    requiredKeys: ["question"],
    optionalKeys: [
      "resume_context",
      "transcript",
      "interview_type",
      "target_company",
      "role",
      "experience_level",
      "preference_context",
      "skills_not_to_claim",
      "hint_style",
      "coach_tone",
      "answer_mode",
      "question_class",
      "context_hash",
    ],
    requireSessionFreeze: true,
    useQuestionClassification: true,
  },
  generate_answer: {
    ...DEFAULT_POLICY,
    operation: "generate_answer",
    requiredKeys: ["question"],
    optionalKeys: [
      "resume_context",
      "transcript",
      "interview_type",
      "target_company",
      "role",
      "experience_level",
      "preference_context",
      "skills_not_to_claim",
      "hint_style",
      "coach_tone",
      "question_class",
      "context_hash",
    ],
    requireSessionFreeze: true,
    useQuestionClassification: true,
  },
  screenshot_answer: {
    ...DEFAULT_POLICY,
    operation: "screenshot_answer",
    requiredKeys: ["question"],
    optionalKeys: ["screenshot_base64", "resume_context", "interview_type", "question_class"],
    useQuestionClassification: true,
  },
  ai_coach_chat: {
    ...DEFAULT_POLICY,
    operation: "ai_coach_chat",
    requiredKeys: ["message"],
    optionalKeys: [
      "resume_context",
      "job_description",
      "transcript",
      "interview_type",
      "target_company",
      "role",
      "experience_level",
      "session_history",
      "question_class",
    ],
    requireSessionFreeze: true,
    useQuestionClassification: true,
    transcriptMaxChars: 6_000,
  },
  practice_coach_help: {
    ...DEFAULT_POLICY,
    operation: "practice_coach_help",
    requiredKeys: ["message"],
    optionalKeys: ["resume_context", "job_description", "transcript", "session_history"],
    requireSessionFreeze: true,
    useQuestionClassification: true,
  },
  live_answer: {
    ...DEFAULT_POLICY,
    operation: "live_answer",
    requiredKeys: ["question"],
    optionalKeys: ["resume_context", "transcript", "interview_type", "target_company", "question_class"],
    requireSessionFreeze: true,
    useQuestionClassification: true,
  },
  mock_question_generation: {
    ...DEFAULT_POLICY,
    operation: "mock_question_generation",
    requiredKeys: ["role"],
    optionalKeys: [
      "resume_context",
      "job_description",
      "company",
      "interview_type",
      "experience_level",
      "previous_answers",
      "follow_up_depth",
      "is_follow_up",
      "topics_to_avoid",
      "seniority",
      "industry",
    ],
  },
  star_builder: {
    ...DEFAULT_POLICY,
    operation: "star_builder",
    requiredKeys: ["question"],
    optionalKeys: ["resume_context", "role", "experience_level"],
  },
  prep_rephrase: {
    ...DEFAULT_POLICY,
    operation: "prep_rephrase",
    requiredKeys: ["tool_id", "prompt"],
    optionalKeys: ["context", "role", "experience_level"],
  },
  prep_coding: {
    ...DEFAULT_POLICY,
    operation: "prep_coding",
    requiredKeys: ["tool_id", "prompt"],
    optionalKeys: ["context", "role", "language", "experience_level"],
  },
  prep_project: {
    ...DEFAULT_POLICY,
    operation: "prep_project",
    requiredKeys: ["tool_id", "prompt"],
    optionalKeys: ["context", "role", "experience_level"],
  },
  prep_raw_prompt: {
    ...DEFAULT_POLICY,
    operation: "prep_raw_prompt",
    requiredKeys: ["tool_id", "prompt"],
    optionalKeys: ["context"],
  },
  system_design: {
    ...DEFAULT_POLICY,
    operation: "system_design",
    requiredKeys: ["tool_id", "prompt"],
    optionalKeys: ["context", "role", "experience_level"],
  },
  gov_exam_assemble: {
    ...DEFAULT_POLICY,
    operation: "gov_exam_assemble",
    requiredKeys: ["exam_type"],
    optionalKeys: ["subject", "stage", "language", "difficulty", "source_mode"],
  },
  resume_parse: {
    ...DEFAULT_POLICY,
    operation: "resume_parse",
    requiredKeys: ["document_id"],
    optionalKeys: [],
  },
  document_process: {
    ...DEFAULT_POLICY,
    operation: "document_process",
    requiredKeys: ["document_id"],
    optionalKeys: [],
  },
  company_research: {
    ...DEFAULT_POLICY,
    operation: "company_research",
    requiredKeys: ["company"],
    optionalKeys: ["role"],
  },
  gap_analysis: {
    ...DEFAULT_POLICY,
    operation: "gap_analysis",
    requiredKeys: ["resume_text", "job_description"],
    optionalKeys: [],
  },
  session_debrief: {
    ...DEFAULT_POLICY,
    operation: "session_debrief",
    requiredKeys: ["session_id"],
    optionalKeys: ["transcript", "qa_pairs", "metrics"],
  },
  session_scorecard: {
    ...DEFAULT_POLICY,
    operation: "session_scorecard",
    requiredKeys: ["session_id"],
    optionalKeys: ["qa_pairs", "metrics"],
  },
  analyze_test: {
    ...DEFAULT_POLICY,
    operation: "analyze_test",
    requiredKeys: ["test_id"],
    optionalKeys: [],
  },
  sprint_review_transcript: {
    ...DEFAULT_POLICY,
    operation: "sprint_review_transcript",
    requiredKeys: ["transcript"],
    optionalKeys: [],
  },
};

export function getContextPolicy(operation: string): ContextPolicy | null {
  const key = String(operation ?? "").trim();
  if (!key || !Object.prototype.hasOwnProperty.call(CONTEXT_POLICIES, key)) {
    return null;
  }
  return CONTEXT_POLICIES[key as OperationKey];
}
