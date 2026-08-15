// ─── Credits Manager ──────────────────────────────────────────────────────────
export {
  checkCredits,
  deductCredits,
  openUpgradeFlow,
  showLowCreditWarning,
  refreshCredits,
  fetchCreditHistory,
  isBYOKConfigured,
} from "./creditsManager";

export type {
  CreditCheckResult,
  CreditDeductionResult,
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
  formatInrPaise,
  formatPlanCheckoutPrice,
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

// ─── Display tier labels (launch: Free / Pro / Max) ─────────────────────
export {
  LAUNCH_PLANS,
  DEPRECATED_PLANS,
  PLAN_DISPLAY_NAMES,
  getPlanDisplayName,
  normalizeToDisplayTier,
} from "@/lib/constants/pricing";

export type { DisplayTier } from "@/lib/constants/pricing";

export {
  normalizePlanId,
  isPaidPlan,
  type LaunchPlanId,
} from "./planIds";

export {
  planRank,
  getCatalogDisplayName,
  normalizeCanonicalPlanId,
  PLAN_RANK,
} from "./planCatalog";
