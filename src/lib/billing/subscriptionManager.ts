// src/lib/billing/subscriptionManager.ts
//
// Subscription plan lifecycle management and feature-gating helpers.
// Avoid direct Stripe calls from frontend — route mutations through Edge APIs.

import { supabase } from "@/lib/supabase/client";
import { BillingError, ErrorCode, tryCatch } from "@/lib/errors";
import { ENV } from "@/lib/env";
import { getPlanDisplayName } from "@/lib/constants/pricing";
import {
  cancelSubscription as cancelSubscriptionApi,
  resumeSubscription as resumeSubscriptionApi,
} from "@/lib/api/billing";
import { normalizePlanId } from "./planIds";

export { normalizePlanId } from "./planIds";

// ─────────────────────────────────────────────────────────────────────────────
// Plan Definitions
// ─────────────────────────────────────────────────────────────────────────────

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
  monthlyPrice: number;
  yearlyPrice: number;
  creditsPerMonth: number;
  stripePriceIdMonthly?: string;
  stripePriceIdYearly?: string;
  features: PlanFeature[];
  isPopular?: boolean;
  color: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// Plan Catalogue
// ─────────────────────────────────────────────────────────────────────────────

export const PLANS: Record<PlanId, Plan> = {
  free: {
    id: "free",
    name: "Free",
    tagline: "Get started — no card required",
    monthlyPrice: 0,
    yearlyPrice: 0,
    // Launch source of truth: src/lib/constants/creditEconomics.ts
    creditsPerMonth: 50,
    color: "slate",
    features: [
      {
        key: "live_assist",
        label: "Practice Coach sessions",
        included: true,
        limit: 2,
        note: "2 sessions/month",
      },
      {
        key: "mock_sessions",
        label: "Mock sessions",
        included: true,
        limit: 2,
      },
      {
        key: "answer_bank",
        label: "Answer bank",
        included: true,
        limit: 5,
      },
      {
        key: "star_builder",
        label: "STAR answer builder",
        included: true,
        limit: 3,
      },
      {
        key: "company_research",
        label: "Company research",
        included: false,
      },
      {
        key: "overlay",
        label: "Practice overlay",
        included: false,
      },
      {
        key: "audio_analysis",
        label: "Audio analysis",
        included: false,
      },
      {
        key: "byok",
        label: "Bring Your Own API Key",
        included: false,
      },
      {
        key: "analytics",
        label: "Performance analytics",
        included: false,
      },
      {
        key: "mock_test_ai",
        label: "AI gov exam question generation",
        included: false,
      },
      {
        key: "calendar_sync",
        label: "Calendar sync",
        included: false,
      },
    ],
  },

  starter: {
    // Legacy catalog — not in LAUNCH_PLANS; retained for DB/Stripe backward compat only.
    id: "starter",
    name: "Starter",
    tagline: "Legacy tier (deprecated)",
    monthlyPrice: 0,
    yearlyPrice: 0,
    creditsPerMonth: 50,
    stripePriceIdMonthly: ENV.STRIPE_PRICE_STARTER_MONTHLY,
    stripePriceIdYearly: ENV.STRIPE_PRICE_STARTER_YEARLY,
    color: "blue",
    features: [
      {
        key: "live_assist",
        label: "Practice Coach sessions",
        included: true,
        limit: 10,
      },
      {
        key: "mock_sessions",
        label: "Mock sessions",
        included: true,
        limit: 20,
      },
      {
        key: "answer_bank",
        label: "Answer bank",
        included: true,
        limit: 50,
      },
      {
        key: "star_builder",
        label: "STAR answer builder",
        included: true,
        limit: "unlimited",
      },
      {
        key: "company_research",
        label: "Company research",
        included: true,
        limit: 10,
      },
      {
        key: "overlay",
        label: "Practice overlay",
        included: true,
      },
      {
        key: "audio_analysis",
        label: "Audio analysis",
        included: true,
      },
      {
        key: "byok",
        label: "Bring Your Own API Key",
        included: false,
      },
      {
        key: "analytics",
        label: "Performance analytics",
        included: true,
      },
      {
        key: "mock_test_ai",
        label: "AI gov exam question generation",
        included: false,
      },
      {
        key: "calendar_sync",
        label: "Calendar sync",
        included: false,
      },
    ],
  },

  pro: {
    id: "pro",
    name: "Pro",
    tagline: "Everything you need to land the role",
    monthlyPrice: 2_900,
    yearlyPrice: 2_417, // $29,000/yr ÷ 12 — display only
    creditsPerMonth: 1_400,
    stripePriceIdMonthly: ENV.STRIPE_PRICE_PRO_MONTHLY,
    stripePriceIdYearly: ENV.STRIPE_PRICE_PRO_YEARLY,
    color: "violet",
    isPopular: true,
    features: [
      {
        key: "live_assist",
        label: "Practice Coach sessions",
        included: true,
        limit: "unlimited",
      },
      {
        key: "mock_sessions",
        label: "Mock sessions",
        included: true,
        limit: "unlimited",
      },
      {
        key: "answer_bank",
        label: "Answer bank",
        included: true,
        limit: "unlimited",
      },
      {
        key: "star_builder",
        label: "STAR answer builder",
        included: true,
        limit: "unlimited",
      },
      {
        key: "company_research",
        label: "Company research",
        included: true,
        limit: "unlimited",
      },
      {
        key: "overlay",
        label: "Practice overlay",
        included: true,
      },
      {
        key: "audio_analysis",
        label: "Audio analysis",
        included: true,
      },
      {
        key: "byok",
        label: "Bring Your Own API Key",
        included: false,
      },
      {
        key: "analytics",
        label: "Performance analytics",
        included: true,
      },
      {
        key: "calendar_sync",
        label: "Calendar sync",
        included: true,
      },
      {
        key: "mock_test_ai",
        label: "AI gov exam question generation",
        included: true,
        note: "Mixed official + AI papers",
      },
    ],
  },

  elite: {
    id: "elite",
    name: "Elite",
    tagline: "For FAANG-level prep",
    monthlyPrice: 7_900,
    yearlyPrice: 5_900,
    creditsPerMonth: 1_000,
    stripePriceIdMonthly: ENV.STRIPE_PRICE_ELITE_MONTHLY,
    stripePriceIdYearly: ENV.STRIPE_PRICE_ELITE_YEARLY,
    color: "amber",
    features: [
      {
        key: "live_assist",
        label: "Practice Coach sessions",
        included: true,
        limit: "unlimited",
      },
      {
        key: "mock_sessions",
        label: "Mock sessions",
        included: true,
        limit: "unlimited",
      },
      {
        key: "answer_bank",
        label: "Answer bank",
        included: true,
        limit: "unlimited",
      },
      {
        key: "star_builder",
        label: "STAR answer builder",
        included: true,
        limit: "unlimited",
      },
      {
        key: "company_research",
        label: "Company research",
        included: true,
        limit: "unlimited",
      },
      {
        key: "overlay",
        label: "Practice overlay",
        included: true,
      },
      {
        key: "audio_analysis",
        label: "Audio analysis",
        included: true,
      },
      {
        key: "byok",
        label: "Bring Your Own API Key",
        included: false,
      },
      {
        key: "analytics",
        label: "Performance analytics",
        included: true,
      },
      {
        key: "calendar_sync",
        label: "Calendar sync",
        included: true,
      },
      {
        key: "mock_test_ai",
        label: "AI gov exam question generation",
        included: true,
        note: "Mixed official + AI papers",
      },
      {
        key: "priority_support",
        label: "Priority support",
        included: true,
      },
      {
        key: "coach_sessions",
        label: "1-on-1 coach sessions",
        included: true,
        limit: 2,
        note: "2/month",
      },
    ],
  },

  enterprise: {
    id: "enterprise",
    name: "Max",
    tagline: "Higher credits for power users and coaches",
    monthlyPrice: 7_900,
    yearlyPrice: 6_583, // $79,000/yr ÷ 12 — display only
    creditsPerMonth: 4_000,
    color: "emerald",
    features: [
      {
        key: "everything",
        label: "Everything in Pro",
        included: true,
      },
      {
        key: "credits",
        label: "4,000 credits / month",
        included: true,
      },
      {
        key: "priority_models",
        label: "Priority model access",
        included: true,
      },
      {
        key: "dedicated_support",
        label: "Priority email support",
        included: true,
      },
      {
        key: "usage_analytics",
        label: "Advanced usage analytics",
        included: true,
      },
    ],
  },
};

