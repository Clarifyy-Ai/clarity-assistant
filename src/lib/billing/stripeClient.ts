// src/lib/billing/stripeClient.ts
// Frontend helpers for initializing Stripe and starting checkout sessions. [file:1][file:3]

import { loadStripe, type Stripe } from "@stripe/stripe-js";
import { useAuthStore } from "@/store/authStore";
import { EDGE_BASE } from "@/lib/env";

let stripePromise: Promise<Stripe | null> | null = null;

export function getStripe(): Promise<Stripe | null> {
  if (!stripePromise) {
    const pk = import.meta.env.VITE_STRIPE_PUBLISHABLE_KEY as string | undefined;
    if (!pk) {
      console.error("[stripeClient] Missing VITE_STRIPE_PUBLISHABLE_KEY");
      stripePromise = Promise.resolve(null);
    } else {
      stripePromise = loadStripe(pk);
    }
  }
  return stripePromise;
}

export type BillingPlanId = "free" | "basic" | "pro" | "enterprise";

export async function createCheckoutSession(planId: BillingPlanId): Promise<string> {
  const user = useAuthStore.getState().user;
  if (!user) throw new Error("User must be logged in to start checkout");

  const res = await fetch(`${EDGE_BASE}/create-checkout`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      // Supabase client automatically injects Authorization in Edge calls if you use supabase.functions,
      // but this allows direct fetch() as well.
      Authorization: `Bearer ${useAuthStore.getState().accessToken ?? ""}`,
    },
    body: JSON.stringify({
      user_id: user.id,
      plan_id: planId,
      success_url: window.location.origin + "/app/dashboard?upgrade=success",
      cancel_url: window.location.origin + "/app/dashboard?upgrade=cancelled",
    }),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => null);
    throw new Error(err?.error ?? "Failed to create checkout session");
  }

  const data = await res.json();
  return data.session_id as string;
}

export async function redirectToCheckout(sessionId: string): Promise<void> {
  const stripe = await getStripe();
  if (!stripe) throw new Error("Stripe not initialized");

  const result = await stripe.redirectToCheckout({ sessionId });
  if (result.error) {
    console.error("[stripeClient] redirect error:", result.error.message);
    throw new Error(result.error.message);
  }
}
