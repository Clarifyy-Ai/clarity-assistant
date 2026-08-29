// src/lib/billing/priceCalculator.ts// src/lib/b Source Stripe price IDs only from ENV
// - Keep credit-cost estimates aligned with backend credit actions
// - Provide safe formatting and recommendation helpers

import {
  PLANS,
  PLAN_ORDER,
  type PlanId,
  type BillingInterval,
} from "@/lib/billing/subscriptionManager";
import {
  AI_CREDIT_COSTS,
  CREDIT_PACK_DEFINITIONS,
} from "@/lib/constants/creditEconomics";
import { ENV } from "@/lib/env";

// ─────────────────────────────────────────────────────────────────────────────
// Credit Top-Up Packs
// ─────────────────────────────────────────────────────────────────────────────

export interface CreditPack {
  id: string;
  credits: number;
  priceUsdCents: number;
  label: string;
  badge?: string;
  stripePriceId?: string;
}

export const CREDIT_PACKS: CreditPack[] = CREDIT_PACK_DEFINITIONS.map((pack) => ({
  ...pack,
  stripePriceId:
    pack.id === "credits_50"
      ? ENV.STRIPE_PRICE_CREDITS_50
      : pack.id === "credits_150"
        ? ENV.STRIPE_PRICE_CREDITS_150
        : ENV.STRIPE_PRICE_CREDITS_500,
}));

// ─────────────────────────────────────────────────────────────────────────────
// Per-Feature Credit Costs
// Keep these aligned with Supabase Edge Function costs.
// ─────────────────────────────────────────────────────────────────────────────

export const CREDIT_COSTS: Record<string, number> = {
  live_answer: AI_CREDIT_COSTS.live_answer,
  live_hint: AI_CREDIT_COSTS.live_hint,
  live_feedback: AI_CREDIT_COSTS.live_feedback,
  screenshot_answer: AI_CREDIT_COSTS.screenshot_answer,
  generate_questions: AI_CREDIT_COSTS.generate_questions,
  session_debrief: AI_CREDIT_COSTS.session_debrief,
  ai_coach_message: AI_CREDIT_COSTS.ai_coach_message,
  star_builder: AI_CREDIT_COSTS.star_builder,
  rephraser: AI_CREDIT_COSTS.rephraser,
  company_research: AI_CREDIT_COSTS.company_research,
  coding_hint: AI_CREDIT_COSTS.coding_hint,
  system_design: AI_CREDIT_COSTS.system_design,
  mock_session: AI_CREDIT_COSTS.mock_session,
  resume_analysis: AI_CREDIT_COSTS.resume_analysis,
  create_mock_test: AI_CREDIT_COSTS.create_mock_test,
  mock_test_ai_gap_fill: AI_CREDIT_COSTS.mock_test_ai_gap_fill,
  generate_practice_questions: AI_CREDIT_COSTS.generate_practice_questions,
  parse_question_pdf: AI_CREDIT_COSTS.parse_question_pdf,
  analyze_test_performance: AI_CREDIT_COSTS.analyze_test_performance,
  project_builder: AI_CREDIT_COSTS.project_builder,
};

// ─────────────────────────────────────────────────────────────────────────────
// Price Formatting
// ─────────────────────────────────────────────────────────────────────────────

function normalizeCents(cents: number): number {
  if (!Number.isFinite(cents)) {
    return 0;
  }

  return Math.max(0, Math.round(cents));
}

/**
 * Format USD cents to display string.
 *
 * @example
 * formatPrice(1900) => "$19.00"
 * formatPrice(1900, true) => "$19"
 */
/** Catalog INR amounts charged via Razorpay (paise). */
export const RAZORPAY_INR_PAISE = {
  pro_monthly: 249_900,
  enterprise_monthly: 679_900,
  credits_50: 69_900,
  credits_150: 189_900,
  credits_500: 599_900,
} as const;

export function formatInrPaise(paise: number, hideDecimals = true): string {
  const safePaise = normalizeCents(paise);
  if (safePaise === 0) return "Free";
  const rupees = safePaise / 100;
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    minimumFractionDigits: hideDecimals ? 0 : 2,
    maximumFractionDigits: hideDecimals ? 0 : 2,
  }).format(rupees);
}

export function razorpayPaiseForPlan(planId: string): number | null {
  if (planId === "pro" || planId === "elite") return RAZORPAY_INR_PAISE.pro_monthly;
  if (planId === "enterprise") return RAZORPAY_INR_PAISE.enterprise_monthly;
  return null;
}

