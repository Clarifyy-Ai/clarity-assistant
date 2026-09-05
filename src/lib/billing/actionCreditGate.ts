/**
 * Action-level credit preflight — UI only.
 * Server remains authoritative for final charge.
 */

import {
  AI_CREDIT_COSTS,
  LIVE_ANSWER_LONG_CREDITS,
  type AICreditCostKey,
} from "@/lib/constants/creditEconomics";

/** Long-answer premium must match Edge `LIVE_ANSWER_LONG_PREMIUM`. */
const LIVE_ANSWER_LONG_PREMIUM = LIVE_ANSWER_LONG_CREDITS - AI_CREDIT_COSTS.live_answer;

/** Client aliases → catalogue keys (subset of Edge ACTION_TO_CANONICAL). */
const ACTION_TO_CANONICAL: Record<string, AICreditCostKey> = {
  live_hint: "live_hint",
  live_answer: "live_answer",
  live_feedback: "live_feedback",
  screenshot_answer: "screenshot_answer",
  session_debrief: "session_debrief",
  generate_debrief: "session_debrief",
  generate_scorecard: "generate_scorecard",
  scorecard_generate: "generate_scorecard",
  ai_coach_message: "ai_coach_message",
  generate_questions: "generate_questions",
  mock_question: "generate_questions",
  mocksessionquestion: "generate_questions",
  star_builder: "star_builder",
  star_generate: "star_builder",
  starbuilder: "star_builder",
  rephraser: "rephraser",
  rephrase: "rephraser",
  company_research: "company_research",
  company_brief: "company_research",
  companyresearch: "company_research",
  coding_hint: "coding_hint",
  system_design: "system_design",
  mock_session: "mock_session",
  resume_analysis: "resume_analysis",
  gap_analysis: "gap_analysis",
  parse_document: "parse_document",
  create_mock_test: "create_mock_test",
  mock_test_ai_gap_fill: "mock_test_ai_gap_fill",
  generate_practice_questions: "generate_practice_questions",
  parse_question_pdf: "parse_question_pdf",
  analyze_test_performance: "analyze_test_performance",
  project_builder: "project_builder",
  project_build: "project_builder",
  polish_star: "polish_star",
  star_analyse: "polish_star",
  screenshot_analyse: "screenshot_answer",
  generate_hint: "live_hint",
  liveanswershort: "live_answer",
  mock_full_answer: "live_answer",
  coding_solution: "live_answer",
  prep_tool_rephrase: "rephraser",
  prep_tool_star_method: "star_builder",
  prep_tool_project_build: "project_builder",
  prep_tool_system_design: "system_design",
  prep_tool_coding_hint: "coding_hint",
  prep_tool_raw_prompt: "live_hint",
};

/**
 * Resolve catalogue cost for an operation key.
 * Unknown → undefined (UNKNOWN_OPERATION — no invent / no charge in UI preflight).
 */
export function resolveCanonicalActionCost(operationKey: string): number | undefined {
  const normalized = String(operationKey ?? "").trim().toLowerCase();
  if (!normalized) return undefined;

  if (normalized === "liveanswerlong" || normalized === "live_answer_long") {
    return AI_CREDIT_COSTS.live_answer + LIVE_ANSWER_LONG_PREMIUM;
  }

  const canonical = ACTION_TO_CANONICAL[normalized];
  if (canonical) return AI_CREDIT_COSTS[canonical];

  if (normalized in AI_CREDIT_COSTS) {
    return AI_CREDIT_COSTS[normalized as AICreditCostKey];
  }

  return undefined;
}

export type ActionCreditGateResult =
  | { status: "allow"; cost: number; balance: number }
  | {
      status: "insufficient";
      cost: number;
      balance: number;
      shortfall: number;
    }
  | { status: "plan_blocked"; cost: number | null; balance: number | null }
  | { status: "unknown_operation"; cost: null; balance: number | null }
  | {
      status: "unknown_balance";
      cost: number;
      balance: null;
      shortfall: number;
    };

export function evaluateActionCreditGate(input: {
  operationKey: string;
  balance: number | null;
  balanceKnown?: boolean;
  /** false → plan/capability gate (Upgrade), not Buy Credits alone */
  planAllowed?: boolean;
}): ActionCreditGateResult {
  const planAllowed = input.planAllowed !== false;
  const cost = resolveCanonicalActionCost(input.operationKey);

  if (cost == null) {
    return {
      status: "unknown_operation",
      cost: null,
      balance: input.balance,
    };
  }

  if (!planAllowed) {
    return { status: "plan_blocked", cost, balance: input.balance };
  }

  if (cost <= 0) {
    return { status: "allow", cost: 0, balance: input.balance ?? 0 };
  }

  const balanceKnown = input.balanceKnown ?? input.balance != null;
  if (!balanceKnown || input.balance == null) {
    return {
      status: "unknown_balance",
      cost,
      balance: null,
      shortfall: cost,
    };
  }

  const balance = Math.max(0, Math.floor(input.balance));
  if (balance < cost) {
    return {
      status: "insufficient",
      cost,
      balance,
      shortfall: cost - balance,
    };
  }

  return { status: "allow", cost, balance };
}

/** Display mode for InsufficientCreditsAction from a gate result. */
export function creditGateUiMode(
  result: ActionCreditGateResult,
): "credits" | "plan" | "both" | "unavailable" | null {
  switch (result.status) {
    case "allow":
      return null;
    case "plan_blocked":
      return "plan";
    case "insufficient":
    case "unknown_balance":
      return "credits";
    case "unknown_operation":
      return "unavailable";
    default:
      return null;
  }
}