export const PLAN_ORDER: PlanId[] = [
  "free",
  "starter",
  "pro",
  "elite",
  "enterprise",
];

/** Display-tier labels and launch plan helpers — DB enum values unchanged. */
export {
  LAUNCH_PLANS,
  DEPRECATED_PLANS,
  PLAN_DISPLAY_NAMES,
  getPlanDisplayName,
  normalizeToDisplayTier,
} from "@/lib/constants/pricing";

export type { DisplayTier } from "@/lib/constants/pricing";

// ─────────────────────────────────────────────────────────────────────────────
// Subscription State
// ─────────────────────────────────────────────────────────────────────────────

export type SubscriptionStatus =
  | "active"
  | "trialing"
  | "past_due"
  | "canceled"
  | "cancelled"
  | "unpaid"
  | "incomplete"
  | "incomplete_expired"
  | "paused"
  | "inactive";

export interface Subscription {
  id: string;
  userId: string;
  planId: PlanId;
  interval: BillingInterval;
  status: SubscriptionStatus;
  currentPeriodStart: Date;
  currentPeriodEnd: Date;
  cancelAtPeriodEnd: boolean;
  cancelAt: Date | null;
  stripeSubscriptionId?: string;
  stripeCustomerId?: string;
  trialEndsAt?: Date;
  createdAt: Date;
  updatedAt: Date;
  monthlyAmountCents?: number;
}

