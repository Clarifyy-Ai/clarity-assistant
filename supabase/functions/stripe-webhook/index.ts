// stripe-webhook/index.ts — Handles Stripe webhook events

import { corsHeaders } from "../_shared/cors.ts";
import { createServiceClient } from "../_shared/supabase.ts";

const STRIPE_SECRET_KEY      = Deno.env.get("STRIPE_SECRET_KEY")      ?? "";
const STRIPE_WEBHOOK_SECRET  = Deno.env.get("STRIPE_WEBHOOK_SECRET")  ?? "";

// ─────────────────────────────────────────────────────────────────
// Constant-time HMAC-SHA256 verification (prevents timing attacks)
// ─────────────────────────────────────────────────────────────────

async function verifyStripeSignature(
  payload:   string,
  signature: string,
  secret:    string,
): Promise<boolean> {
  const parts         = signature.split(",");
  const timestampPart = parts.find((p) => p.startsWith("t="));
  const sigPart       = parts.find((p) => p.startsWith("v1="));

  if (!timestampPart || !sigPart) {
    console.error("[stripe-webhook] Malformed stripe-signature header");
    return false;
  }

  const timestamp     = timestampPart.slice(2);
  const expectedSig   = sigPart.slice(3);
  const signedPayload = `${timestamp}.${payload}`;

  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );

  const sigBytes = await crypto.subtle.sign(
    "HMAC",
    key,
    new TextEncoder().encode(signedPayload),
  );

  const hexSig = Array.from(new Uint8Array(sigBytes))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");

  // Constant-time comparison — avoids early-exit timing oracle
  if (hexSig.length !== expectedSig.length) return false;
  let diff = 0;
  for (let i = 0; i < hexSig.length; i++) {
    diff |= hexSig.charCodeAt(i) ^ expectedSig.charCodeAt(i);
  }
  return diff === 0;
}

// ─────────────────────────────────────────────────────────────────
// Helper: look up a profile by Stripe customer ID
// ─────────────────────────────────────────────────────────────────

async function getProfileByCustomer(
  db: ReturnType<typeof createServiceClient>,
  customerId: string,
): Promise<{ id: string } | null> {
  const { data } = await db
    .from("profiles")
    .select("id")
    .eq("stripe_customer_id", customerId)
    .single();
  return data ?? null;
}

// ─────────────────────────────────────────────────────────────────
// Helper: map Stripe subscription status → plan_id
// Falls back to reading price metadata if available.
// ─────────────────────────────────────────────────────────────────

function derivePlanId(metadata: Record<string, string>): string {
  return metadata?.plan_id ?? "pro";
}

