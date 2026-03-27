// resume-subscription/index.ts

import Stripe from "https://esm.sh/stripe@14.21.0?target=deno&deno-std=0.132.0";
import { handleCors, corsHeaders } from "../_shared/cors.ts";
import { createServiceClient } from "../_shared/supabase.ts";

Deno.serve(async (req) => {
  const cors = handleCors(req);
  if (cors) return cors;

  const stripeKey = Deno.env.get("STRIPE_SECRET_KEY");
  if (!stripeKey) {
    return new Response(JSON.stringify({ error: "Stripe is not configured." }), {
      status: 503,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const stripe = new Stripe(stripeKey, {
    apiVersion: "2024-04-10",
    httpClient: Stripe.createFetchHttpClient(),
  });

  const db = createServiceClient();

  try {
    /* ------------------------------------------------------------------
     * 1. AUTHENTICATE USER
     * ------------------------------------------------------------------ */
    const authHeader =
      req.headers.get("authorization") ??
      req.headers.get("Authorization");

    if (!authHeader?.toLowerCase().startsWith("bearer ")) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const token = authHeader.replace(/^bearer\s+/i, "");
    const {
      data: { user },
      error: authError,
    } = await db.auth.getUser(token);

    if (authError || !user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    /* ------------------------------------------------------------------
     * 2. FETCH USER SUBSCRIPTION RECORD IN SUPABASE
     * ------------------------------------------------------------------ */
    const { data: subscriptionRow, error: subErr } = await db
      .from("subscriptions")
      .select("stripe_subscription_id, stripe_customer_id")
      .eq("user_id", user.id)
      .single();

    if (subErr || !subscriptionRow?.stripe_subscription_id) {
      return new Response(
        JSON.stringify({
          error: "No active subscription found for this user.",
        }),
        {
          status: 404,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    const stripeSubscriptionId = subscriptionRow.stripe_subscription_id;
    const stripeCustomerId = subscriptionRow.stripe_customer_id;

    /* ------------------------------------------------------------------
     * 3. FETCH SUBSCRIPTION FROM STRIPE & VERIFY OWNERSHIP
     * ------------------------------------------------------------------ */
    let subscription;

    try {
      subscription = await stripe.subscriptions.retrieve(stripeSubscriptionId);
    } catch (_) {
      return new Response(
        JSON.stringify({ error: "Stripe subscription not found." }),
        { status: 404, headers: { ...corsHeaders } }
      );
    }

    if (!subscription || subscription.customer !== stripeCustomerId) {
      return new Response(
        JSON.stringify({
          error: "Subscription does not belong to the authenticated user.",
        }),
        { status: 403, headers: { ...corsHeaders } }
      );
    }

    /* ------------------------------------------------------------------
     * 4. CHECK IF RESUME IS NECESSARY
     * ------------------------------------------------------------------ */
    // Avoid unnecessary mutation if subscription is already active
    if (subscription.cancel_at_period_end === false) {
      return new Response(
        JSON.stringify({
          success: true,
          already_active: true,
        }),
        { status: 200, headers: { ...corsHeaders } }
      );
    }

    if (subscription.status !== "active" && subscription.status !== "trialing") {
      return new Response(
        JSON.stringify({
          error: `Subscription cannot be resumed in current state: ${subscription.status}`,
        }),
        { status: 400, headers: { ...corsHeaders } }
      );
    }

    /* ------------------------------------------------------------------
     * 5. RESUME SUBSCRIPTION IN STRIPE
     * ------------------------------------------------------------------ */
    await stripe.subscriptions.update(stripeSubscriptionId, {
      cancel_at_period_end: false,
    });

    /* ------------------------------------------------------------------
     * 6. UPDATE DB SAFELY (idempotent)
     * ------------------------------------------------------------------ */
    await db
      .from("subscriptions")
      .update({
        cancel_at: null,
        updated_at: new Date().toISOString(),
      })
      .eq("user_id", user.id);

    return new Response(JSON.stringify({ success: true }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("[resume-subscription] Error:", err);
    return new Response(
      JSON.stringify({
        error: err instanceof Error ? err.message : "Unknown error",
      }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});