type ProfileBillingRow = {
  plan_id?: string | null;
  subscription_id?: string | null;
  stripe_customer_id?: string | null;
  subscription_status?: string | null;
};

type SubscriptionRow = {
  id?: string | null;
  user_id?: string | null;
  stripe_customer_id?: string | null;
  stripe_subscription_id?: string | null;
  stripe_price_id?: string | null;
  plan_id?: string | null;
  status?: string | null;
  credits_monthly?: number | null;
  monthly_amount_cents?: number | null;
  current_period_start?: string | null;
  current_period_end?: string | null;
  cancel_at?: string | null;
  cancel_at_period_end?: boolean | null;
  created_at?: string | null;
  updated_at?: string | null;
};

function normalizeStatus(value: unknown): SubscriptionStatus {
  if (typeof value !== "string") {
    return "inactive";
  }

  const normalized = value.trim().toLowerCase();

  switch (normalized) {
    case "active":
    case "trialing":
    case "past_due":
    case "canceled":
    case "cancelled":
    case "unpaid":
    case "incomplete":
    case "incomplete_expired":
    case "paused":
      return normalized as SubscriptionStatus;

    default:
      return "inactive";
  }
}

function safeDate(value: unknown, fallback = new Date()): Date {
  if (typeof value !== "string" || value.trim().length === 0) {
    return fallback;
  }

  const date = new Date(value);

  return Number.isFinite(date.getTime()) ? date : fallback;
}

function inferIntervalFromPriceId(row: SubscriptionRow): BillingInterval {
  const priceId = row.stripe_price_id?.trim();
  if (!priceId) {
    return "monthly";
  }

  const plan = PLANS[normalizePlanId(row.plan_id)];

  if (plan.stripePriceIdYearly && priceId === plan.stripePriceIdYearly) {
    return "yearly";
  }

  return "monthly";
}

function isSubscriptionUsable(status: SubscriptionStatus): boolean {
  return ![
    "canceled",
    "cancelled",
    "unpaid",
    "incomplete_expired",
    "inactive",
  ].includes(status);
}

