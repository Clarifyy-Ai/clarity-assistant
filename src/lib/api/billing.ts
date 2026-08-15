// src/lib/api/billing.ts
//
// Billing/payment API wrappers.
// Live checkout is Razorpay one-time purchases (see razorpayCheckout.ts).
// Stripe checkout/portal callers below are no-ops so pages cannot start Stripe.

import {
  createIdempotencyKey,
  invokeIdempotentFunction,
  type IdempotencyOptions,
} from "@/lib/api/functions";

export type CheckoutRequest = {
  price_id: string;
  success_url: string;
  cancel_url: string;
  coupon_code?: string;
};

export type CheckoutResponse = {
  url: string | null;
  session_id: string;
};

export type BillingPortalRequest = {
  return_url: string;
};

export type BillingPortalResponse = {
  url: string;
  session_id: string;
};

export type CancelSubscriptionRequest = {
  reason?: string;
  subscription_id?: string;
};

export type CancelSubscriptionResponse = {
  success: boolean;
  subscription_id?: string;
  already_canceled?: boolean;
  cancel_at?: number | null;
  cancel_at_iso?: string | null;
  cancel_at_period_end?: boolean;
  status?: string;
};

export type ResumeSubscriptionRequest = {
  subscription_id?: string;
};

export type ResumeSubscriptionResponse = {
  success: boolean;
  already_active?: boolean;
  subscription_id?: string;
  cancel_at?: number | null;
  cancel_at_period_end?: boolean;
  status?: string;
};

export type DeductCreditsRequest = {
  action: string;
  cost: number;
  session_id?: string | null;
  reference_id?: string | null;
};

export type DeductCreditsResponse = {
  credits_remaining: number;
  transaction_id?: string | null;
};

const STRIPE_CHECKOUT_DISABLED =
  "Stripe Checkout is not available. Plans and credit packs are one-time Razorpay purchases.";

const STRIPE_PORTAL_DISABLED =
  "Billing portal is not available. Clarify AI uses one-time Razorpay purchases, not subscriptions.";

export async function createCheckoutSession(
  _payload: CheckoutRequest,
  _options: IdempotencyOptions = {}
): Promise<CheckoutResponse> {
  throw new Error(STRIPE_CHECKOUT_DISABLED);
}

export async function createBillingPortalSession(
  _payload: BillingPortalRequest,
  _options: IdempotencyOptions = {}
): Promise<BillingPortalResponse> {
  throw new Error(STRIPE_PORTAL_DISABLED);
}

export async function cancelSubscription(
  payload: CancelSubscriptionRequest = {},
  options: IdempotencyOptions = {}
): Promise<CancelSubscriptionResponse> {
  return invokeIdempotentFunction<
    CancelSubscriptionResponse,
    CancelSubscriptionRequest
  >("cancel-subscription", payload, {
    idempotencyKey:
      options.idempotencyKey ?? createIdempotencyKey("cancel-subscription"),
  });
}

export async function resumeSubscription(
  payload: ResumeSubscriptionRequest = {},
  options: IdempotencyOptions = {}
): Promise<ResumeSubscriptionResponse> {
  return invokeIdempotentFunction<
    ResumeSubscriptionResponse,
    ResumeSubscriptionRequest
  >("resume-subscription", payload, {
    idempotencyKey:
      options.idempotencyKey ?? createIdempotencyKey("resume-subscription"),
  });
}

export async function deductCredits(
  payload: DeductCreditsRequest,
  options: IdempotencyOptions = {}
): Promise<DeductCreditsResponse> {
  return invokeIdempotentFunction<DeductCreditsResponse, DeductCreditsRequest>(
    "deduct-credits",
    payload,
    {
      idempotencyKey:
        options.idempotencyKey ?? createIdempotencyKey("deduct-credits"),
    }
  );
}

export function getCheckoutUrls(): {
  success_url: string;
  cancel_url: string;
} {
  const origin = window.location.origin;

  return {
    success_url: `${origin}/app/settings/billing?checkout=success`,
    cancel_url: `${origin}/app/settings/billing?checkout=cancelled`,
  };
}

export function getBillingReturnUrl(path = "/app/settings/billing"): string {
  return `${window.location.origin}${path}`;
}

export async function redirectToCheckout(
  _payload: CheckoutRequest
): Promise<void> {
  throw new Error(STRIPE_CHECKOUT_DISABLED);
}

export async function openCheckoutForPrice(_priceId: string): Promise<void> {
  throw new Error(STRIPE_CHECKOUT_DISABLED);
}

export async function redirectToBillingPortal(_returnUrl: string): Promise<void> {
  throw new Error(STRIPE_PORTAL_DISABLED);
}

export async function openBillingPortal(): Promise<void> {
  throw new Error(STRIPE_PORTAL_DISABLED);
}
