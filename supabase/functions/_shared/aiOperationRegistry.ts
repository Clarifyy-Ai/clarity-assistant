/**
 * Authoritative AI Operation Registry for hybrid Edge features.
 *
 * Every paid / hybrid AI path must be registered here. Unknown operations
 * fail closed via operationRouter.decideRoute → UNKNOWN_OPERATION (no charge).
 *
 * Keep creditCostKey aligned with creditEconomics.AI_CREDIT_COSTS.
 * promptId / promptVersion should match aiFeaturePolicy entries when present.
 */

import type { AICreditCostKey } from "./creditEconomics.ts";
import type { HybridOperation } from "./operationRouter.ts";

export type AiOperationRegistration = {
  operationId: HybridOperation;
  /** Canonical Edge function that exposes this operation. */
  edgeFunction: string;
  /** Catalog key from AI_CREDIT_COSTS, or null when no charge applies. */
  creditCostKey: AICreditCostKey | null;
  promptId: string;
  promptVersion: string;
  /** Body / context keys the Edge path expects before generation. */
  requiredContextKeys: readonly string[];
  isAiRequired: boolean;
};

/**
 * One registration per HybridOperation in operationRouter MATRIX.
 * Secondary Edge wrappers (e.g. generate-hint for practice_coach_help) share
 * the same operationId; edgeFunction names the primary product entrypoint.
 */
export const AI_OPERATION_REGISTRY: Record<HybridOperation, AiOperationRegistration> = {
  gov_exam_assemble: {
    operationId: "gov_exam_assemble",
    edgeFunction: "create-exam-paper",
    creditCostKey: "create_mock_test",
    promptId: "gov_exam_gap_fill",
    promptVersion: "v3",
    requiredContextKeys: ["exam_type"],
    isAiRequired: false,
  },
  resume_parse: {
    operationId: "resume_parse",
    edgeFunction: "parse-resume",
    creditCostKey: "resume_analysis",
    promptId: "resume_parse",
    promptVersion: "v1",
    requiredContextKeys: ["document_id"],
    isAiRequired: false,
  },
  document_process: {
    operationId: "document_process",
    edgeFunction: "parse-document",
    creditCostKey: "parse_document",
    promptId: "document_process",
    promptVersion: "v1",
    requiredContextKeys: ["document_id"],
    isAiRequired: false,
  },
  star_builder: {
    operationId: "star_builder",
    edgeFunction: "generate-star-answer",
    creditCostKey: "star_builder",
    promptId: "resume_star",
    promptVersion: "v2",
    requiredContextKeys: ["question"],
    isAiRequired: false,
  },
  system_design: {
    operationId: "system_design",
    edgeFunction: "prep-tool",
    creditCostKey: "system_design",
    promptId: "prep_tool",
    promptVersion: "v2",
    requiredContextKeys: ["tool_id", "prompt"],
    isAiRequired: false,
  },
  practice_coach_help: {
    operationId: "practice_coach_help",
    edgeFunction: "ai-coach-chat",
    creditCostKey: "ai_coach_message",
    promptId: "practice_coach_chat",
    promptVersion: "v1",
    requiredContextKeys: ["message"],
    isAiRequired: true,
  },
  live_answer: {
    operationId: "live_answer",
    edgeFunction: "generate-answer",
    creditCostKey: "live_answer",
    promptId: "live_answer",
    promptVersion: "v2",
    requiredContextKeys: ["question"],
    isAiRequired: true,
  },
  company_research: {
    operationId: "company_research",
    edgeFunction: "company-research",
    creditCostKey: "company_research",
    promptId: "company_research",
    promptVersion: "v2",
    requiredContextKeys: ["company"],
    isAiRequired: false,
  },
  mock_question_generation: {
    operationId: "mock_question_generation",
    edgeFunction: "generate-questions",
    creditCostKey: "generate_questions",
    promptId: "mock_questions",
    promptVersion: "v2",
    requiredContextKeys: ["role"],
    isAiRequired: false,
  },
  sprint_review_transcript: {
    operationId: "sprint_review_transcript",
    edgeFunction: "process-sprint-transcript",
    creditCostKey: null,
    promptId: "sprint_transcript_summary",
    promptVersion: "v2",
    requiredContextKeys: ["transcript"],
    isAiRequired: false,
  },
  gap_analysis: {
    operationId: "gap_analysis",
    edgeFunction: "gap-analysis",
    creditCostKey: "gap_analysis",
    promptId: "resume_gap_analysis",
    promptVersion: "v2",
    requiredContextKeys: ["resume_text", "job_description"],
    isAiRequired: false,
  },
  session_debrief: {
    operationId: "session_debrief",
    edgeFunction: "generate-debrief",
    creditCostKey: "session_debrief",
    promptId: "session_debrief",
    promptVersion: "v2",
    requiredContextKeys: ["session_id"],
    isAiRequired: true,
  },
  session_scorecard: {
    operationId: "session_scorecard",
    edgeFunction: "generate-scorecard",
    creditCostKey: "generate_scorecard",
    promptId: "session_scorecard",
    promptVersion: "v2",
    requiredContextKeys: ["session_id"],
    isAiRequired: false,
  },
  analyze_test: {
    operationId: "analyze_test",
    edgeFunction: "analyze-test-performance",
    creditCostKey: "analyze_test_performance",
    promptId: "test_analysis",
    promptVersion: "v2",
    requiredContextKeys: ["test_id"],
    isAiRequired: false,
  },
  prep_rephrase: {
    operationId: "prep_rephrase",
    edgeFunction: "prep-tool",
    creditCostKey: "rephraser",
    promptId: "prep_tool",
    promptVersion: "v2",
    requiredContextKeys: ["tool_id", "prompt"],
    isAiRequired: false,
  },
  prep_coding: {
    operationId: "prep_coding",
    edgeFunction: "prep-tool",
    creditCostKey: "coding_hint",
    promptId: "prep_tool",
    promptVersion: "v2",
    requiredContextKeys: ["tool_id", "prompt"],
    isAiRequired: false,
  },
  prep_project: {
    operationId: "prep_project",
    edgeFunction: "prep-tool",
    creditCostKey: "project_builder",
    promptId: "prep_tool",
    promptVersion: "v2",
    requiredContextKeys: ["tool_id", "prompt"],
    isAiRequired: false,
  },
  prep_raw_prompt: {
    operationId: "prep_raw_prompt",
    edgeFunction: "prep-tool",
    creditCostKey: "rephraser",
    promptId: "prep_tool",
    promptVersion: "v2",
    requiredContextKeys: ["tool_id", "prompt"],
    isAiRequired: false,
  },
};

export function getAiOperation(operationId: string): AiOperationRegistration | null {
  const key = String(operationId ?? "").trim();
  if (!key || !Object.prototype.hasOwnProperty.call(AI_OPERATION_REGISTRY, key)) {
    return null;
  }
  return AI_OPERATION_REGISTRY[key as HybridOperation];
}

export function listRegisteredAiOperations(): HybridOperation[] {
  return Object.keys(AI_OPERATION_REGISTRY) as HybridOperation[];
}

export function requireAiOperation(operationId: string): AiOperationRegistration {
  const reg = getAiOperation(operationId);
  if (!reg) {
    throw new Error(`UNKNOWN_OPERATION:${operationId || "(empty)"}`);
  }
  return reg;
}
