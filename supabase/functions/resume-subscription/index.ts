// resume-subscription/index.ts — FIXED VERSION

import Stripe from "https://esm.sh/stripe@14.21.0?target=deno&deno-std=0.132.0";
import { handleCors, getCorsHeaders } from "../_shared/cors.ts";
import { createServiceClient } from "../_shared/supabase.ts";

Deno.serve(async (req) => {
  const cors = handleCors(req);
  if (cors) return cors;

  const stripeKey = Deno.env.get("STRIPE_SECRET_KEY");
  if (!stripeKey) {
    return new Response(
      JSON.stringify({ error: "Stripe not configured" }),
      { status: 503, headers: getCorsHeaders(req) }
    );
  }

  const stripe = new Stripe(stripeKey, {
    apiVersion: "2024-04-10",
    httpClient: Stripe.createFetchHttpClient(),
  });

  const db = createServiceClient();

  try {
    /* -------------------------------
       AUTHENTICATE USER SAFELY
    ------------------------------- */
    const authHeader =
      req.headers.get("authorization") ??
      req.headers.get("Authorization");

    if (!authHeader?.toLowerCase().startsWith("bearer ")) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: });
    }

    const token = authHeader.replace(/^bearer\s+/i, "");
    const {
      data: { user },
      error: userErr,
    } = await db.auth.getUser(token);

    if (userErr || !user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: });
    }

    /* -------------------------------
       FETCH USER SUBSCRIPTION
    ------------------------------- */
    const { data: subRow, error: subErr } = await db
      .from("subscriptions")
      .select("stripe_subscription_id, stripe_customer_id")
      .eq("user_id", user.id)
      .single();

    if (subErr || !subRow?.stripe_subscription_id) {
      return new Response(
        JSON.stringify({ error: "No active subscription found" }),
        { status: 404, headers: getCorsHeaders(req) }
      );
    }

    const subscriptionId = subRow.stripe_subscription_id;
    const stripeCustomerId = subRow.stripe_customer_id;

    /* -------------------------------
       FETCH STRIPE SUBSCRIPTION
    ------------------------------- */
    let subscription;
    try {
      subscription = await stripe.subscriptions.retrieve(subscriptionId);
    } catch {
      return new Response(
        JSON.stringify({ error: "Stripe subscription not found" }),
        { status: 404, headers: getCorsHeaders(req) }
      );
    }

    /* -------------------------------
       VERIFY OWNERSHIP
    ------------------------------- */
    if (subscription.customer !== stripeCustomerId) {
      return new Response(
        JSON.stringify({ error: "Subscription does not belong to this user" }),
        { status: 403, headers: getCorsHeaders(req) }
      );
    }

    /* -------------------------------
       IDEMPOTENT CHECK
    ------------------------------- */
    if (subscription.cancel_at_period_end === false) {
      return new Response(
        JSON.stringify({ success: true, already_active: true }),
        { status: 200, headers: getCorsHeaders(req) }
      );
    }

    if (subscription.status === "canceled") {
      return new Response(
        JSON.stringify({
          error: "Subscription is already fully canceled",
        }),
        { status: 400, headers: getCorsHeaders(req) }
      );
    }

    /* -------------------------------
       RESUME SUBSCRIPTION
    ------------------------------- */
    const updated = await stripe.subscriptions.update(subscriptionId, {
      cancel_at_period_end: false,
    });

    /* -------------------------------
       UPDATE DB
    ------------------------------- */
    await db
      .from("subscriptions")
      .update({
        cancel_at: null,
        updated_at: new Date().toISOString(),
      })
      .eq("user_id", user.id);

    return new Response(
      JSON.stringify({ success: true, cancel_at: updated.cancel_at }),
      { status: 200, headers: getCorsHeaders(req) }
    );
  } catch (err) {
    console.error("[resume-subscription] Error:", err);
    return new Response(
      JSON.stringify({ error: "Internal server error" }),
      { status: 500, headers: getCorsHeaders(req) }
    );
  }
});
``
