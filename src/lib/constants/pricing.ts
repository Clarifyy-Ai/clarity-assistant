// src/lib/constants/pricing.ts

//

// SINGLE SOURCE OF TRUTH for launch pricing, credits and plan-tier limits.

// Plan credits and prices are defined in creditEconomics.ts (50% margin model).

//

// Launch model:
//   Free        — 50 credits / month, $0
//   Pro         — 1,400 credits / month, $29 / mo  (or $290 / yr)
//   Max         — 4,000 credits / month, $79 / mo (consumer high-credit tier)

import {

  PLAN_MONTHLY_CREDITS as ECON_PLAN_CREDITS,

  PLAN_PRICE_CENTS_MONTHLY as ECON_MONTHLY,

  PLAN_PRICE_CENTS_YEARLY as ECON_YEARLY,

  CREDIT_ECONOMICS,

  estimatedSubscriptionMargin,

} from "@/lib/constants/creditEconomics";



export type PlanId = "free" | "starter" | "pro" | "elite" | "enterprise";



/** Plans actually offered to users at launch, in display order. */

export const LAUNCH_PLANS: PlanId[] = ["free", "pro", "enterprise"];



/** Legacy plan ids retained for backwards compatibility; never shown in UI. */

export const DEPRECATED_PLANS: PlanId[] = ["starter", "elite"];



/** User-facing tier labels. DB enum values unchanged for backward compat. */

export const PLAN_DISPLAY_NAMES: Record<PlanId, string> = {

  free: "Free",

  starter: "Pro",

  pro: "Pro",

  elite: "Pro",

  enterprise: "Max",

};



export type DisplayTier = "free" | "pro" | "enterprise";



export function normalizeToDisplayTier(planId: PlanId | string | null | undefined): DisplayTier {

  if (planId === "enterprise" || planId === "team" || planId === "max") return "enterprise";

  if (planId === "free" || planId === "starter") return "free";

  return "pro";

}



export function getPlanDisplayName(planId: PlanId | string | null | undefined): string {

  // Legacy DB value — never surface "Team" or organization-suite marketing copy.
  if (typeof planId === "string" && planId.trim().toLowerCase() === "team") {
    return "Max";
  }

  if (typeof planId === "string" && planId.trim().toLowerCase() === "max") {
    return "Max";
  }

  if (typeof planId === "string" && planId in PLAN_DISPLAY_NAMES) {

    return PLAN_DISPLAY_NAMES[planId as PlanId];

  }

  return PLAN_DISPLAY_NAMES.free;

}



/** Monthly credit allotment per plan. `null` = legacy unlimited display only. */

export const PLAN_MONTHLY_CREDITS: Record<PlanId, number | null> = {

  free: ECON_PLAN_CREDITS.free,

  starter: ECON_PLAN_CREDITS.starter,

  pro: ECON_PLAN_CREDITS.pro,

  elite: ECON_PLAN_CREDITS.elite,

  enterprise: ECON_PLAN_CREDITS.enterprise,

};



/** Prices in cents (USD). 0 = free; null = contact sales. */

export const PLAN_PRICE_CENTS_MONTHLY: Record<PlanId, number | null> = {

  free: ECON_MONTHLY.free,

  starter: ECON_MONTHLY.starter,

  pro: ECON_MONTHLY.pro,

  elite: ECON_MONTHLY.elite,

  enterprise: ECON_MONTHLY.enterprise,

};



export const PLAN_PRICE_CENTS_YEARLY: Record<PlanId, number | null> = {

  free: ECON_YEARLY.free,

  starter: ECON_YEARLY.starter,

  pro: ECON_YEARLY.pro,

  elite: ECON_YEARLY.elite,

  enterprise: ECON_YEARLY.enterprise,

};



export { CREDIT_ECONOMICS, estimatedSubscriptionMargin };



/** Human-readable label for credit balance UI. */

export function formatMonthlyCredits(planId: PlanId): string {

  const v = PLAN_MONTHLY_CREDITS[planId];

  return `${(v ?? 0).toLocaleString()} / mo`;

}



/** No plan is unlimited — Enterprise/Max uses a high monthly cap. */

export function isUnlimited(planId: PlanId): boolean {

  return false;

}


