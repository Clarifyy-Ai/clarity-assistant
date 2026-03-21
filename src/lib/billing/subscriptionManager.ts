// @ts-nocheck
// ─────────────────────────────────────────────────────────────────────────────
// subscriptionManager.ts — Subscription plan lifecycle management
// Handles plan resolution, feature gating, upgrade/downgrade logic,
// and Stripe subscription state synced via Supabase.
// ─────────────────────────────────────────────────────────────────────────────

import { supabase } from "@/integrations/supabase/client";
import { BillingError, ErrorCode, tryCatch } from "@/lib/errors";

// ─── Plan Definitions ─────────────────────────────────────────────────────────

export type PlanId = "free" | "starter" | "pro" | "elite" | "enterprise";

export type BillingInterval = "monthly" | "yearly";

export interface PlanFeature {
  key: string;
  label: string;
  included: boolean;
  limit?: number | "unlimited";
  note?: string;
}

export interface Plan {
  id: PlanId;
  name: string;
  tagline: string;
  monthlyPrice: number;   // USD cents
  yearlyPrice: number;    // USD cents (per month, billed annually)
  creditsPerMonth: number;
  stripePriceIdMonthly?: string;
  stripePriceIdYearly?: string;
  features: PlanFeature[];
  isPopular?: boolean;
  color: string;
}

// ─── Plan Catalogue ───────────────────────────────────────────────────────────

export const PLANS: Record<PlanId, Plan> = {
  free: {
    id: "free",
    name: "Free",
    tagline: "Get started — no card required",
    monthlyPrice: 0,
    yearlyPrice: 0,
    creditsPerMonth: 20,
    color: "slate",
    features: [
      { key: "live_assist",        label: "Live interview assist",     included: true,  limit: 3,           note: "3 sessions/month" },
      { key: "mock_sessions",      label: "Mock sessions",             included: true,  limit: 5 },
      { key: "answer_bank",        label: "Answer bank",               included: true,  limit: 10 },
      { key: "star_builder",       label: "STAR answer builder",       included: true,  limit: 5 },
      { key: "company_research",   label: "Company research",          included: false },
      { key: "overlay",            label: "Stealth overlay",           included: false },
      { key: "audio_analysis",     label: "Audio analysis",            included: false },
      { key: "byok",               label: "Bring Your Own API Key",    included: false },
      { key: "analytics",          label: "Performance analytics",     included: false },
      { key: "calendar_sync",      label: "Calendar sync",             included: false },
    ],
  },

  starter: {
    id: "starter",
    name: "Starter",
    tagline: "For active job seekers",
    monthlyPrice: 1900,   // $19/mo
    yearlyPrice: 1500,    // $15/mo billed yearly
    creditsPerMonth: 100,
    stripePriceIdMonthly: import.meta.env.VITE_STRIPE_PRICE_STARTER_MONTHLY,
    stripePriceIdYearly:  import.meta.env.VITE_STRIPE_PRICE_STARTER_YEARLY,
    color: "blue",
    features: [
      { key: "live_assist",        label: "Live interview assist",     included: true,  limit: 10 },
      { key: "mock_sessions",      label: "Mock sessions",             included: true,  limit: 20 },
      { key: "answer_bank",        label: "Answer bank",               included: true,  limit: 50 },
      { key: "star_builder",       label: "STAR answer builder",       included: true,  limit: "unlimited" },
      { key: "company_research",   label: "Company research",          included: true,  limit: 10 },
      { key: "overlay",            label: "Stealth overlay",           included: true },
      { key: "audio_analysis",     label: "Audio analysis",            included: true },
      { key: "byok",               label: "Bring Your Own API Key",    included: false },
      { key: "analytics",          label: "Performance analytics",     included: true },
      { key: "calendar_sync",      label: "Calendar sync",             included: false },
    ],
  },

  pro: {
    id: "pro",
    name: "Pro",
    tagline: "Everything you need to land the role",
    monthlyPrice: 3900,   // $39/mo
    yearlyPrice: 2900,    // $29/mo billed yearly
    creditsPerMonth: 300,
    stripePriceIdMonthly: import.meta.env.VITE_STRIPE_PRICE_PRO_MONTHLY,
    stripePriceIdYearly:  import.meta.env.VITE_STRIPE_PRICE_PRO_YEARLY,
    color: "violet",
    isPopular: true,
    features: [
      { key: "live_assist",        label: "Live interview assist",     included: true,  limit: "unlimited" },
      { key: "mock_sessions",      label: "Mock sessions",             included: true,  limit: "unlimited" },
      { key: "answer_bank",        label: "Answer bank",               included: true,  limit: "unlimited" },
      { key: "star_builder",       label: "STAR answer builder",       included: true,  limit: "unlimited" },
      { key: "company_research",   label: "Company research",          included: true,  limit: "unlimited" },
      { key: "overlay",            label: "Stealth overlay",           included: true },
      { key: "audio_analysis",     label: "Audio analysis",            included: true },
      { key: "byok",               label: "Bring Your Own API Key",    included: true },
      { key: "analytics",          label: "Performance analytics",     included: true },
      { key: "calendar_sync",      label: "Calendar sync",             included: true },
    ],
  },

  elite: {
    id: "elite",
    name: "Elite",
    tagline: "For FAANG-level prep",
    monthlyPrice: 7900,   // $79/mo
    yearlyPrice: 5900,    // $59/mo billed yearly
    creditsPerMonth: 1000,
    stripePriceIdMonthly: import.meta.env.VITE_STRIPE_PRICE_ELITE_MONTHLY,
    stripePriceIdYearly:  import.meta.env.VITE_STRIPE_PRICE_ELITE_YEARLY,
    color: "amber",
    features: [
      { key: "live_assist",        label: "Live interview assist",     included: true,  limit: "unlimited" },
      { key: "mock_sessions",      label: "Mock sessions",             included: true,  limit: "unlimited" },
      { key: "answer_bank",        label: "Answer bank",               included: true,  limit: "unlimited" },
      { key: "star_builder",       label: "STAR answer builder",       included: true,  limit: "unlimited" },
      { key: "company_research",   label: "Company research",          included: true,  limit: "unlimited" },
      { key: "overlay",            label: "Stealth overlay",           included: true },
      { key: "audio_analysis",     label: "Audio analysis",            included: true },
      { key: "byok",               label: "Bring Your Own API Key",    included: true },
      { key: "analytics",          label: "Performance analytics",     included: true },
      { key: "calendar_sync",      label: "Calendar sync",             included: true },
      { key: "priority_support",   label: "Priority support",          included: true },
      { key: "coach_sessions",     label: "1-on-1 coach sessions",     included: true,  limit: 2, note: "2/month" },
    ],
  },

  enterprise: {
    id: "enterprise",
    name: "Enterprise",
    tagline: "For teams and bootcamps",
    monthlyPrice: 0,      // custom pricing
    yearlyPrice: 0,
    creditsPerMonth: -1,  // unlimited
    color: "emerald",
    features: [
      { key: "everything",         label: "Everything in Elite",       included: true },
      { key: "team_seats",         label: "Team seats",                included: true,  limit: "unlimited" },
      { key: "sso",                label: "SSO / SAML",                included: true },
      { key: "audit_logs",         label: "Audit logs",                included: true },
      { key: "custom_models",      label: "Custom AI models",          included: true },
      { key: "dedicated_support",  label: "Dedicated support",         included: true },
      { key: "sla",                label: "99.9% SLA",                 included: true },
    ],
  },
};

