/**
 * Capability / routing matrix for hybrid backend operations.
 *
 * Env failure-simulation flags (checked here and by hybridExecute):
 * - HYBRID_FORCE_PYTHON_UNAVAILABLE=1
 * - HYBRID_FORCE_AI_UNAVAILABLE=1
 *
 * PYTHON_SERVICE_URL / DOCUMENT_INTELLIGENCE_AUTH_SECRET are required for
 * live Python calls (see pythonClient.ts) but do not change the matrix itself.
 */

import { isPythonConfigured, isPythonForceUnavailable } from "./pythonClient.ts";

export type HybridRouteSource = "database" | "deterministic" | "python" | "ai";

export type HybridOperation =
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
  | "prep_project";

export type RouteDecision = {
  operation: HybridOperation;
  canCompleteDeterministically: boolean;
  canCompleteWithDatabase: boolean;
  canUsePython: boolean;
  canUseAI: boolean;
  isAiOptional: boolean;
  isAiRequired: boolean;
  preferredOrder: HybridRouteSource[];
  pythonFallbackOnAiFailure: boolean;
  aiFallbackOnPythonFailure: boolean;
  creditCostKey?: string;
  durableJob: boolean;
};

export type DecideRouteInput = {
  operation: HybridOperation | string;
  /** Optional overrides for tests / callers. */
  forcePythonUnavailable?: boolean;
  forceAiUnavailable?: boolean;
};

const MATRIX: Record<HybridOperation, Omit<RouteDecision, "operation" | "canUsePython" | "canUseAI">> = {
  // database bank → python assemble → AI optional fill
  gov_exam_assemble: {
    canCompleteDeterministically: false,
    canCompleteWithDatabase: true,
    isAiOptional: true,
    isAiRequired: false,
    preferredOrder: ["database", "python", "ai"],
    pythonFallbackOnAiFailure: true,
    aiFallbackOnPythonFailure: true,
    creditCostKey: "create_exam_paper",
    durableJob: true,
  },
  // deterministic/python first, AI enrichment optional
  resume_parse: {
    canCompleteDeterministically: true,
    canCompleteWithDatabase: false,
    isAiOptional: true,
    isAiRequired: false,
    preferredOrder: ["deterministic", "python", "ai"],
    pythonFallbackOnAiFailure: true,
    aiFallbackOnPythonFailure: false,
    creditCostKey: "parse_resume",
    durableJob: false,
  },
  // python preferred (durable job), AI optional enrichment
  document_process: {
    canCompleteDeterministically: false,
    canCompleteWithDatabase: false,
    isAiOptional: true,
    isAiRequired: false,
    preferredOrder: ["python", "ai"],
    pythonFallbackOnAiFailure: false,
    aiFallbackOnPythonFailure: true,
    creditCostKey: "parse_document",
    durableJob: true,
  },
  // python structure first (with optional AI polish inside runPython), AI fallback
  star_builder: {
    canCompleteDeterministically: true,
    canCompleteWithDatabase: false,
    isAiOptional: true,
    isAiRequired: false,
    preferredOrder: ["python", "ai", "deterministic"],
    pythonFallbackOnAiFailure: true,
    aiFallbackOnPythonFailure: false,
    creditCostKey: "generate_star_answer",
    durableJob: false,
  },
  // template/python first, AI optional
  system_design: {
    canCompleteDeterministically: true,
    canCompleteWithDatabase: false,
    isAiOptional: true,
    isAiRequired: false,
    preferredOrder: ["deterministic", "python", "ai"],
    pythonFallbackOnAiFailure: true,
    aiFallbackOnPythonFailure: true,
    creditCostKey: "system_design",
    durableJob: false,
  },
  // AI preferred but python deterministic fallback
  practice_coach_help: {
    canCompleteDeterministically: true,
    canCompleteWithDatabase: false,
    isAiOptional: false,
    isAiRequired: true,
    preferredOrder: ["ai", "python", "deterministic"],
    pythonFallbackOnAiFailure: true,
    aiFallbackOnPythonFailure: false,
    creditCostKey: "ai_coach_chat",
    durableJob: false,
  },
  // Live overlay full answers — same coach fallback chain
  live_answer: {
    canCompleteDeterministically: true,
    canCompleteWithDatabase: false,
    isAiOptional: false,
    isAiRequired: true,
    preferredOrder: ["ai", "python", "deterministic"],
    pythonFallbackOnAiFailure: true,
    aiFallbackOnPythonFailure: false,
    creditCostKey: "live_answer",
    durableJob: false,
  },
  // database cache → Python normalize → optional AI enrichment
  company_research: {
    canCompleteDeterministically: true,
    canCompleteWithDatabase: true,
    isAiOptional: true,
    isAiRequired: false,
    preferredOrder: ["database", "python", "ai"],
    pythonFallbackOnAiFailure: true,
    aiFallbackOnPythonFailure: true,
    creditCostKey: "company_research",
    durableJob: false,
  },
  // database bank → AI → python bank
  mock_question_generation: {
    canCompleteDeterministically: false,
    canCompleteWithDatabase: true,
    isAiOptional: true,
    isAiRequired: false,
    preferredOrder: ["database", "ai", "python"],
    pythonFallbackOnAiFailure: true,
    aiFallbackOnPythonFailure: true,
    creditCostKey: "generate_questions",
    durableJob: false,
  },
  // normalize transcript: deterministic → python speech → optional AI summary
  sprint_review_transcript: {
    canCompleteDeterministically: true,
    canCompleteWithDatabase: false,
    isAiOptional: true,
    isAiRequired: false,
    preferredOrder: ["deterministic", "python", "ai"],
    pythonFallbackOnAiFailure: true,
    aiFallbackOnPythonFailure: false,
    creditCostKey: "sprint_review",
    durableJob: false,
  },
  // resume↔JD gap: deterministic overlap → python → optional AI
  gap_analysis: {
    canCompleteDeterministically: true,
    canCompleteWithDatabase: true,
    isAiOptional: true,
    isAiRequired: false,
    preferredOrder: ["deterministic", "python", "ai"],
    pythonFallbackOnAiFailure: true,
    aiFallbackOnPythonFailure: false,
    creditCostKey: "gap_analysis",
    durableJob: false,
  },
  // session debrief from metrics → optional AI polish
  session_debrief: {
    canCompleteDeterministically: true,
    canCompleteWithDatabase: true,
    isAiOptional: true,
    isAiRequired: false,
    preferredOrder: ["deterministic", "python", "ai"],
    pythonFallbackOnAiFailure: true,
    aiFallbackOnPythonFailure: false,
    creditCostKey: "session_debrief",
    durableJob: false,
  },
  // rule-based scorecard → optional AI enrich
  session_scorecard: {
    canCompleteDeterministically: true,
    canCompleteWithDatabase: true,
    isAiOptional: true,
    isAiRequired: false,
    preferredOrder: ["deterministic", "python", "ai"],
    pythonFallbackOnAiFailure: true,
    aiFallbackOnPythonFailure: false,
    creditCostKey: "generate_scorecard",
    durableJob: false,
  },
  // mock-test analytics narrative from aggregates → optional AI
  analyze_test: {
    canCompleteDeterministically: true,
    canCompleteWithDatabase: true,
    isAiOptional: true,
    isAiRequired: false,
    preferredOrder: ["database", "deterministic", "python", "ai"],
    pythonFallbackOnAiFailure: true,
    aiFallbackOnPythonFailure: false,
    creditCostKey: "analyze_test_performance",
    durableJob: false,
  },
  // prep rephrase — AI preferred, deterministic/python when AI down
  prep_rephrase: {
    canCompleteDeterministically: true,
    canCompleteWithDatabase: false,
    isAiOptional: true,
    isAiRequired: false,
    preferredOrder: ["ai", "python", "deterministic"],
    pythonFallbackOnAiFailure: true,
    aiFallbackOnPythonFailure: false,
    creditCostKey: "rephraser",
    durableJob: false,
  },
  prep_coding: {
    canCompleteDeterministically: true,
    canCompleteWithDatabase: false,
    isAiOptional: true,
    isAiRequired: false,
    preferredOrder: ["ai", "python", "deterministic"],
    pythonFallbackOnAiFailure: true,
    aiFallbackOnPythonFailure: false,
    creditCostKey: "coding_hint",
    durableJob: false,
  },
  prep_project: {
    canCompleteDeterministically: true,
    canCompleteWithDatabase: false,
    isAiOptional: true,
    isAiRequired: false,
    preferredOrder: ["ai", "python", "deterministic"],
    pythonFallbackOnAiFailure: true,
    aiFallbackOnPythonFailure: false,
    creditCostKey: "project_builder",
    durableJob: false,
  },
};

