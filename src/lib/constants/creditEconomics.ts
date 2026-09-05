/**
 * Credit economics — plan allotments, pack pricing, and per-feature deductions.
 *
 * Model (50% gross margin target on subscriptions):
 * - Blended API COGS ≈ $0.01 per credit
 * - Subscription retail ≈ $0.02 per credit (price ÷ credits)
 * - Credit packs ≈ $0.08–0.16 per credit (premium vs subscription → drives upgrades)
 */

/** Bump when plan prices, allotments, or action costs change. */
export const CREDIT_CATALOG_VERSION = "credit_catalog_v3";

export const PLAN_STATUS = {
  free: "active",
  starter: "deprecated",
  pro: "active",
  elite: "deprecated",
  enterprise: "active",
} as const;

export const CREDIT_ECONOMICS = {
  API_COST_CENTS_PER_CREDIT: 1,
  TARGET_GROSS_MARGIN: 0.5,
  SUBSCRIPTION_CENTS_PER_CREDIT: 2,
  PACK_CENTS_PER_CREDIT: 8,
} as const;

/** Monthly credit allotment per plan (enterprise = high cap, not unlimited). */
export const PLAN_MONTHLY_CREDITS = {
  free: 50,
  starter: 50,
  pro: 1_400,
  elite: 1_400,
  enterprise: 4_000,
} as const;

export const PLAN_PRICE_CENTS_MONTHLY = {
  free: 0,
  starter: 0,
  pro: 2_900,
  elite: 7_900,
  enterprise: 7_900,
} as const;

/**
 * Annual billed totals (cents) — source of truth matches subscriptionManager
 * PLANS.yearlyPrice (monthly×12×0.8 = true 20% off).
 */
export const PLAN_PRICE_CENTS_YEARLY = {
  free: 0,
  starter: 0,
  pro: 27_840,
  elite: 75_840,
  enterprise: 75_840,
} as const;

/**
 * Per-feature credit deductions — keep frontend + edge functions aligned.
 * Values reflect relative API cost with margin baked into plan pricing.
 */
export const AI_CREDIT_COSTS = {
  live_hint: 2,
  live_answer: 8,
  live_feedback: 3,
  screenshot_answer: 10,
  session_debrief: 15,
  generate_scorecard: 15,
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

/** Pack ids match Edge Razorpay catalog (`credits_50` / `credits_150` / `credits_500`). */
export const CREDIT_PACK_DEFINITIONS = [
  {
    id: "credits_50",
    credits: 50,
    priceUsdCents: 799,
    label: "50 Credits",
  },
  {
    id: "credits_150",
    credits: 150,
    priceUsdCents: 2_199,
    label: "150 Credits",
    badge: "Most Popular",
  },
  {
    id: "credits_500",
    credits: 500,
    priceUsdCents: 6_999,
    label: "500 Credits",
    badge: "Best Value",
  },
] as const;

/** Effective ¢/credit for a subscription plan (for display / margin checks). */
export function subscriptionCentsPerCredit(planId: keyof typeof PLAN_MONTHLY_CREDITS): number {
  const price = PLAN_PRICE_CENTS_MONTHLY[planId];
  const credits = PLAN_MONTHLY_CREDITS[planId];
  if (!price || !credits) return 0;
  return Math.round(price / credits);
}

/** Baseline question count for flat `mock_session` (15 cr) pricing. */
export const MOCK_SESSION_BASELINE_QUESTIONS = 5;

/** Scales mock session credits with selected question count (5 → 15 cr). */
export function mockSessionCreditCost(questionCount: number): number {
  const count = Math.max(1, Math.floor(questionCount));
  return Math.ceil(
    (count / MOCK_SESSION_BASELINE_QUESTIONS) * AI_CREDIT_COSTS.mock_session,
  );
}

/** Estimated gross margin % on subscription credits at blended API cost. */
export function estimatedSubscriptionMargin(planId: "pro" | "enterprise"): number {
  const retail = subscriptionCentsPerCredit(planId);
  const cogs = CREDIT_ECONOMICS.API_COST_CENTS_PER_CREDIT;
  if (retail <= 0) return 0;
  return Math.round((1 - cogs / retail) * 100);
}
