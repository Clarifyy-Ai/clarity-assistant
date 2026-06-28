/**
 * Credit economics — plan allotments, pack pricing, and per-feature deductions.
 *
 * Model (50% gross margin target on subscriptions):
 * - Blended API COGS ≈ $0.01 per credit
 * - Subscription retail ≈ $0.02 per credit (price ÷ credits)
 * - Credit packs ≈ $0.08–0.16 per credit (premium vs subscription → drives upgrades)
 */

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
  elite: 2_900,
  enterprise: 7_900,
} as const;

export const PLAN_PRICE_CENTS_YEARLY = {
  free: 0,
  starter: 0,
  pro: 29_000,
  elite: 29_000,
  enterprise: 79_000,
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
  ai_coach_message: 2,
  generate_questions: 12,
  star_builder: 10,
  rephraser: 3,
  company_research: 20,
  coding_hint: 5,
  system_design: 8,
  mock_session: 15,
  resume_analysis: 12,
  create_mock_test: 3,
  mock_test_ai_gap_fill: 15,
  generate_practice_questions: 15,
  parse_question_pdf: 20,
  analyze_test_performance: 12,
  project_builder: 12,
  polish_star: 2,
} as const;

export type AICreditCostKey = keyof typeof AI_CREDIT_COSTS;

export const CREDIT_PACK_DEFINITIONS = [
  {
    id: "pack_50",
    credits: 50,
    priceUsdCents: 799,
    label: "50 Credits",
  },
  {
    id: "pack_150",
    credits: 150,
    priceUsdCents: 2_199,
    label: "150 Credits",
    badge: "Most Popular",
  },
  {
    id: "pack_500",
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

/** Estimated gross margin % on subscription credits at blended API cost. */
export function estimatedSubscriptionMargin(planId: "pro" | "enterprise"): number {
  const retail = subscriptionCentsPerCredit(planId);
  const cogs = CREDIT_ECONOMICS.API_COST_CENTS_PER_CREDIT;
  if (retail <= 0) return 0;
  return Math.round((1 - cogs / retail) * 100);
}