export function isAiForceUnavailable(override?: boolean): boolean {
  if (typeof override === "boolean") return override;
  const flag = (Deno.env.get("HYBRID_FORCE_AI_UNAVAILABLE") ?? "").trim();
  return flag === "1" || flag.toLowerCase() === "true";
}

function isKnownOperation(op: string): op is HybridOperation {
  return Object.prototype.hasOwnProperty.call(MATRIX, op);
}

/**
 * Decide preferred execution order and capability flags for an operation.
 * canUsePython / canUseAI reflect live env + force flags.
 */
export function decideRoute(input: DecideRouteInput): RouteDecision {
  const op = String(input.operation ?? "").trim();
  if (!isKnownOperation(op)) {
    // Safe default: deterministic → database → python → ai, AI optional
    const pythonOk =
      !isPythonForceUnavailable() &&
      !input.forcePythonUnavailable &&
      isPythonConfigured();
    const aiOk = !isAiForceUnavailable(input.forceAiUnavailable);
    return {
      operation: op as HybridOperation,
      canCompleteDeterministically: true,
      canCompleteWithDatabase: true,
      canUsePython: pythonOk,
      canUseAI: aiOk,
      isAiOptional: true,
      isAiRequired: false,
      preferredOrder: ["deterministic", "database", "python", "ai"],
      pythonFallbackOnAiFailure: true,
      aiFallbackOnPythonFailure: true,
      durableJob: false,
    };
  }

  const base = MATRIX[op];
  const pythonBlocked =
    isPythonForceUnavailable() || Boolean(input.forcePythonUnavailable);
  const aiBlocked = isAiForceUnavailable(input.forceAiUnavailable);

  const canUsePython = !pythonBlocked && isPythonConfigured();
  const canUseAI = !aiBlocked;

  return {
    operation: op,
    ...base,
    canUsePython,
    canUseAI,
  };
}

export function listHybridOperations(): HybridOperation[] {
  return Object.keys(MATRIX) as HybridOperation[];
}