function mapSubscriptionRow(
  row: SubscriptionRow,
  fallbackProfile?: ProfileBillingRow | null
): Subscription | null {
  const status = normalizeStatus(row.status ?? fallbackProfile?.subscription_status);

  if (!isSubscriptionUsable(status)) {
    return null;
  }

  const userId = row.user_id;

  if (!userId) {
    return null;
  }

  const planId = normalizePlanId(row.plan_id ?? fallbackProfile?.plan_id);
  const now = new Date();

  const currentPeriodStart = safeDate(row.current_period_start, now);
  const currentPeriodEnd = safeDate(row.current_period_end, now);

  const cancelAt = row.cancel_at ? safeDate(row.cancel_at, now) : null;

  return {
    id: row.id ?? row.stripe_subscription_id ?? userId,
    userId,
    planId,
    interval: inferIntervalFromPriceId(row),
    status,
    currentPeriodStart,
    currentPeriodEnd,
    cancelAtPeriodEnd: Boolean(row.cancel_at_period_end ?? row.cancel_at),
    cancelAt,
    stripeSubscriptionId:
      row.stripe_subscription_id ??
      fallbackProfile?.subscription_id ??
      undefined,
    stripeCustomerId:
      row.stripe_customer_id ??
      fallbackProfile?.stripe_customer_id ??
      undefined,
    trialEndsAt: undefined,
    createdAt: safeDate(row.created_at, now),
    updatedAt: safeDate(row.updated_at, now),
    monthlyAmountCents:
      typeof row.monthly_amount_cents === "number"
        ? row.monthly_amount_cents
        : PLANS[planId].monthlyPrice,
  };
}