export const PLAN_ORDER: PlanId[] = ["free", "starter", "pro", "elite", "enterprise"];

// ─── Subscription State ───────────────────────────────────────────────────────

export interface Subscription {
  id: string;
  userId: string;
  planId: PlanId;
  interval: BillingInterval;
  status: SubscriptionStatus;
  currentPeriodStart: Date;
  currentPeriodEnd: Date;
  cancelAtPeriodEnd: boolean;
  stripeSubscriptionId?: string;
  stripeCustomerId?: string;
  trialEndsAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

export type SubscriptionStatus =
  | "active"
  | "trialing"
  | "past_due"
  | "canceled"
  | "unpaid"
  | "incomplete"
  | "paused";

// ─── Feature Gate ─────────────────────────────────────────────────────────────

/**
 * Check if a plan includes a specific feature.
 */
export function planHasFeature(planId: PlanId, featureKey: string): boolean {
  const plan = PLANS[planId];
  if (!plan) return false;
  const feature = plan.features.find((f) => f.key === featureKey);
  return feature?.included ?? false;
}

/**
 * Get the feature limit for a plan, or null if not included.
 */
export function getPlanFeatureLimit(
  planId: PlanId,
  featureKey: string
): number | "unlimited" | null {
  const plan = PLANS[planId];
  if (!plan) return null;
  const feature = plan.features.find((f) => f.key === featureKey);
  if (!feature?.included) return null;
  return feature.limit ?? "unlimited";
}

/**
 * Check if planA is higher than planB in the tier hierarchy.
 */
export function isPlanHigherThan(planA: PlanId, planB: PlanId): boolean {
  return PLAN_ORDER.indexOf(planA) > PLAN_ORDER.indexOf(planB);
}

/**
 * Get the minimum plan required for a feature.
 */
export function getRequiredPlanForFeature(featureKey: string): PlanId | null {
  for (const planId of PLAN_ORDER) {
    if (planHasFeature(planId, featureKey)) return planId;
  }
  return null;
}

// ─── Subscription Fetcher ─────────────────────────────────────────────────────

/**
 * Fetch the active subscription for a user from Supabase.
 */
export async function getUserSubscription(
  userId: string
): Promise<Subscription | null> {
  const [data, err] = await tryCatch(async () => {
    const { data, error } = await supabase
      .from("profiles")
      .select("plan, stripe_subscription_id, stripe_customer_id, subscription_status, subscription_period_end")
      .eq("id", userId)
      .single();

    if (error) throw error;
    return data;
  });

  if (err || !data) return null;
  if (!data.subscription_status || data.subscription_status === "canceled") return null;

  let cancelAtPeriodEnd = false;
  if (data.stripe_subscription_id) {
    const subRow = await tryCatch(async () => {
      const { data: sub } = await supabase
        .from("subscriptions")
        .select("cancel_at_period_end")
        .eq("stripe_subscription_id", data.stripe_subscription_id)
        .maybeSingle();
      return sub;
    });
    if (subRow[0]?.cancel_at_period_end) cancelAtPeriodEnd = true;
  }

  return {
    id:                   data.stripe_subscription_id ?? userId,
    userId:               userId,
    planId:               (data.plan as PlanId) ?? "free",
    interval:             "monthly" as BillingInterval,
    status:               (data.subscription_status ?? "active") as SubscriptionStatus,
    currentPeriodStart:   new Date(),
    currentPeriodEnd:     data.subscription_period_end ? new Date(data.subscription_period_end) : new Date(),
    cancelAtPeriodEnd,
    stripeSubscriptionId: data.stripe_subscription_id ?? undefined,
    stripeCustomerId:     data.stripe_customer_id ?? undefined,
    trialEndsAt:          undefined,
    createdAt:            new Date(),
    updatedAt:            new Date(),
  };
}

/**
 * Get a user's current plan ID — defaults to "free" if no subscription.
 */
export async function getUserPlanId(userId: string): Promise<PlanId> {
  const sub = await getUserSubscription(userId);
  if (!sub || sub.status === "canceled" || sub.status === "unpaid") return "free";
  return sub.planId;
}

// ─── Subscription Mutations ───────────────────────────────────────────────────

/**
 * Cancel a subscription at period end (via Supabase edge function → Stripe).
 */
export async function cancelSubscription(
  subscriptionId: string
): Promise<void> {
  const [, err] = await tryCatch(async () => {
    const { error } = await supabase.functions.invoke("cancel-subscription", {
      body: { subscriptionId },
    });
    if (error) throw error;
  });

  if (err) {
    throw new BillingError(
      "Failed to cancel subscription.",
      ErrorCode.BILLING_STRIPE_ERROR,
      { subscriptionId }
    );
  }
}

/**
 * Resume a subscription that was set to cancel at period end.
 */
export async function resumeSubscription(
  subscriptionId: string
): Promise<void> {
  const [, err] = await tryCatch(async () => {
    const { error } = await supabase.functions.invoke("resume-subscription", {
      body: { subscriptionId },
    });
    if (error) throw error;
  });

  if (err) {
    throw new BillingError(
      "Failed to resume subscription.",
      ErrorCode.BILLING_STRIPE_ERROR,
      { subscriptionId }
    );
  }
}

// ─── Subscription Guards ──────────────────────────────────────────────────────

/**
 * Throws BillingError if user's plan doesn't include the feature.
 * Use this as a guard at the top of feature functions.
 *
 * @example
 * await requireFeature(userId, "overlay");
 */
export async function requireFeature(
  userId: string,
  featureKey: string
): Promise<void> {
  const planId = await getUserPlanId(userId);

  if (!planHasFeature(planId, featureKey)) {
    const requiredPlan = getRequiredPlanForFeature(featureKey);
    throw new BillingError(
      `Feature "${featureKey}" requires the ${requiredPlan ?? "pro"} plan or higher.`,
      ErrorCode.BILLING_PLAN_GATE_BLOCKED,
      { featureKey, currentPlan: planId, requiredPlan }
    );
  }
}

/**
 * Boolean check — no throw. Use in UI for conditional rendering.
 *
 * @example
 * const canUseOverlay = await canAccessFeature(userId, "overlay");
 */
export async function canAccessFeature(
  userId: string,
  featureKey: string
): Promise<boolean> {
  const planId = await getUserPlanId(userId);
  return planHasFeature(planId, featureKey);
}

// ─── Trial Helpers ────────────────────────────────────────────────────────────

export function isInTrial(subscription: Subscription | null): boolean {
  if (!subscription) return false;
  return (
    subscription.status === "trialing" &&
    !!subscription.trialEndsAt &&
    subscription.trialEndsAt > new Date()
  );
}

export function trialDaysRemaining(subscription: Subscription | null): number {
  if (!isInTrial(subscription) || !subscription?.trialEndsAt) return 0;
  const msRemaining = subscription.trialEndsAt.getTime() - Date.now();
  return Math.max(0, Math.ceil(msRemaining / (1000 * 60 * 60 * 24)));
}
