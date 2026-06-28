// supabase/functions/billing-status/index.ts
//
// Returns the authenticated user's billing snapshot from profiles + subscriptions.
// Minimal read-only stub backing src/lib/api/billing.ts getBillingStatus().

import {
  handleCors,
  getCorsHeaders,
  withCorsHeaders,
} from "../_shared/cors.ts";

import { authenticateRequest } from "../_shared/auth.ts";

import { createServiceClient } from "../_shared/supabase.ts";

const FUNCTION_NAME = "billing-status";

function json(corsHeaders: HeadersInit, status: number, body: unknown): Response {
  const headers = new Headers(corsHeaders);
  headers.set("Content-Type", "application/json");
  headers.set("Cache-Control", "no-store");

  return new Response(JSON.stringify(body), {
    status,
    headers,
  });
}

Deno.serve(async (req: Request) => {
  const corsResponse = handleCors(req);
  if (corsResponse) return corsResponse;

  const corsHeaders = getCorsHeaders(req);

  if (req.method !== "GET" && req.method !== "POST") {
    return json(corsHeaders, 405, {
      error: "Method not allowed.",
      code: "METHOD_NOT_ALLOWED",
    });
  }

  const auth = await authenticateRequest(req);
  if (auth.error) {
    return withCorsHeaders(req, auth.error);
  }

  const { user } = auth.context;
  const db = createServiceClient();

  try {
    const { data: profile, error: profileError } = await db
      .from("profiles")
      .select(
        "plan_id, credits, credits_used_this_month, credits_reset_at, stripe_customer_id, stripe_subscription_id, subscription_status, subscription_period_end"
      )
      .eq("id", user.id)
      .maybeSingle();

    if (profileError) {
      console.error(`[${FUNCTION_NAME}] profile lookup failed:`, profileError.message);
      return json(corsHeaders, 500, {
        error: "Failed to load billing profile.",
        code: "PROFILE_LOOKUP_FAILED",
      });
    }

    const { data: subscriptions, error: subsError } = await db
      .from("subscriptions")
      .select(
        "id, plan_id, status, stripe_subscription_id, stripe_price_id, current_period_start, current_period_end, cancel_at, canceled_at, monthly_credits, trial_start, trial_end"
      )
      .eq("user_id", user.id)
      .order("created_at", { ascending: false })
      .limit(5);

    if (subsError) {
      console.error(`[${FUNCTION_NAME}] subscription lookup failed:`, subsError.message);
      return json(corsHeaders, 500, {
        error: "Failed to load subscription.",
        code: "SUBSCRIPTION_LOOKUP_FAILED",
      });
    }

    const activeSubscription =
      (subscriptions ?? []).find((row) =>
        ["active", "trialing", "past_due"].includes(String(row.status ?? ""))
      ) ?? subscriptions?.[0] ?? null;

    return json(corsHeaders, 200, {
      success: true,
      plan_id: profile?.plan_id ?? "free",
      credits: profile?.credits ?? 0,
      credits_used_this_month: profile?.credits_used_this_month ?? 0,
      credits_reset_at: profile?.credits_reset_at ?? null,
      stripe_customer_id: profile?.stripe_customer_id ?? null,
      stripe_subscription_id:
        profile?.stripe_subscription_id ??
        activeSubscription?.stripe_subscription_id ??
        null,
      subscription_status:
        profile?.subscription_status ?? activeSubscription?.status ?? "inactive",
      subscription_period_end:
        profile?.subscription_period_end ??
        activeSubscription?.current_period_end ??
        null,
      subscription: activeSubscription,
      subscriptions: subscriptions ?? [],
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unexpected billing-status error.";

    console.error(`[${FUNCTION_NAME}] Error:`, message);

    return json(corsHeaders, 500, {
      error: "Internal server error.",
      code: "INTERNAL_ERROR",
    });
  }
});
