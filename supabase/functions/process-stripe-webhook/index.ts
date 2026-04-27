// supabase/functions/process-stripe-webhook/index.ts
// Stripe webhook handler: sync subscriptions + credit buckets. [file:1][file:3]

import Stripe from "https://esm.sh/stripe@14?target=denonext";
import { createServiceClient } from "../_shared/supabase.ts";

const stripe = new Stripe(Deno.env.get("STRIPE_SECRET_KEY") ?? "", {
  apiVersion: "2024-11-20",
});

const cryptoProvider = Stripe.createSubtleCryptoProvider();

Deno.serve(async (req: Request) => {
  const sig = req.headers.get("Stripe-Signature");
  const webhookSecret = Deno.env.get("STRIPE_WEBHOOK_SIGNING_SECRET");

  if (!sig || !webhookSecret) {
    return new Response("Missing Stripe signature or webhook secret", {
      status: 400,
    });
  }

  const body = await req.text();

  let event: Stripe.Event;
  try {
    event = await stripe.webhooks.constructEventAsync(
      body,
      sig,
      webhookSecret,
      undefined,
      cryptoProvider,
    );
  } catch (err) {
    console.error("[stripe-webhook] Signature verification failed:", err);
    return new Response("Invalid signature", { status: 400 });
  }

  const db = createServiceClient();

  try {
    switch (event.type) {
      case "checkout.session.completed": {
        const session = event.data.object as Stripe.Checkout.Session;
        await handleCheckoutCompleted(db, session);
        break;
      }
      case "customer.subscription.created":
      case "customer.subscription.updated":
      case "customer.subscription.deleted": {
        const sub = event.data.object as Stripe.Subscription;
        await syncSubscription(db, sub);
        break;
      }
      case "invoice.payment_succeeded": {
        // Optional: top-up credits on each successful invoice.
        break;
      }
      default:
        console.log("[stripe-webhook] Ignoring event type:", event.type);
    }

    return new Response(JSON.stringify({ ok: true }), {
      status: 200,
      headers: {
        "Content-Type": "application/json",
      },
    });
  } catch (err) {
    console.error("[stripe-webhook] Handler error:", err);
    return new Response("Webhook handling failed", { status: 500 });
  }
});

/* ──────────────────────────────────────────────────────────────── */

import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";

async function handleCheckoutCompleted(
  db: SupabaseClient,
  session: Stripe.Checkout.Session,
) {
  const subscriptionId = typeof session.subscription === "string"
    ? session.subscription
    : session.subscription?.id;

  if (!subscriptionId) {
    console.warn("[stripe-webhook] checkout.session.completed without subscription");
    return;
  }

  const sub = await stripe.subscriptions.retrieve(subscriptionId);
  await syncSubscription(db, sub);
}

async function syncSubscription(
  db: SupabaseClient,
  sub: Stripe.Subscription,
) {
  const customerId = sub.customer as string;
  const status = normalizeStatus(sub.status);
  const planId = sub.items.data[0]?.price?.lookup_key ?? "pro";

  // We store supabase_user_id in Stripe customer metadata. [web:90][file:1]
  const supabaseUserId = (sub.metadata?.supabase_user_id ||
    sub.items.data[0]?.price?.metadata?.supabase_user_id) as string | undefined;

  if (!supabaseUserId) {
    console.warn("[stripe-webhook] Subscription missing supabase_user_id metadata");
    return;
  }

  const creditsMonthly = planToMonthlyCredits(planId);

  const { error: upsertErr } = await db.from("subscriptions").upsert(
    {
      user_id: supabaseUserId,
      stripe_customer_id: customerId,
      stripe_subscription_id: sub.id,
      plan_id: planId,
      status,
      credits_monthly: creditsMonthly,
      current_period_start: new Date(sub.current_period_start * 1000).toISOString(),
      current_period_end: new Date(sub.current_period_end * 1000).toISOString(),
    },
    {
      onConflict: "user_id,plan_id",
    } as any,
  );

  if (upsertErr) {
    console.error("[stripe-webhook] subscriptions upsert error:", upsertErr.message);
  }

  // Optionally seed or refresh profile credits on activation. [file:1][file:3]
  if (status === "active" || status === "trialing") {
    const seedCredits = creditsMonthly;
    const { error: profileErr } = await db
      .from("profiles")
      .update({
        plan_id: planId,
        subscription_status: status,
        credits: seedCredits,
        updated_at: new Date().toISOString(),
      })
      .eq("id", supabaseUserId);

    if (profileErr) {
      console.error("[stripe-webhook] profiles update error:", profileErr.message);
    }
  }
}

function normalizeStatus(status: Stripe.Subscription.Status): string {
  if (status === "trialing") return "trialing";
  if (status === "active") return "active";
  return "inactive";
}

// Map plan → monthly credits from Chapter 10 table. [file:3]
function planToMonthlyCredits(planId: string): number {
  switch (planId) {
    case "free":
      return 200;
    case "basic":
      return 2000;
    case "pro":
      return 0; // "Unlimited" in UI – you can treat as no hard cap
    case "enterprise":
      return 0; // Unlimited, negotiated
    default:
      return 0;
  }
}
