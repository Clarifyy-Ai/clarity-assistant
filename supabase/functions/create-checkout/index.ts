import Stripe from "https://esm.sh/stripe@14.21.0?target=deno&deno-std=0.132.0";
import { handleCors, corsHeaders } from "../_shared/cors.ts";
import { createServiceClient } from "../_shared/supabase.ts";

// ─────────────────────────────────────────────────────────────────────────────
// create-checkout — Create a Stripe Checkout session
//
// Required env vars (set in Supabase Dashboard → Edge Functions → Secrets):
//   STRIPE_SECRET_KEY              — Stripe secret key
//   STRIPE_PRICE_STARTER_MONTHLY   — Price ID for Starter plan
//   STRIPE_PRICE_PRO_MONTHLY       — Price ID for Pro plan
//   STRIPE_PRICE_ENTERPRISE_MONTHLY — Price ID for Enterprise plan
//   STRIPE_PRICE_CREDITS_50        — Price ID for 50-credit pack
//   STRIPE_PRICE_CREDITS_150       — Price ID for 150-credit pack
//   STRIPE_PRICE_CREDITS_500       — Price ID for 500-credit pack
//   SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY — Auto-provided
//
// Body: { price_id, success_url, cancel_url }
// plan_id and credits are derived server-side from price_id allowlist.
// ─────────────────────────────────────────────────────────────────────────────

type PriceEntitlement = {
  mode: "subscription" | "payment";
  plan_id?: string;
  credits?: number;
  monthly_credits?: number;
};

function buildPriceAllowlist(): Map<string, PriceEntitlement> {
  const m = new Map<string, PriceEntitlement>();
  const add = (envKey: string, entitlement: PriceEntitlement) => {
    const priceId = Deno.env.get(envKey);
    if (priceId) m.set(priceId, entitlement);
  };
  add("STRIPE_PRICE_STARTER_MONTHLY",    { mode: "subscription", plan_id: "starter",    monthly_credits: 100  });
  add("STRIPE_PRICE_PRO_MONTHLY",        { mode: "subscription", plan_id: "pro",         monthly_credits: 300  });
  add("STRIPE_PRICE_ELITE_MONTHLY",      { mode: "subscription", plan_id: "elite",       monthly_credits: 1000 });
  add("STRIPE_PRICE_ENTERPRISE_MONTHLY", { mode: "subscription", plan_id: "enterprise",  monthly_credits: 9999 });
  add("STRIPE_PRICE_CREDITS_50",         { mode: "payment",      credits: 50  });
  add("STRIPE_PRICE_CREDITS_150",        { mode: "payment",      credits: 150 });
  add("STRIPE_PRICE_CREDITS_500",        { mode: "payment",      credits: 500 });
  return m;
}

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
    const { price_id, success_url, cancel_url } = await req.json();

    if (!price_id || !success_url || !cancel_url) {
      return new Response(
        JSON.stringify({ error: "Missing required fields: price_id, success_url, cancel_url" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const allowlist = buildPriceAllowlist();
    const entitlement = allowlist.get(price_id);
    if (!entitlement) {
      return new Response(
        JSON.stringify({ error: "Invalid or unrecognised price_id" }),
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
      await db.from("profiles").update({ stripe_customer_id: customerId }).eq("id", user.id);
    }

    const metadata: Record<string, string> = { user_id: user.id };
    if (entitlement.plan_id)        metadata.plan_id         = entitlement.plan_id;
    if (entitlement.credits)        metadata.credits         = String(entitlement.credits);
    if (entitlement.monthly_credits) metadata.monthly_credits = String(entitlement.monthly_credits);

    const sessionParams: Stripe.Checkout.SessionCreateParams = {
      customer: customerId,
      line_items: [{ price: price_id, quantity: 1 }],
      mode: entitlement.mode,
      success_url,
      cancel_url,
      metadata,
      allow_promotion_codes: true,
    };

    if (entitlement.mode === "subscription") {
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