/** Catalog INR paise for admin revenue math (0 for free / unknown). */
export function catalogPaiseForPlan(planId: string): number {
  return razorpayPaiseForPlan(planId) ?? 0;
}

export function razorpayPaiseForPack(packId: string): number | null {
  if (packId === "credits_50" || packId === "pack_50") return RAZORPAY_INR_PAISE.credits_50;
  if (packId === "credits_150" || packId === "pack_150") return RAZORPAY_INR_PAISE.credits_150;
  if (packId === "credits_500" || packId === "pack_500") return RAZORPAY_INR_PAISE.credits_500;
  return null;
}

/** User-facing plan price (INR). Free plans return "Free". */
export function formatPlanCheckoutPrice(planId: string): string {
  const paise = razorpayPaiseForPlan(planId);
  if (paise == null || paise === 0) return "Free";
  return formatInrPaise(paise);
}

export function formatPrice(
  cents: number,
  hideDecimals = false,
  currency = "USD"
): string {
  const safeCents = normalizeCents(cents);

  if (safeCents === 0) {
    return "Free";
  }

  const amount = safeCents / 100;

  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency,
    minimumFractionDigits: hideDecimals ? 0 : 2,
    maximumFractionDigits: hideDecimals ? 0 : 2,
  }).format(amount);
}

/**
 * Format a price with billing interval suffix.
 *
 * Note: PLANS.yearlyPrice is the annual total in cents. Pass the
 * monthly equivalent (yearlyPrice/12) when formatting yearly display.
 */
export function formatPriceWithInterval(
  cents: number,
  interval: BillingInterval
): string {
  const safeCents = normalizeCents(cents);

  if (safeCents === 0) {
    return "Free";
  }

  const base = formatPrice(safeCents, true);

  if (interval === "yearly") {
    return `${base}/mo billed yearly`;
  }

  return `${base}/mo`;
}

// ─────────────────────────────────────────────────────────────────────────────
// Savings Calculator
// ─────────────────────────────────────────────────────────────────────────────

export function calculateYearlySavings(planId: PlanId): {
  savedCents: number;
  savedPercent: number;
  monthlyTotal: number;
  yearlyTotal: number;
} {
  const plan = PLANS[planId];

  if (!plan || plan.monthlyPrice === 0) {
    return {
      savedCents: 0,
      savedPercent: 0,
      monthlyTotal: 0,
      yearlyTotal: 0,
    };
  }

  const monthlyTotal = normalizeCents(plan.monthlyPrice) * 12;
  // PLANS.yearlyPrice is the annual total (true 20% off monthly×12).
  const yearlyTotal = normalizeCents(plan.yearlyPrice);
  const savedCents = Math.max(0, monthlyTotal - yearlyTotal);

  const savedPercent =
    monthlyTotal > 0 ? Math.round((savedCents / monthlyTotal) * 100) : 0;

  return {
    savedCents,
    savedPercent,
    monthlyTotal,
    yearlyTotal,
  };
}

/**
 * Get effective monthly price for given plan and interval.
 */
export function getEffectiveMonthlyPrice(
  planId: PlanId,
  interval: BillingInterval
): number {
  const plan = PLANS[planId];

  if (!plan) {
    return 0;
  }

  return interval === "yearly"
    ? Math.round(normalizeCents(plan.yearlyPrice) / 12)
    : normalizeCents(plan.monthlyPrice);
}

/**
 * Get total charge amount for billing period.
 */
export function getBillingAmount(
  planId: PlanId,
  interval: BillingInterval
): number {
  const plan = PLANS[planId];

  if (!plan) {
    return 0;
  }

  if (interval === "yearly") {
    return normalizeCents(plan.yearlyPrice);
  }

  return normalizeCents(plan.monthlyPrice);
}

// ─────────────────────────────────────────────────────────────────────────────
// Upgrade Cost Estimator
// ─────────────────────────────────────────────────────────────────────────────

export function estimateUpgradeProration(
  currentPlanCents: number,
  newPlanCents: number,
  daysRemainingInCycle: number,
  totalDaysInCycle = 30
): number {
  const current = normalizeCents(currentPlanCents);
  const next = normalizeCents(newPlanCents);

  if (next <= current) {
    return 0;
  }

  if (
    !Number.isFinite(daysRemainingInCycle) ||
    !Number.isFinite(totalDaysInCycle) ||
    daysRemainingInCycle <= 0 ||
    totalDaysInCycle <= 0
  ) {
    return 0;
  }

  const cappedDaysRemaining = Math.min(
    Math.max(0, daysRemainingInCycle),
    totalDaysInCycle
  );

  const dailyDifference = (next - current) / totalDaysInCycle;
  const prorationCents = Math.round(dailyDifference * cappedDaysRemaining);

  return Math.max(0, prorationCents);
}