function mapProfileFallback(
  userId: string,
  profile: ProfileBillingRow
): Subscription | null {
  const status = normalizeStatus(profile.subscription_status);

  if (!isSubscriptionUsable(status)) {
    return null;
  }

  const planId = normalizePlanId(profile.plan_id);
  const now = new Date();

  return {
    id: profile.subscription_id ?? userId,
    userId,
    planId,
    interval: "monthly",
    status,
    currentPeriodStart: now,
    currentPeriodEnd: now,
    cancelAtPeriodEnd: false,
    cancelAt: null,
    stripeSubscriptionId: profile.subscription_id ?? undefined,
    stripeCustomerId: profile.stripe_customer_id ?? undefined,
    trialEndsAt: undefined,
    createdAt: now,
    updatedAt: now,
    monthlyAmountCents: PLANS[planId].monthlyPrice,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Feature Gate
// ─────────────────────────────────────────────────────────────────────────────

export function planHasFeature(planId: PlanId, featureKey: string): boolean {
  const plan = PLANS[planId];
  const feature = plan.features.find((item) => item.key === featureKey);

  return feature?.included ?? false;
}

export function getPlanFeatureLimit(
  planId: PlanId,
  featureKey: string
): number | "unlimited" | null {
  const plan = PLANS[planId];
  const feature = plan.features.find((item) => item.key === featureKey);

  if (!feature?.included) {
    return null;
  }

  return feature.limit ?? "unlimited";
}

export function isPlanHigherThan(planA: PlanId, planB: PlanId): boolean {
  const a = normalizePlanId(planA);
  const b = normalizePlanId(planB);
  const order: Array<"free" | "pro" | "enterprise"> = ["free", "pro", "enterprise"];
  return order.indexOf(a) > order.indexOf(b);
}

export function getRequiredPlanForFeature(featureKey: string): PlanId | null {
  for (const planId of PLAN_ORDER) {
    if (planHasFeature(planId, featureKey)) {
      return planId;
    }
  }

  return null;
}

// ─────────────────────────────────────────────────────────────────────────────
// Subscription Fetcher
// ─────────────────────────────────────────────────────────────────────────────

export async function getUserSubscription(
  userId: string
): Promise<Subscription | null> {
  if (!userId) {
    return null;
  }

  const [profile, profileError] = await tryCatch(async () => {
    // NOTE: stripe_customer_id and subscription_id are not selectable from the
    // client (column-level grant revoked); rely on the `subscriptions` table
    // fallback below for those identifiers.
    const { data, error } = await supabase
      .from("profiles")
      .select("plan_id, subscription_status")
      .eq("id", userId)
      .maybeSingle();

    if (error) {
      throw error;
    }

    return data as ProfileBillingRow;
  });

  if (profileError || !profile) {
    return null;
  }

  const [subscriptionRow] = await tryCatch(async () => {
    const { data, error } = await supabase
      .from("subscriptions")
      .select(
        [
          "id",
          "user_id",
          "stripe_customer_id",
          "stripe_subscription_id",
          "stripe_price_id",
          "plan_id",
          "status",
          "credits_monthly",
          "monthly_amount_cents",
          "current_period_start",
          "current_period_end",
          "cancel_at",
          "cancel_at_period_end",
          "created_at",
          "updated_at",
        ].join(", ")
      )
      .eq("user_id", userId)
      .order("updated_at", {
        ascending: false,
      })
      .limit(1)
      .maybeSingle();

    if (error) {
      throw error;
    }

    return data as SubscriptionRow | null;
  });

  if (subscriptionRow) {
    return mapSubscriptionRow(subscriptionRow, profile);
  }

  return mapProfileFallback(userId, profile);
}

export async function getUserPlanId(userId: string): Promise<PlanId> {
  const subscription = await getUserSubscription(userId);

  if (!subscription || !isSubscriptionUsable(subscription.status)) {
    return "free";
  }

  return subscription.planId;
}

// ─────────────────────────────────────────────────────────────────────────────
// Subscription Mutations
// ─────────────────────────────────────────────────────────────────────────────

export async function cancelSubscription(): Promise<void> {
  const [, error] = await tryCatch(async () => {
    await cancelSubscriptionApi();
  });

  if (error) {
    throw new BillingError(
      "Failed to cancel subscription.",
      ErrorCode.BILLING_STRIPE_ERROR
    );
  }
}

export async function resumeSubscription(): Promise<void> {
  const [, error] = await tryCatch(async () => {
    await resumeSubscriptionApi();
  });

  if (error) {
    throw new BillingError(
      "Failed to resume subscription.",
      ErrorCode.BILLING_STRIPE_ERROR
    );
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Subscription Guards
// ─────────────────────────────────────────────────────────────────────────────

export async function requireFeature(
  userId: string,
  featureKey: string
): Promise<void> {
  const planId = await getUserPlanId(userId);

  if (!planHasFeature(planId, featureKey)) {
    const requiredPlan = getRequiredPlanForFeature(featureKey);

    throw new BillingError(
      `Feature "${featureKey}" requires the ${getPlanDisplayName(requiredPlan ?? "pro")} plan or higher.`,
      ErrorCode.BILLING_PLAN_GATE_BLOCKED,
      {
        featureKey,
        currentPlan: planId,
        requiredPlan,
      }
    );
  }
}

export async function canAccessFeature(
  userId: string,
  featureKey: string
): Promise<boolean> {
  const planId = await getUserPlanId(userId);

  return planHasFeature(planId, featureKey);
}

// ─────────────────────────────────────────────────────────────────────────────
// Trial Helpers
// ─────────────────────────────────────────────────────────────────────────────

export function isInTrial(subscription: Subscription | null): boolean {
  if (!subscription) {
    return false;
  }

  return (
    subscription.status === "trialing" &&
    Boolean(subscription.trialEndsAt) &&
    subscription.trialEndsAt! > new Date()
  );
}

export function trialDaysRemaining(subscription: Subscription | null): number {
  if (!isInTrial(subscription) || !subscription?.trialEndsAt) {
    return 0;
  }

  const msRemaining = subscription.trialEndsAt.getTime() - Date.now();

  return Math.max(0, Math.ceil(msRemaining / (1000 * 60 * 60 * 24)));
}
//
// SECURITY / ARCHITECTURE PURPOSE:
// - Centralize frontend plan catalogue
// - Resolve current subscription state from Supabase
