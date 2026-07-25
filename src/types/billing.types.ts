// ─────────────────────────────────────────────────────────────────
// Billing & Subscription Types
// ─────────────────────────────────────────────────────────────────

import { ENV } from "@/lib/env";
import type { UserPlan } from "./user.types";

// ── Plans ─────────────────────────────────────────────────────────

export interface PlanFeatures {
  id: UserPlan;
  name: string;
  price_monthly_usd: number;
  price_annual_usd: number | null;
  credits_monthly: number;
  seat_count: number;
  features: string[];
  highlighted_features: string[];
  ai_models: string[];
  is_popular: boolean;
  cta_label: string;
  stripe_price_monthly: string | null;
  stripe_price_annual: string | null;
}

export const PLAN_DEFINITIONS: Record<UserPlan, PlanFeatures> = {
  free: {
    id: "free",
    name: "Free",
    price_monthly_usd: 0,
    price_annual_usd: null,
    credits_monthly: 5,
    seat_count: 1,
    features: [
      "5 credits on signup",
      "Gemini Flash model",
      "Basic mock sessions",
      "Prep lab (limited)",
      "Session history (last 3)",
      "Community support",
    ],
    highlighted_features: ["5 credits", "Gemini Flash"],
    ai_models: ["Gemini Flash"],
    is_popular: false,
    cta_label: "Get started free",
    stripe_price_monthly: null,
    stripe_price_annual: null,
  },
  pro: {
    id: "pro",
    name: "Pro",
    price_monthly_usd: 12,
    price_annual_usd: 99,
    credits_monthly: 30,
    seat_count: 1,
    features: [
      "30 credits / month",
      "All 4 AI models",
      "Full analytics dashboard",
      "JSON scorecard export",
      "Coach chat in sessions",
      "Post-interview debrief",
      "Full session history",
      "Resume + JD hub",
      "Company research engine",
      "Interview scheduler",
      "Priority support",
    ],
    highlighted_features: ["30 credits/mo", "All 4 AI models", "Full analytics"],
    ai_models: ["Gemini Flash", "Gemini Pro", "GPT-4o", "Claude"],
    is_popular: true,
    cta_label: "Start Pro — $12/mo",
    stripe_price_monthly: ENV.STRIPE_PRICE_PRO_MONTHLY ?? "",
    stripe_price_annual: null,
  },
  /**
   * Legacy DB alias only — not sold at launch.
   * `normalizePlanId("team")` → enterprise. No SSO / seats / team rooms.
   */
  team: {
    id: "team",
    name: "Enterprise",
    price_monthly_usd: 79,
    price_annual_usd: 790,
    credits_monthly: 4000,
    seat_count: 1,
    features: [
      "Everything in Pro",
      "4,000 credits / month",
      "Priority model access",
      "Priority email support",
      "Advanced usage analytics",
    ],
    highlighted_features: ["4,000 credits", "Priority support"],
    ai_models: ["Gemini Flash", "Gemini Pro", "GPT-4o", "Claude"],
    is_popular: false,
    cta_label: "Upgrade to Enterprise",
    stripe_price_monthly: null,
    stripe_price_annual: null,
  },
  enterprise: {
    id: "enterprise",
    name: "Enterprise",
    price_monthly_usd: 79,
    price_annual_usd: 790,
    credits_monthly: 4000,
    seat_count: 1,
    features: [
      "Everything in Pro",
      "4,000 credits / month",
      "Priority model access",
      "Priority email support",
      "Advanced usage analytics",
    ],
    highlighted_features: ["4,000 credits", "Priority support"],
    ai_models: ["Gemini Flash", "Gemini Pro", "GPT-4o", "Claude"],
    is_popular: false,
    cta_label: "Upgrade to Enterprise",
    stripe_price_monthly: null,
    stripe_price_annual: null,
  },
};

// ── Credit Packs (pay-per-credit) ─────────────────────────────────
// Canonical pack definitions live in src/lib/billing/priceCalculator.ts

export type { CreditPack } from "@/lib/billing/priceCalculator";
export { CREDIT_PACKS } from "@/lib/billing/priceCalculator";

// ── Billing History ───────────────────────────────────────────────

export type BillingEventType =
  | "subscription_created"
  | "subscription_renewed"
  | "subscription_canceled"
  | "credit_pack_purchased"
  | "credits_consumed"
  | "refund"
  | "promo_applied";

export interface BillingHistoryEntry {
  id: string;
  user_id: string;
  event_type: BillingEventType;
  amount_usd: number | null;
  credits_delta: number | null;    // positive = added, negative = consumed
  description: string;
  stripe_invoice_id: string | null;
  stripe_payment_intent_id: string | null;
  created_at: string;
}

// ── Credit Usage Breakdown ────────────────────────────────────────

export interface CreditUsageCategory {
  category: string;
  credits_used: number;
  percentage: number;
  ai_calls: number;
}

export interface CreditUsageSummary {
  total_used: number;
  total_available: number;
  remaining: number;
  reset_at: string | null;
  breakdown: CreditUsageCategory[];
  daily_avg: number;
  projected_monthly: number;
}

// ── BYOK — Bring Your Own Key ─────────────────────────────────────

export type BYOKProvider = "gemini" | "openai" | "anthropic";

export interface BYOKEntry {
  provider: BYOKProvider;
  is_configured: boolean;
  is_valid: boolean | null;        // null = not yet validated
  last_validated_at: string | null;
  masked_key: string | null;       // e.g. "sk-...xxxx"
  error: string | null;
}

export interface BYOKState {
  entries: Record<BYOKProvider, BYOKEntry>;
  is_byok_active: boolean;         // true = bypassing credit system
}

// ── Promo Codes ───────────────────────────────────────────────────

export interface PromoCodeResult {
  code: string;
  is_valid: boolean;
  discount_type: "percent" | "credits" | "free_month" | null;
  discount_value: number | null;
  description: string | null;
  error: string | null;
}

// ── Stripe Checkout ───────────────────────────────────────────────

export interface CheckoutSessionRequest {
  plan: UserPlan | null;
  credit_pack_id: string | null;
  promo_code: string | null;
  success_url: string;
  cancel_url: string;
}

export interface CheckoutSessionResponse {
  checkout_url: string;
  session_id: string;
}

// ── Payment Orders (Razorpay/Stripe unified) ──────────────────────
// The `payment_orders` table is not present in the generated Supabase types.
// Keep a hand-authored row shape until the codegen picks it up.
export interface PaymentOrderRow {
  id: string;
  product_type: string;
  amount_paise: number;
  status: string;
  created_at: string;
  paid_at: string | null;
  provider: string;
}
