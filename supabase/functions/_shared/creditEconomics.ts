/**
 * Server-side mirror of src/lib/constants/creditEconomics.ts
 * Keep values in sync when changing plan credits or feature costs.
 */

export const CREDIT_CATALOG_VERSION = "credit_catalog_v2";

export const PLAN_STATUS = {
  free: "active",
  starter: "deprecated",
  pro: "active",
  elite: "deprecated",
  enterprise: "active",
} as const;

export const PLAN_PRICE_CENTS_MONTHLY = {
  free: 0,
  starter: 0,
  pro: 2_900,
  elite: 7_900,
  enterprise: 7_900,
} as const;

export const PLAN_PRICE_CENTS_YEARLY = {
  free: 0,
  starter: 0,
  pro: 27_840,
  elite: 75_840,
  enterprise: 75_840,
} as const;

export const PLAN_MONTHLY_CREDITS = {
  free: 50,
  starter: 50,
  pro: 1_400,
  elite: 1_400,
  enterprise: 4_000,
} as const;

export const AI_CREDIT_COSTS = {
  live_hint: 2,
  live_answer: 8,
  live_feedback: 3,
  screenshot_answer: 10,
  session_debrief: 15,
  ai_coach_message: 2,
  generate_questions: 12,
  star_builder: 10,
  rephraser: 3,
  company_research: 20,
  coding_hint: 5,
  system_design: 8,
  mock_session: 15,
  resume_analysis: 12,
  gap_analysis: 10,
  parse_document: 8,
  create_mock_test: 3,
  mock_test_ai_gap_fill: 15,
  generate_practice_questions: 15,
  parse_question_pdf: 20,
  analyze_test_performance: 12,
  project_builder: 12,
  polish_star: 2,
} as const;

export type AICreditCostKey = keyof typeof AI_CREDIT_COSTS;

export function creditCost(key: AICreditCostKey): number {
  return AI_CREDIT_COSTS[key];
}

/** Premium over live_answer for long-form overlay answers (matches creditsManager). */
const LIVE_ANSWER_LONG_PREMIUM = 4;

/**
 * Maps client / edge action strings to canonical AI_CREDIT_COSTS keys.
 * Keys are normalized to lowercase before lookup.
 */
const ACTION_TO_CANONICAL: Record<string, AICreditCostKey> = {
  // Client CreditAction names (src/lib/billing/creditsManager.ts)
  liveanswershort: "live_answer",
  hintgeneration: "live_hint",
  starbuilder: "star_builder",
  documentparse: "parse_question_pdf",
  companyresearch: "company_research",
  projectbuilder: "project_builder",
  mocksessionquestion: "generate_questions",

  // Edge function / deduct-credits action names
  generate_hint: "live_hint",
  generate_feedback: "live_feedback",
  debrief_generation: "session_debrief",
  generate_debrief: "session_debrief",
  generate_scorecard: "session_debrief",
  generate_rephrase: "rephraser",
  generate_questions: "generate_questions",
  coach_message: "ai_coach_message",
  parse_question_pdf: "parse_question_pdf",
  create_test: "create_mock_test",
  create_mock_test: "create_mock_test",
  company_research: "company_research",
  generate_answer: "live_answer",
  generate_star: "star_builder",
  polish_star: "polish_star",
  analyze_test_performance: "analyze_test_performance",
  generate_practice_questions: "generate_practice_questions",
  mock_test_ai_gap_fill: "mock_test_ai_gap_fill",
  resume_analysis: "resume_analysis",
  gap_analysis: "gap_analysis",
  parse_document: "parse_document",
  parse_resume: "resume_analysis",
  coding_hint: "coding_hint",
  system_design: "system_design",
  mock_session: "mock_session",
  screenshot_answer: "screenshot_answer",
  ai_coach_message: "ai_coach_message",
  session_debrief: "session_debrief",
  live_hint: "live_hint",
  live_answer: "live_answer",
  live_feedback: "live_feedback",
  star_builder: "star_builder",
  rephraser: "rephraser",
  project_builder: "project_builder",

  // Client useCredits() CREDIT_COSTS keys
  mock_question: "generate_questions",
  mock_full_answer: "live_answer",
  scorecard_generate: "session_debrief",
  star_generate: "star_builder",
  star_analyse: "polish_star",
  company_brief: "company_research",
  screenshot_analyse: "screenshot_answer",
  coding_solution: "live_answer",
  rephrase: "rephraser",
  project_build: "project_builder",

  // prep-tool Edge action strings (ledger / deduct-credits)
  prep_tool_rephrase: "rephraser",
  prep_tool_star_method: "star_builder",
  prep_tool_project_build: "project_builder",
  prep_tool_system_design: "system_design",
  prep_tool_coding_hint: "coding_hint",
  prep_tool_raw_prompt: "live_hint",
};

/**
 * Server-authoritative cost for a billing action string.
 * Returns undefined when the action is not recognized.
 */
export function resolveActionCost(action: string): number | undefined {
  const normalized = action.trim().toLowerCase();

  if (normalized === "liveanswerlong" || normalized === "live_answer_long") {
    return AI_CREDIT_COSTS.live_answer + LIVE_ANSWER_LONG_PREMIUM;
  }

  const canonical = ACTION_TO_CANONICAL[normalized];
  if (canonical) {
    return AI_CREDIT_COSTS[canonical];
  }

  if (normalized in AI_CREDIT_COSTS) {
    return AI_CREDIT_COSTS[normalized as AICreditCostKey];
  }

  return undefined;
}