// ─────────────────────────────────────────────────────────────────
// Handler
// ─────────────────────────────────────────────────────────────────

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (!STRIPE_SECRET_KEY) {
    console.error("[stripe-webhook] STRIPE_SECRET_KEY not configured");
    return new Response(
      JSON.stringify({ error: "Stripe not configured" }),
      { status: 503, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }

  // Warn loudly in logs if webhook secret is absent — never silently skip
  if (!STRIPE_WEBHOOK_SECRET) {
    console.warn(
      "[stripe-webhook] STRIPE_WEBHOOK_SECRET is not set — " +
      "signature verification is DISABLED. Set this in production.",
    );
  }

  const db = createServiceClient();

  try {
    const rawBody  = await req.text();
    const signature = req.headers.get("stripe-signature") ?? "";

    // Verify webhook signature (required in production)
    if (STRIPE_WEBHOOK_SECRET) {
      const valid = await verifyStripeSignature(rawBody, signature, STRIPE_WEBHOOK_SECRET);
      if (!valid) {
        console.error("[stripe-webhook] Invalid webhook signature — rejecting event");
        return new Response(
          JSON.stringify({ error: "Invalid signature" }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      }
    }

    const event     = JSON.parse(rawBody);
    const eventType = event.type as string;

    console.log(`[stripe-webhook] Processing: ${eventType} (id: ${event.id})`);

    switch (eventType) {

      // ── Checkout completed → activate subscription or credit purchase ──
      case "checkout.session.completed": {
        const session        = event.data.object;
        const customerId     = session.customer     as string;
        const subscriptionId = session.subscription as string | null;
        const metadata       = (session.metadata ?? {}) as Record<string, string>;
        const userId         = metadata.user_id;

        if (!userId) {
          console.error("[stripe-webhook] checkout.session.completed: no user_id in metadata");
          break;
        }

        const planId = derivePlanId(metadata);

        // Activate subscription on profile
        await db.from("profiles").update({
          stripe_customer_id:  customerId,
          subscription_id:     subscriptionId,
          subscription_status: "active",
          plan:                planId,   // keep both plan + plan_id in sync
          plan_id:             planId,
          updated_at:          new Date().toISOString(),
        }).eq("id", userId);

        // Upsert subscription record
        if (subscriptionId) {
          await db.from("subscriptions").upsert({
            user_id:                userId,
            stripe_customer_id:     customerId,
            stripe_subscription_id: subscriptionId,
            plan_id:                planId,
            status:                 "active",
            updated_at:             new Date().toISOString(),
          }, { onConflict: "user_id" });
        }

        // One-time credit top-up (credit pack purchase)
        if (metadata.credit_amount) {
          const amount = parseInt(metadata.credit_amount, 10);
          if (amount > 0) {
            await db.rpc("add_credits", {
              p_user_id:    userId,
              p_amount:     amount,
              p_action:     "purchase",
              p_description: `Purchased ${amount} credits`,
              p_payment_id: session.payment_intent ?? null,
            });
          }
        }

        console.log(`[stripe-webhook] checkout.session.completed — user: ${userId}, plan: ${planId}`);
        break;
      }

      // ── Invoice paid → keep subscription active, reset monthly credits ──
      // Stripe fires `invoice.paid` for both initial payment AND renewals.
      case "invoice.paid": {
        const invoice        = event.data.object;
        const customerId     = invoice.customer     as string;
        const subscriptionId = invoice.subscription as string | null;

        if (!subscriptionId) break; // one-off invoice, not a subscription renewal

        const profile = await getProfileByCustomer(db, customerId);
        if (!profile) {
          console.warn(`[stripe-webhook] invoice.paid: no profile for customer ${customerId}`);
          break;
        }

        await db.from("profiles").update({
          subscription_status:    "active",
          credits_used_this_month: 0,
          credits_reset_at:       new Date().toISOString(),
          updated_at:             new Date().toISOString(),
        }).eq("id", profile.id);

        await db.from("subscriptions").update({
          status:     "active",
          updated_at: new Date().toISOString(),
        }).eq("user_id", profile.id);

        console.log(`[stripe-webhook] invoice.paid — customer: ${customerId}`);
        break;
      }

      // ── Subscription deleted → downgrade to free ──
      case "customer.subscription.deleted": {
        const subscription = event.data.object;
        const customerId   = subscription.customer as string;

        const profile = await getProfileByCustomer(db, customerId);
        if (!profile) {
          console.warn(`[stripe-webhook] subscription.deleted: no profile for ${customerId}`);
          break;
        }

        await db.from("profiles").update({
          plan:                "free",
          plan_id:             "free",
          subscription_status: "canceled",
          subscription_id:     null,
          updated_at:          new Date().toISOString(),
        }).eq("id", profile.id);

        await db.from("subscriptions").update({
          status:     "canceled",
          plan_id:    "free",
          cancel_at:  new Date().toISOString(),
          updated_at: new Date().toISOString(),
        }).eq("user_id", profile.id);

        console.log(`[stripe-webhook] subscription.deleted — customer: ${customerId}`);
        break;
      }

      // ── Subscription updated → sync status + cancellation flag ──
      case "customer.subscription.updated": {
        const subscription = event.data.object;
        const customerId   = subscription.customer as string;

        const profile = await getProfileByCustomer(db, customerId);
        if (!profile) break;

        // If scheduled to cancel at period end, show "canceling" rather than "active"
        const status = subscription.cancel_at_period_end
          ? "canceling"
          : (subscription.status as string);

        await db.from("profiles").update({
          subscription_status: status,
          updated_at:          new Date().toISOString(),
        }).eq("id", profile.id);

        await db.from("subscriptions").update({
          status,
          cancel_at: subscription.cancel_at
            ? new Date(subscription.cancel_at * 1000).toISOString()
            : null,
          updated_at: new Date().toISOString(),
        }).eq("user_id", profile.id);

        console.log(`[stripe-webhook] subscription.updated — customer: ${customerId}, status: ${status}`);
        break;
      }

      // ── Payment failed → mark past_due so UI can warn user ──
      case "invoice.payment_failed": {
        const invoice    = event.data.object;
        const customerId = invoice.customer as string;

        const profile = await getProfileByCustomer(db, customerId);
        if (!profile) break;

        await db.from("profiles").update({
          subscription_status: "past_due",
          updated_at:          new Date().toISOString(),
        }).eq("id", profile.id);

        await db.from("subscriptions").update({
          status:     "past_due",
          updated_at: new Date().toISOString(),
        }).eq("user_id", profile.id);

        console.log(`[stripe-webhook] invoice.payment_failed — customer: ${customerId}`);
        break;
      }

      default:
        console.log(`[stripe-webhook] Unhandled event type: ${eventType}`);
    }

    return new Response(
      JSON.stringify({ received: true }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );

  } catch (err) {
    console.error("[stripe-webhook] Unhandled error:", err);
    return new Response(
      JSON.stringify({ error: err instanceof Error ? err.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
