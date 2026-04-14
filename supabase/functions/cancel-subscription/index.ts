// cancel-subscription/index.ts — FIXED VERSION

import Stripe from "https://esm.sh/stripe@14.21.0?target=deno&deno-std=0.132.0";
import { handleCors, getCorsHeaders } from "../_shared/cors.ts";
import { createServiceClient } from "../_shared/supabase.ts";

Deno.serve(async (req) => {
  const cors = handleCors(req);
  if (cors) return cors;

  const stripeKey = Deno.env.get("STRIPE_SECRET_KEY");
  if (!stripeKey) {
    return new Response(
      JSON.stringify({ error: "Stripe is not configured." }),
      { status: 503, headers: { ...getCorsHeaders(req), "Content-Type": "application/json" } }
    );
  }

  const stripe = new Stripe(stripeKey, {
    apiVersion: "2024-04-10",
    httpClient: Stripe.createFetchHttpClient(),
  });

  const db = createServiceClient();

  try {
    /* ----------------------------------------------------
       AUTHENTICATION (Safe)
    ---------------------------------------------------- */
    const authHeader =
      req.headers.get("authorization") ??
      req.headers.get("Authorization");

    if (!authHeader?.toLowerCase().startsWith("bearer ")) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: getCorsHeaders(req),
      });
    }

    const token = authHeader.replace(/^bearer\s+/i, "");

    const {
      data: { user },
      error: authErr,
    } = await db.auth.getUser(token);

    if (authErr || !user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: getCorsHeaders(req),
      });
    }

    const userId = user.id;

    /* ----------------------------------------------------
       FETCH SUBSCRIPTION (Ensure only 1 exists)
    ---------------------------------------------------- */
    const { data: subRow, error: subErr } = await db
      .from("subscriptions")
      .select("stripe_subscription_id, stripe_customer_id")
      .eq("user_id", userId)
      .single();

    if (subErr || !subRow?.stripe_subscription_id) {
      return new Response(
        JSON.stringify({ error: "No active subscription found." }),
        { status: 404, headers: getCorsHeaders(req) }
      );
    }

    const subscriptionId = subRow.stripe_subscription_id;
    const stripeCustomerId = subRow.stripe_customer_id;

    /* ----------------------------------------------------
       FETCH FROM STRIPE & VERIFY OWNERSHIP
    ---------------------------------------------------- */
    let subscription;
    try {
      subscription = await stripe.subscriptions.retrieve(subscriptionId);
    } catch (_) {
      return new Response(
        JSON.stringify({ error: "Stripe subscription not found." }),
        { status: 404, headers: getCorsHeaders(req) }
      );
    }

    if (subscription.customer !== stripeCustomerId) {
      return new Response(
        JSON.stringify({ error: "Unauthorized subscription access." }),
        { status: 403, headers: getCorsHeaders(req) }
      );
    }

    /* ----------------------------------------------------
       IDEMPOTENT CANCELLATION
    ---------------------------------------------------- */
    if (subscription.cancel_at_period_end === true) {
      return new Response(
        JSON.stringify({
          success: true,
          alreadyCanceled: true,
          cancel_at: subscription.cancel_at,
        }),
        { status: 200, headers: getCorsHeaders(req) }
      );
    }

    if (subscription.status === "canceled") {
      return new Response(
        JSON.stringify({
          success: true,
          alreadyCanceled: true,
          cancel_at: null,
        }),
        { status: 200, headers: getCorsHeaders(req) }
      );
    }

    /* ----------------------------------------------------
       EXECUTE CANCELLATION
    ---------------------------------------------------- */
    const updated = await stripe.subscriptions.update(subscriptionId, {
      cancel_at_period_end: true,
    });

    const cancelAtISO =
      updated.cancel_at != null
        ? new Date(updated.cancel_at * 1000).toISOString()
        : null;

    /* ----------------------------------------------------
       UPDATE DB SAFELY
    ---------------------------------------------------- */
    await db
      .from("subscriptions")
      .update({
        cancel_at: cancelAtISO,
        updated_at: new Date().toISOString(),
      })
      .eq("user_id", userId);

    return new Response(
      JSON.stringify({
        success: true,
        cancel_at: updated.cancel_at,
      }),
      { status: 200, headers: getCorsHeaders(req) }
    );
  } catch (err) {
    console.error("[cancel-subscription] Error:", err);
    return new Response(
      JSON.stringify({ error: err instanceof Error ? err.message : "Unknown error" }),
      { status: 500, headers: getCorsHeaders(req) }
    );
  }
});
