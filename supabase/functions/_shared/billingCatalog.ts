/**
 * Canonical billing catalog — single source of truth for plans and packs.
 * Edge Functions must derive price/credits from this catalog + env price IDs.
 * Display names never authorize features.
 */

import { PLAN_MONTHLY_CREDITS } from "./creditEconomics.ts";

export type CanonicalPlanId =
  | "free"
  | "starter"
  | "pro"
  | "elite"
  | "enterprise";

export type LaunchPlanId = "free" | "pro" | "enterprise";

export type BillingInterval = "month" | "year" | "one_time";

export interface PlanCatalogEntry {
  planId: CanonicalPlanId;
  /** Public label — never used for authorization. */
  displayName: string;
  /** Consumer interview-prep tier only (not org/SSO). */
  consumerTier: true;
  monthlyCredits: number;
  active: boolean;
  /** Shown on launch pricing surface. */
  launchVisible: boolean;
  /** Stripe price env keys (values injected at runtime). */
  stripePriceEnvKeys: {
    monthly?: string;
    yearly?: string;
  };
  razorpayProductIds?: string[];
  upgradeTo: CanonicalPlanId[];
}

export interface CreditPackCatalogEntry {
  packId: string;
  credits: number;
  stripePriceEnvKey: string;
  active: boolean;
}

/** Rank for entitlement comparisons (aliases share ranks). */
export const PLAN_RANK: Record<CanonicalPlanId, number> = {
  free: 0,
  starter: 0,
  pro: 2,
  elite: 2,
  enterprise: 4,
};

export const PLAN_CATALOG: Record<CanonicalPlanId, PlanCatalogEntry> = {
  free: {
    planId: "free",
    displayName: "Free",
    consumerTier: true,
    monthlyCredits: PLAN_MONTHLY_CREDITS.free,
    active: true,
    launchVisible: true,
    stripePriceEnvKeys: {},
    upgradeTo: ["pro", "enterprise"],
  },
  starter: {
    planId: "starter",
    displayName: "Pro",
    consumerTier: true,
    monthlyCredits: PLAN_MONTHLY_CREDITS.starter,
    active: false,
    launchVisible: false,
    stripePriceEnvKeys: {
      monthly: "STRIPE_PRICE_STARTER_MONTHLY",
      yearly: "STRIPE_PRICE_STARTER_YEARLY",
    },
    upgradeTo: ["pro", "enterprise"],
  },
  pro: {
    planId: "pro",
    displayName: "Pro",
    consumerTier: true,
    monthlyCredits: PLAN_MONTHLY_CREDITS.pro,
    active: true,
    launchVisible: true,
    stripePriceEnvKeys: {
      monthly: "STRIPE_PRICE_PRO_MONTHLY",
      yearly: "STRIPE_PRICE_PRO_YEARLY",
    },
    razorpayProductIds: ["pro_monthly"],
    upgradeTo: ["enterprise"],
  },
  elite: {
    planId: "elite",
    displayName: "Pro",
    consumerTier: true,
    monthlyCredits: PLAN_MONTHLY_CREDITS.elite,
    active: false,
    launchVisible: false,
    stripePriceEnvKeys: {
      monthly: "STRIPE_PRICE_ELITE_MONTHLY",
      yearly: "STRIPE_PRICE_ELITE_YEARLY",
    },
    upgradeTo: ["enterprise"],
  },
  enterprise: {
    planId: "enterprise",
    /** High-credit consumer tier — not org/SSO enterprise software. */
    displayName: "Max",
    consumerTier: true,
    monthlyCredits: PLAN_MONTHLY_CREDITS.enterprise,
    active: true,
    launchVisible: true,
    stripePriceEnvKeys: {
      monthly: "STRIPE_PRICE_ENTERPRISE_MONTHLY",
      yearly: "STRIPE_PRICE_ENTERPRISE_YEARLY",
    },
    razorpayProductIds: ["enterprise_monthly"],
    upgradeTo: [],
  },
};

export const CREDIT_PACK_CATALOG: CreditPackCatalogEntry[] = [
  {
    packId: "credits_50",
    credits: 50,
    stripePriceEnvKey: "STRIPE_PRICE_CREDITS_50",
    active: true,
  },
  {
    packId: "credits_150",
    credits: 150,
    stripePriceEnvKey: "STRIPE_PRICE_CREDITS_150",
    active: true,
  },
  {
    packId: "credits_500",
    credits: 500,
    stripePriceEnvKey: "STRIPE_PRICE_CREDITS_500",
    active: true,
  },
];

const ALIASES: Record<string, CanonicalPlanId> = {
  free: "free",
  starter: "starter",
  pro: "pro",
  elite: "elite",
  enterprise: "enterprise",
  team: "enterprise",
  max: "enterprise",
};

export function normalizePlanId(
  raw: string | null | undefined,
): CanonicalPlanId | null {
  if (raw == null) return "free";
  const key = String(raw).trim().toLowerCase();
  if (!key) return "free";
  return ALIASES[key] ?? null;
}

export function planRank(raw: string | null | undefined): number {
  const id = normalizePlanId(raw);
  if (!id) return -1;
  return PLAN_RANK[id];
}

export function getPlanDisplayName(raw: string | null | undefined): string {
  const id = normalizePlanId(raw) ?? "free";
  return PLAN_CATALOG[id].displayName;
}

export function monthlyCreditsForPlan(
  raw: string | null | undefined,
): number {
  const id = normalizePlanId(raw) ?? "free";
  return PLAN_CATALOG[id].monthlyCredits;
}

/**
 * Server-owned credit amount for a Razorpay product_type.
 * Never trust client or payment_orders.credits_granted for grants.
 */
export function creditsForRazorpayProductType(productType: string): number {
  const key = productType.trim();
  const plan = Object.values(PLAN_CATALOG).find((p) =>
    p.razorpayProductIds?.includes(key)
  );
  if (plan) return plan.monthlyCredits;

  const pack = CREDIT_PACK_CATALOG.find((p) => p.packId === key && p.active);
  return pack?.credits ?? 0;
}

/** Plan id for Razorpay subscription products; null for credit packs. */
export function planIdForRazorpayProductType(
  productType: string,
): CanonicalPlanId | null {
  const key = productType.trim();
  const plan = Object.values(PLAN_CATALOG).find((p) =>
    p.razorpayProductIds?.includes(key)
  );
  return plan?.planId ?? null;
}
