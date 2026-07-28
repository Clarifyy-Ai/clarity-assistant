// src/lib/api/billing.ts
//
// Billing/payment API wrappers.

import {
  createIdempotencyKey,
  invokeFunction,
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

export async function createCheckoutSession(
  payload: CheckoutRequest,
  options: IdempotencyOptions = {}
): Promise<CheckoutResponse> {
  return invokeIdempotentFunction<CheckoutResponse, CheckoutRequest>(
    "create-checkout",
    payload,
    {
      idempotencyKey:
        options.idempotencyKey ?? createIdempotencyKey("checkout"),
    }
  );
}

export async function createBillingPortalSession(
  payload: BillingPortalRequest,
  options: IdempotencyOptions = {}
): Promise<BillingPortalResponse> {
  return invokeIdempotentFunction<BillingPortalResponse, BillingPortalRequest>(
    "create-billing-portal",
    payload,
    {
      idempotencyKey:
        options.idempotencyKey ?? createIdempotencyKey("billing-portal"),
    }
  );
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
  payload: CheckoutRequest
): Promise<void> {
  const response = await createCheckoutSession(payload);

  if (!response.url) {
    throw new Error("Checkout URL was not returned.");
  }

  window.location.assign(response.url);
}

export async function openCheckoutForPrice(priceId: string): Promise<void> {
  const urls = getCheckoutUrls();

  await redirectToCheckout({
    price_id: priceId,
    ...urls,
  });
}

export async function redirectToBillingPortal(
  returnUrl: string
): Promise<void> {
  const response = await createBillingPortalSession({
    return_url: returnUrl,
  });

  window.location.assign(response.url);
}

export async function openBillingPortal(): Promise<void> {
  await redirectToBillingPortal(getBillingReturnUrl());
}
