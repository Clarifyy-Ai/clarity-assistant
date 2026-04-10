// create-checkout/index.ts — Creates Stripe Checkout sessions

import Stripe from "https://esm.sh/stripe@14.21.0?target=deno&deno-std=0.132.0";
import { handleCors, corsHeaders } from "../_shared/cors.ts";
import { createServiceClient }     from "../_shared/supabase.ts";

const PUBLIC_URL = Deno.env.get("PUBLIC_URL") ?? "";

// ─────────────────────────────────────────────────────────────────
// Price allowlist — all purchasable price IDs and their entitlements.
// Only price IDs explicitly registered here will be accepted.
// ─────────────────────────────────────────────────────────────────

type PriceEntitlement = {
  mode:             "subscription" | "payment";
  plan_id?:         string;
  credits?:         number;
  monthly_credits?: number;
};

function buildPriceAllowlist(): Map<string, PriceEntitlement> {
  const m   = new Map<string, PriceEntitlement>();
  const add = (envKey: string, v: PriceEntitlement) => {
    const id = Deno.env.get(envKey);
    if (id) m.set(id, v);
  };

  // Subscription plans
  add("STRIPE_PRICE_STARTER_MONTHLY",    { mode: "subscription", plan_id: "starter",    monthly_credits: 100  });
  add("STRIPE_PRICE_PRO_MONTHLY",        { mode: "subscription", plan_id: "pro",        monthly_credits: 300  });
  add("STRIPE_PRICE_ELITE_MONTHLY",      { mode: "subscription", plan_id: "elite",      monthly_credits: 1000 });
  add("STRIPE_PRICE_ENTERPRISE_MONTHLY", { mode: "subscription", plan_id: "enterprise", monthly_credits: 9999 });

  // One-time credit packs
  add("STRIPE_PRICE_CREDITS_50",  { mode: "payment", credits: 50  });
  add("STRIPE_PRICE_CREDITS_150", { mode: "payment", credits: 150 });
  add("STRIPE_PRICE_CREDITS_500", { mode: "payment", credits: 500 });

  return m;
}

// ─────────────────────────────────────────────────────────────────
// Redirect URL validation
// Accepts both the production domain and localhost (for development).
// ─────────────────────────────────────────────────────────────────

function isAllowedRedirectUrl(raw: string): boolean {
  let parsed: URL;
  try {
    parsed = new URL(raw);
  } catch {
    return false;
  }

  // Always allow localhost in development
  if (parsed.hostname === "localhost" || parsed.hostname === "127.0.0.1") {
    return true;
  }

  // In production, restrict to the configured PUBLIC_URL host
  if (PUBLIC_URL) {
    try {
      const allowed = new URL(PUBLIC_URL).hostname;
      return parsed.hostname === allowed;
    } catch {
      return false;
    }
  }

  // No PUBLIC_URL configured — log a warning and reject for safety
  console.warn(
    "[create-checkout] PUBLIC_URL env var is not set. " +
    "Redirect URL validation is stricter — only localhost is allowed.",
  );
  return false;
}

// ─────────────────────────────────────────────────────────────────
// Handler
// ─────────────────────────────────────────────────────────────────

Deno.serve(async (req) => {
  const cors = handleCors(req);
  if (cors) return cors;

  try {
    // ── Validate Stripe secret key ──
    const stripeKey = Deno.env.get("STRIPE_SECRET_KEY");
    if (!stripeKey) {
      console.error("[create-checkout] STRIPE_SECRET_KEY not configured");
      return new Response(
        JSON.stringify({ error: "Stripe not configured" }),
        { status: 503, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const stripe = new Stripe(stripeKey, {
      apiVersion: "2024-04-10",
      httpClient: Stripe.createFetchHttpClient(),
    });

    const db = createServiceClient();

    // ── Authenticate user via Bearer token ──
    const authHeader =
      req.headers.get("authorization") ??
      req.headers.get("Authorization");

    if (!authHeader?.toLowerCase().startsWith("bearer ")) {
      return new Response(
        JSON.stringify({ error: "Unauthorized" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const token = authHeader.replace(/^bearer\s+/i, "");
    const { data: { user }, error: userErr } = await db.auth.getUser(token);

    if (userErr || !user) {
      return new Response(
        JSON.stringify({ error: "Unauthorized" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // ── Parse request body ──
    const body = await req.json().catch(() => null) as Record<string, string> | null;

    if (!body) {
      return new Response(
        JSON.stringify({ error: "Invalid JSON body" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const { price_id, success_url, cancel_url } = body;

    if (!price_id || !success_url || !cancel_url) {
      return new Response(
        JSON.stringify({ error: "Missing required fields: price_id, success_url, cancel_url" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // ── Validate redirect URLs (SSRF / open-redirect protection) ──
    if (!isAllowedRedirectUrl(success_url) || !isAllowedRedirectUrl(cancel_url)) {
      console.warn(`[create-checkout] Rejected redirect URLs: success=${success_url} cancel=${cancel_url}`);
      return new Response(
        JSON.stringify({ error: "Invalid redirect URLs" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // ── Validate price_id against allowlist (prevents price manipulation) ──
    const allowlist   = buildPriceAllowlist();
    const entitlement = allowlist.get(price_id);

    if (!entitlement) {
      console.warn(`[create-checkout] Rejected unknown price_id: ${price_id}`);
      return new Response(
        JSON.stringify({ error: "Invalid or unrecognized price_id" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // ── Fetch or create Stripe customer ──
    const { data: profile } = await db
      .from("profiles")
      .select("stripe_customer_id, full_name, email")
      .eq("id", user.id)
      .single();

    let customerId = profile?.stripe_customer_id as string | undefined;

    if (!customerId) {
      const customer = await stripe.customers.create({
        email:    user.email ?? profile?.email ?? undefined,
        name:     profile?.full_name ?? undefined,
        metadata: { supabase_user_id: user.id },
      });

      customerId = customer.id;

      await db
        .from("profiles")
        .update({ stripe_customer_id: customerId })
        .eq("id", user.id);
    }

    // ── Build checkout session metadata ──
    const metadata: Record<string, string> = {
      user_id: user.id,
    };

    if (entitlement.plan_id)         metadata.plan_id         = entitlement.plan_id;
    if (entitlement.credits)         metadata.credit_amount   = String(entitlement.credits);
    if (entitlement.monthly_credits) metadata.monthly_credits = String(entitlement.monthly_credits);

    // ── Create checkout session ──
    const params: Stripe.Checkout.SessionCreateParams = {
      customer:               customerId,
      line_items:             [{ price: price_id, quantity: 1 }],
      mode:                   entitlement.mode,
      success_url,
      cancel_url,
      allow_promotion_codes:  true,
      metadata,
      // Disable payment methods that require extra verification in certain regions
      payment_method_types:   ["card"],
    };

    if (entitlement.mode === "subscription") {
      params.subscription_data = { metadata };
    }

    const session = await stripe.checkout.sessions.create(params);

    console.log(
      `[create-checkout] Session created: ${session.id} ` +
      `user=${user.id} price=${price_id} mode=${entitlement.mode}`,
    );

    return new Response(
      JSON.stringify({ url: session.url, session_id: session.id }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );

  } catch (err) {
    console.error("[create-checkout] Unhandled error:", err);
    return new Response(
      JSON.stringify({ error: "Internal error", detail: String(err) }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