// ─────────────────────────────────────────────────────────────────────────────
// Credit Value Calculator
// ─────────────────────────────────────────────────────────────────────────────

export function getCostPerCredit(pack: CreditPack): number {
  if (!pack.credits || pack.credits <= 0) {
    return 0;
  }

  return normalizeCents(pack.priceUsdCents) / pack.credits;
}

export function getBestValueCreditPack(): CreditPack {
  return [...CREDIT_PACKS].sort(
    (left, right) => getCostPerCredit(left) - getCostPerCredit(right)
  )[0];
}

export function getEnabledCreditPacks(): CreditPack[] {
  return CREDIT_PACKS.filter((pack) => pack.credits > 0);
}

export function getCreditPackById(packId: string): CreditPack | null {
  return CREDIT_PACKS.find((pack) => pack.id === packId) ?? null;
}

export function getCreditPackByStripePriceId(
  stripePriceId: string
): CreditPack | null {
  return (
    CREDIT_PACKS.find((pack) => pack.stripePriceId === stripePriceId) ?? null
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Monthly Usage Estimator
// ─────────────────────────────────────────────────────────────────────────────

export function estimateMonthlyCredits(usagePattern: {
  liveSessionsPerMonth: number;
  mockSessionsPerMonth: number;
  prepToolUsesPerMonth: number;
  coachMessagesPerMonth: number;
}): number {
  const liveSessionsPerMonth = Math.max(
    0,
    Math.floor(usagePattern.liveSessionsPerMonth || 0)
  );

  const mockSessionsPerMonth = Math.max(
    0,
    Math.floor(usagePattern.mockSessionsPerMonth || 0)
  );

  const prepToolUsesPerMonth = Math.max(
    0,
    Math.floor(usagePattern.prepToolUsesPerMonth || 0)
  );

  const coachMessagesPerMonth = Math.max(
    0,
    Math.floor(usagePattern.coachMessagesPerMonth || 0)
  );

  const liveCredits =
    liveSessionsPerMonth *
    (CREDIT_COSTS.live_answer * 10 + CREDIT_COSTS.live_hint * 5);

  const mockCredits = mockSessionsPerMonth * CREDIT_COSTS.mock_session;

  const prepCredits = prepToolUsesPerMonth * CREDIT_COSTS.star_builder;

  const coachCredits =
    coachMessagesPerMonth * CREDIT_COSTS.ai_coach_message;

  return Math.ceil(liveCredits + mockCredits + prepCredits + coachCredits);
}

/**
 * Recommend a plan based on estimated monthly credit needs.
 */
export function recommendPlan(estimatedMonthlyCredits: number): PlanId {
  const requiredCredits = Math.max(0, Math.ceil(estimatedMonthlyCredits || 0));

  for (const planId of PLAN_ORDER) {
    const plan = PLANS[planId];

    if (plan.creditsPerMonth >= requiredCredits) {
      return planId;
    }
  }

  return "enterprise";
}

// ─────────────────────────────────────────────────────────────────────────────
// Comparison Helpers
// ─────────────────────────────────────────────────────────────────────────────

export interface PlanComparison {
  planId: PlanId;
  monthlyPrice: string;
  yearlyPrice: string;
  yearlySaving: string;
  yearlySavingPercent: number;
  creditsPerMonth: string;
  isRecommended: boolean;
}

export function buildPlanComparison(
  planId: PlanId,
  estimatedCreditsNeeded = 0
): PlanComparison {
  const plan = PLANS[planId];
  const { savedPercent } = calculateYearlySavings(planId);

  return {
    planId,
    monthlyPrice: formatPriceWithInterval(plan.monthlyPrice, "monthly"),
    yearlyPrice: formatPriceWithInterval(
      Math.round(normalizeCents(plan.yearlyPrice) / 12),
      "yearly"
    ),
    yearlySaving: savedPercent > 0 ? `Save ${savedPercent}%` : "",
    yearlySavingPercent: savedPercent,
    creditsPerMonth: `${plan.creditsPerMonth.toLocaleString()} credits/mo`,
    isRecommended: recommendPlan(estimatedCreditsNeeded) === planId,
  };
}
//
// Pricing math, discount logic, credit-pack pricing, and cost estimation.
//
// SECURITY / ARCHITECTURE PURPOSE:
// - Keep frontend pricing display centralized
// - Never hardcode Stripe price IDs directly in UI components
