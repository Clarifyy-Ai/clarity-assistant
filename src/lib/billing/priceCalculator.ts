// ─────────────────────────────────────────────────────────────────────────────
// priceCalculator.ts — Pricing math, discount logic, and cost estimation
// Handles yearly savings, credit top-up pricing, and per-feature cost calc.
// ─────────────────────────────────────────────────────────────────────────────

import { PLANS, PLAN_ORDER, type PlanId, type BillingInterval } from "./subscriptionManager";
import { ENV } from "@/lib/env";

// ─── Credit Top-Up Packs ──────────────────────────────────────────────────────

export interface CreditPack {
  id: string;
  credits: number;
  priceUsdCents: number;
  label: string;
  badge?: string;
  stripePriceId?: string;
}

export const CREDIT_PACKS: CreditPack[] = [
  {
    id: "pack_50",
    credits: 50,
    priceUsdCents: 499,
    label: "50 Credits",
    stripePriceId: ENV.STRIPE_PRICE_CREDITS_50,
  },
  {
    id: "pack_150",
    credits: 150,
    priceUsdCents: 1299,
    label: "150 Credits",
    badge: "Most Popular",
    stripePriceId: ENV.STRIPE_PRICE_CREDITS_150,
  },
  {
    id: "pack_500",
    credits: 500,
    priceUsdCents: 3999,
    label: "500 Credits",
    badge: "Best Value",
    stripePriceId: ENV.STRIPE_PRICE_CREDITS_500,
  },
];

// ─── Per-Feature Credit Costs ─────────────────────────────────────────────────

export const CREDIT_COSTS: Record<string, number> = {
  live_answer:         3,   // generate one live answer
  live_hint:           1,   // generate one hint
  live_feedback:       2,   // post-answer feedback
  star_builder:        2,   // build one STAR answer
  rephraser:           1,   // rephrase an answer
  company_research:    5,   // research one company
  coding_hint:         2,   // coding problem hint
  system_design:       5,   // system design guide
  session_debrief:     8,   // full session debrief
  mock_session:        10,  // full mock interview session
  ai_coach_message:    2,   // one coach chat message
  resume_analysis:     5,   // analyze resume vs JD
  screenshot_capture:  1,   // capture screen context
};

// ─── Price Formatting ─────────────────────────────────────────────────────────

/**
 * Format USD cents to a display string.
 * @example formatPrice(1900) → "$19.00"
 * @example formatPrice(1900, true) → "$19"
 */
export function formatPrice(
  cents: number,
  hideDecimals = false,
  currency = "USD"
): string {
  if (cents === 0) return "Free";

  const amount = cents / 100;
  const formatted = new Intl.NumberFormat("en-US", {
    style: "currency",
    currency,
    minimumFractionDigits: hideDecimals ? 0 : 2,
    maximumFractionDigits: hideDecimals ? 0 : 2,
  }).format(amount);

  return formatted;
}

/**
 * Format a price with billing interval suffix.
 * @example formatPriceWithInterval(3900, "monthly") → "$39/mo"
 */
export function formatPriceWithInterval(
  cents: number,
  interval: BillingInterval
): string {
  if (cents === 0) return "Free";
  const base = formatPrice(cents, true);
  return `${base}/${interval === "monthly" ? "mo" : "mo"}`;
}

// ─── Savings Calculator ───────────────────────────────────────────────────────

/**
 * Calculate how much a user saves by choosing yearly over monthly.
 * Returns both the absolute saving in cents and the percentage.
 */
export function calculateYearlySavings(planId: PlanId): {
  savedCents: number;
  savedPercent: number;
  monthlyTotal: number;
  yearlyTotal: number;
} {
  const plan = PLANS[planId];

  if (!plan || plan.monthlyPrice === 0) {
    return { savedCents: 0, savedPercent: 0, monthlyTotal: 0, yearlyTotal: 0 };
  }

  const monthlyTotal = plan.monthlyPrice * 12;
  const yearlyTotal  = plan.yearlyPrice * 12;
  const savedCents   = monthlyTotal - yearlyTotal;
  const savedPercent = Math.round((savedCents / monthlyTotal) * 100);

  return { savedCents, savedPercent, monthlyTotal, yearlyTotal };
}

/**
 * Get the effective monthly price for a given plan and interval.
 */
export function getEffectiveMonthlyPrice(
  planId: PlanId,
  interval: BillingInterval
): number {
  const plan = PLANS[planId];
  if (!plan) return 0;
  return interval === "yearly" ? plan.yearlyPrice : plan.monthlyPrice;
}

