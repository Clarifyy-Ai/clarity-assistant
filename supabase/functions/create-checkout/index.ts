import Stripe from "https://esm.sh/stripe@14.21.0?target=deno&deno-std=0.132.0";
import { handleCors, corsHeaders } from "../_shared/cors.ts";
import { createServiceClient } from "../_shared/supabase.ts";

// ─────────────────────────────────────────────────────────────────────────────
// create-checkout — Create a Stripe Checkout session
//
// Required env vars (set in Supabase Dashboard → Edge Functions → Secrets):
//   STRIPE_SECRET_KEY       — Stripe secret key (sk_live_... or sk_test_...)
//   STRIPE_WEBHOOK_SECRET   — Stripe webhook signing secret
//   SUPABASE_URL            — Auto-provided by Supabase
//   SUPABASE_SERVICE_ROLE_KEY — Auto-provided by Supabase
//
// Body: {
//   price_id:    string,          Stripe Price ID
//   success_url: string,          Redirect URL after success
//   cancel_url:  string,          Redirect URL after cancel/close
//   mode:        "subscription" | "payment",
//   plan_id?:    string,          Plan being purchased (for subscription mode)
//   credits?:    number,          Credits being purchased (for payment mode)
// }
// ─────────────────────────────────────────────────────────────────────────────

Deno.serve(async (req) => {
  const cors = handleCors(req);
  if (cors) return cors;

  const stripeKey = Deno.env.get("STRIPE_SECRET_KEY");
  if (!stripeKey) {
    return new Response(
      JSON.stringify({ error: "Stripe is not configured. Set STRIPE_SECRET_KEY." }),
      { status: 503, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }

  const stripe = new Stripe(stripeKey, {
    apiVersion: "2024-04-10",
    httpClient: Stripe.createFetchHttpClient(),
  });

  const db = createServiceClient();

  try {
    const {
      price_id,
      success_url,
      cancel_url,
      mode,
      plan_id,
      credits,
    } = await req.json();

    if (!price_id || !success_url || !cancel_url || !mode) {
      return new Response(
        JSON.stringify({ error: "Missing required fields: price_id, success_url, cancel_url, mode" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (mode !== "subscription" && mode !== "payment") {
      return new Response(
        JSON.stringify({ error: "mode must be 'subscription' or 'payment'" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: "Missing Authorization header" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const token = authHeader.replace("Bearer ", "");
    const { data: { user }, error: authError } = await db.auth.getUser(token);
    if (authError || !user) {
      return new Response(
        JSON.stringify({ error: "Unauthorized" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const { data: profile } = await db
      .from("profiles")
      .select("stripe_customer_id, email, full_name")
      .eq("id", user.id)
      .single();

    let customerId = profile?.stripe_customer_id as string | undefined;

    if (!customerId) {
      const customer = await stripe.customers.create({
        email: user.email ?? profile?.email ?? undefined,
        name: profile?.full_name ?? undefined,
        metadata: { supabase_user_id: user.id },
      });
      customerId = customer.id;

      await db
        .from("profiles")
        .update({ stripe_customer_id: customerId })
        .eq("id", user.id);
    }

    const metadata: Record<string, string> = {
      user_id: user.id,
      mode,
    };
    if (plan_id) metadata.plan_id = plan_id;
    if (credits) metadata.credits = String(credits);

    const sessionParams: Stripe.Checkout.SessionCreateParams = {
      customer: customerId,
      line_items: [{ price: price_id, quantity: 1 }],
      mode: mode as "subscription" | "payment",
      success_url,
      cancel_url,
      metadata,
      allow_promotion_codes: true,
    };

    if (mode === "subscription") {
      sessionParams.subscription_data = { metadata };
    }

    const session = await stripe.checkout.sessions.create(sessionParams);

    return new Response(
      JSON.stringify({ url: session.url, session_id: session.id }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    console.error("[create-checkout] Error:", message);
    return new Response(
      JSON.stringify({ error: message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
