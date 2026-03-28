// stripe-webhook/index.ts — Handles Stripe webhook events

import { corsHeaders } from "../_shared/cors.ts";
import { createServiceClient } from "../_shared/supabase.ts";

const STRIPE_SECRET_KEY = Deno.env.get("STRIPE_SECRET_KEY") ?? "";
const STRIPE_WEBHOOK_SECRET = Deno.env.get("STRIPE_WEBHOOK_SECRET") ?? "";

async function verifyStripeSignature(
  payload: string,
  signature: string,
  secret: string
): Promise<boolean> {
  if (!secret) return true; // Skip verification if no webhook secret configured

  const parts = signature.split(",");
  const timestampPart = parts.find((p) => p.startsWith("t="));
  const sigPart = parts.find((p) => p.startsWith("v1="));

  if (!timestampPart || !sigPart) return false;

  const timestamp = timestampPart.slice(2);
  const expectedSig = sigPart.slice(3);

  const signedPayload = `${timestamp}.${payload}`;
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );

  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(signedPayload));
  const hexSig = Array.from(new Uint8Array(sig))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");

  return hexSig === expectedSig;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (!STRIPE_SECRET_KEY) {
    console.error("[stripe-webhook] STRIPE_SECRET_KEY not configured");
    return new Response(JSON.stringify({ error: "Stripe not configured" }), {
      status: 503, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const db = createServiceClient();

  try {
    const rawBody = await req.text();
    const signature = req.headers.get("stripe-signature") ?? "";

    // Verify webhook signature
    if (STRIPE_WEBHOOK_SECRET) {
      const valid = await verifyStripeSignature(rawBody, signature, STRIPE_WEBHOOK_SECRET);
      if (!valid) {
        console.error("[stripe-webhook] Invalid signature");
        return new Response(JSON.stringify({ error: "Invalid signature" }), {
          status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
    }

    const event = JSON.parse(rawBody);
    const eventType = event.type;

    console.log(`[stripe-webhook] Processing event: ${eventType}`);

    switch (eventType) {
      case "checkout.session.completed": {
        const session = event.data.object;
        const customerId = session.customer;
        const subscriptionId = session.subscription;
        const metadata = session.metadata ?? {};
        const userId = metadata.user_id;

        if (!userId) {
          console.error("[stripe-webhook] No user_id in checkout metadata");
          break;
        }

        // Update profile with Stripe IDs
        await db.from("profiles").update({
          stripe_customer_id: customerId,
          subscription_id: subscriptionId,
          subscription_status: "active",
          updated_at: new Date().toISOString(),
        }).eq("id", userId);

        // Update or create subscription record
        await db.from("subscriptions").upsert({
          user_id: userId,
          stripe_customer_id: customerId,
          stripe_subscription_id: subscriptionId,
          plan_id: metadata.plan_id ?? "pro",
          status: "active",
          updated_at: new Date().toISOString(),
        }, { onConflict: "user_id" });

        // If one-time credit purchase
        if (metadata.credit_amount) {
          const amount = parseInt(metadata.credit_amount, 10);
          if (amount > 0) {
            await db.rpc("add_credits", {
              p_user_id: userId,
              p_amount: amount,
              p_action: "purchase",
              p_description: `Purchased ${amount} credits`,
              p_payment_id: session.payment_intent,
            });
          }
        }

        console.log(`[stripe-webhook] checkout.session.completed for user ${userId}`);
        break;
      }

      case "invoice.paid": {
        const invoice = event.data.object;
        const customerId = invoice.customer;
        const subscriptionId = invoice.subscription;

        if (subscriptionId) {
          // Find user by stripe_customer_id
          const { data: profile } = await db.from("profiles")
            .select("id")
            .eq("stripe_customer_id", customerId)
            .single();

          if (profile) {
            await db.from("profiles").update({
              subscription_status: "active",
              updated_at: new Date().toISOString(),
            }).eq("id", profile.id);

            await db.from("subscriptions").update({
              status: "active",
              updated_at: new Date().toISOString(),
            }).eq("user_id", profile.id);

            // Reset monthly credits on renewal
            await db.from("profiles").update({
              credits_used_this_month: 0,
              credits_reset_at: new Date().toISOString(),
            }).eq("id", profile.id);
          }
        }

        console.log(`[stripe-webhook] invoice.paid for customer ${customerId}`);
        break;
      }

      case "customer.subscription.deleted": {
        const subscription = event.data.object;
        const customerId = subscription.customer;

        const { data: profile } = await db.from("profiles")
          .select("id")
          .eq("stripe_customer_id", customerId)
          .single();

        if (profile) {
          await db.from("profiles").update({
            plan_id: "free",
            subscription_status: "canceled",
            subscription_id: null,
            updated_at: new Date().toISOString(),
          }).eq("id", profile.id);

          await db.from("subscriptions").update({
            status: "canceled",
            plan_id: "free",
            cancel_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          }).eq("user_id", profile.id);
        }

        console.log(`[stripe-webhook] subscription.deleted for customer ${customerId}`);
        break;
      }

      case "customer.subscription.updated": {
        const subscription = event.data.object;
        const customerId = subscription.customer;

        const { data: profile } = await db.from("profiles")
          .select("id")
          .eq("stripe_customer_id", customerId)
          .single();

        if (profile) {
          const status = subscription.cancel_at_period_end ? "canceling" : subscription.status;
          await db.from("profiles").update({
            subscription_status: status,
            updated_at: new Date().toISOString(),
          }).eq("id", profile.id);

          await db.from("subscriptions").update({
            status,
            cancel_at: subscription.cancel_at
              ? new Date(subscription.cancel_at * 1000).toISOString()
              : null,
            updated_at: new Date().toISOString(),
          }).eq("user_id", profile.id);
        }
        break;
      }

      default:
        console.log(`[stripe-webhook] Unhandled event type: ${eventType}`);
    }

    return new Response(JSON.stringify({ received: true }), {
      status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("[stripe-webhook] Error:", err);
    return new Response(
      JSON.stringify({ error: err instanceof Error ? err.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