/**
 * Get the total charge amount for a billing period.
 */
export function getBillingAmount(
  planId: PlanId,
  interval: BillingInterval
): number {
  const plan = PLANS[planId];
  if (!plan) return 0;

  if (interval === "yearly") return plan.yearlyPrice * 12;
  return plan.monthlyPrice;
}

// ─── Upgrade Cost Estimator ───────────────────────────────────────────────────

/**
 * Estimate proration cost when upgrading mid-cycle.
 * Returns how much will be charged immediately.
 *
 * @param currentPlanCents  - monthly price of current plan in cents
 * @param newPlanCents      - monthly price of new plan in cents
 * @param daysRemainingInCycle - days left in billing cycle
 * @param totalDaysInCycle  - total days in billing cycle (usually 30)
 */
export function estimateUpgradeProration(
  currentPlanCents: number,
  newPlanCents: number,
  daysRemainingInCycle: number,
  totalDaysInCycle = 30
): number {
  if (newPlanCents <= currentPlanCents) return 0;

  const dailyDiff = (newPlanCents - currentPlanCents) / totalDaysInCycle;
  const prorationCents = Math.round(dailyDiff * daysRemainingInCycle);
  return Math.max(0, prorationCents);
}

// ─── Credit Value Calculator ──────────────────────────────────────────────────

/**
 * Calculate the cost per credit for a given pack.
 * @example getCostPerCredit(CREDIT_PACKS[1]) → 8.66 cents/credit
 */
export function getCostPerCredit(pack: CreditPack): number {
  return pack.priceUsdCents / pack.credits;
}

/**
 * Find the best value credit pack (lowest cost per credit).
 */
export function getBestValueCreditPack(): CreditPack {
  return [...CREDIT_PACKS].sort(
    (a, b) => getCostPerCredit(a) - getCostPerCredit(b)
  )[0];
}

/**
 * Estimate how many credits a user needs per month based on usage pattern.
 */
export function estimateMonthlyCredits(usagePattern: {
  liveSessionsPerMonth: number;
  mockSessionsPerMonth: number;
  prepToolUsesPerMonth: number;
  coachMessagesPerMonth: number;
}): number {
  const {
    liveSessionsPerMonth,
    mockSessionsPerMonth,
    prepToolUsesPerMonth,
    coachMessagesPerMonth,
  } = usagePattern;

  // Estimate credits per session/use
  const liveCredits  = liveSessionsPerMonth  * (CREDIT_COSTS.live_answer * 10 + CREDIT_COSTS.live_hint * 5);
  const mockCredits  = mockSessionsPerMonth  * CREDIT_COSTS.mock_session;
  const prepCredits  = prepToolUsesPerMonth  * CREDIT_COSTS.star_builder;
  const coachCredits = coachMessagesPerMonth * CREDIT_COSTS.ai_coach_message;

  return Math.ceil(liveCredits + mockCredits + prepCredits + coachCredits);
}

/**
 * Recommend a plan based on estimated monthly credit needs.
 */
export function recommendPlan(estimatedMonthlyCredits: number): PlanId {
  for (const planId of PLAN_ORDER) {
    const plan = PLANS[planId];
    if (plan.creditsPerMonth === -1) return planId; // unlimited
    if (plan.creditsPerMonth >= estimatedMonthlyCredits) return planId;
  }
  return "elite";
}

// ─── Comparison Helpers ───────────────────────────────────────────────────────

export interface PlanComparison {
  planId: PlanId;
  monthlyPrice: string;
  yearlyPrice: string;
  yearlySaving: string;
  yearlySavingPercent: number;
  creditsPerMonth: string;
  isRecommended: boolean;
}

/**
 * Build a comparison table row for a plan.
 */
export function buildPlanComparison(
  planId: PlanId,
  estimatedCreditsNeeded = 0
): PlanComparison {
  const plan = PLANS[planId];
  const { savedPercent, yearlyTotal } = calculateYearlySavings(planId);

  return {
    planId,
    monthlyPrice:         formatPriceWithInterval(plan.monthlyPrice, "monthly"),
    yearlyPrice:          formatPriceWithInterval(plan.yearlyPrice, "yearly"),
    yearlySaving:         savedPercent > 0 ? `Save ${savedPercent}%` : "",
    yearlySavingPercent:  savedPercent,
    creditsPerMonth:      plan.creditsPerMonth === -1
                            ? "Unlimited"
                            : `${plan.creditsPerMonth} credits/mo`,
    isRecommended:        recommendPlan(estimatedCreditsNeeded) === planId,
  };
}
