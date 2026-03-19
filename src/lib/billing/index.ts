// ─── Credits Manager ──────────────────────────────────────────────────────────
export {
  getCredits,
  deductCredits,
  addCredits,
  hasEnoughCredits,
  resetMonthlyCredits,
} from "./creditsManager";

// ─── Subscription Manager ────────────────────────────────────────────────────
export {
  PLANS,
  PLAN_ORDER,
  getUserSubscription,
  getUserPlanId,
  cancelSubscription,
  resumeSubscription,
  planHasFeature,
  getPlanFeatureLimit,
  isPlanHigherThan,
  getRequiredPlanForFeature,
  requireFeature,
  canAccessFeature,
  isInTrial,
  trialDaysRemaining,
} from "./subscriptionManager";

export type {
  Plan,
  PlanId,
  PlanFeature,
  Subscription,
  SubscriptionStatus,
  BillingInterval,
} from "./subscriptionManager";

// ─── Price Calculator ─────────────────────────────────────────────────────────
export {
  CREDIT_PACKS,
  CREDIT_COSTS,
  formatPrice,
  formatPriceWithInterval,
  calculateYearlySavings,
  getEffectiveMonthlyPrice,
  getBillingAmount,
  estimateUpgradeProration,
  getCostPerCredit,
  getBestValueCreditPack,
  estimateMonthlyCredits,
  recommendPlan,
  buildPlanComparison,
} from "./priceCalculator";

export type {
  CreditPack,
  PlanComparison,
} from "./priceCalculator";
