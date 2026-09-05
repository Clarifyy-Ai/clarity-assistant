/**
 * Client mirror of supabase/functions/_shared/contextPolicies.ts
 */

export type CoachEdgeOperation =
  | "generate_hint"
  | "generate_answer"
  | "screenshot_answer"
  | "ai_coach_chat";

export type HybridOperationKey =
  | "gov_exam_assemble"
  | "resume_parse"
  | "document_process"
  | "star_builder"
  | "system_design"
  | "practice_coach_help"
  | "live_answer"
  | "company_research"
  | "mock_question_generation"
  | "sprint_review_transcript"
  | "gap_analysis"
  | "session_debrief"
  | "session_scorecard"
  | "analyze_test"
  | "prep_rephrase"
  | "prep_coding"
  | "prep_project"
  | "prep_raw_prompt";

export type OperationKey = HybridOperationKey | CoachEdgeOperation;

export type ContextPolicy = {
  operation: OperationKey;
  requiredKeys: readonly string[];
  optionalKeys: readonly string[];
  requireSessionFreeze: boolean;
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

/** Subset exported for client-side validation — full registry lives on Edge. */
export const CLIENT_CONTEXT_POLICIES: Partial<Record<OperationKey, ContextPolicy>> = {
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
      "topics_to_avoid",
      "seniority",
      "industry",
    ],
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
  star_builder: {
    ...DEFAULT_POLICY,
    operation: "star_builder",
    requiredKeys: ["question"],
    optionalKeys: ["resume_context", "role", "experience_level"],
  },
};

export function getClientContextPolicy(operation: string): ContextPolicy | null {
  const key = String(operation ?? "").trim() as OperationKey;
  return CLIENT_CONTEXT_POLICIES[key] ?? null;
}
