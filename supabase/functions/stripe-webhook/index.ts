import Stripe from "https://esm.sh/stripe@14.21.0?target=deno&deno-std=0.132.0";
import { corsHeaders } from "../_shared/cors.ts";
import { createServiceClient } from "../_shared/supabase.ts";

// ─────────────────────────────────────────────────────────────────────────────
// stripe-webhook — Handle Stripe webhook events
//
// Register this function's URL in Stripe Dashboard → Webhooks.
// Events handled:
//   checkout.session.completed
//   customer.subscription.updated
//   customer.subscription.deleted
//   invoice.payment_failed
//
// Required env vars:
//   STRIPE_SECRET_KEY
//   STRIPE_WEBHOOK_SECRET
// ─────────────────────────────────────────────────────────────────────────────

const FREE_CREDITS = 20;

const VALID_PLAN_IDS = new Set(["free", "starter", "pro", "elite", "enterprise"]);

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  const stripeKey = Deno.env.get("STRIPE_SECRET_KEY");
  const webhookSecret = Deno.env.get("STRIPE_WEBHOOK_SECRET");

  if (!stripeKey || !webhookSecret) {
    return new Response(
      JSON.stringify({ error: "Stripe not configured" }),
      { status: 503, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }

  const stripe = new Stripe(stripeKey, {
    apiVersion: "2024-04-10",
    httpClient: Stripe.createFetchHttpClient(),
  });

  const db = createServiceClient();

  const body = await req.text();
  const sig = req.headers.get("stripe-signature");

  let event: Stripe.Event;
  try {
    event = await stripe.webhooks.constructEventAsync(body, sig!, webhookSecret);
  } catch (err) {
    console.error("[stripe-webhook] Signature verification failed:", err);
    return new Response(
      JSON.stringify({ error: "Invalid signature" }),
      { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }

  // ── Idempotency guard ───────────────────────────────────────────────────────
  // Check if we've already processed this Stripe event ID. Uses credit_transactions
  // with action = "stripe_event:<event.id>" as the idempotency record.
  // For non-credit events (subscription/status updates), use a no-op guard approach
  // — those updates are safe to replay (they're idempotent by nature).
  const isPaymentEvent = event.type === "checkout.session.completed" &&
    (event.data.object as Stripe.Checkout.Session).mode === "payment";

  if (isPaymentEvent) {
    const { data: existing } = await db
      .from("credit_transactions")
      .select("id")
      .eq("action", `stripe_event:${event.id}`)
      .maybeSingle();

    if (existing) {
      console.log(`[stripe-webhook] Event ${event.id} already processed — skipping`);
      return new Response(
        JSON.stringify({ received: true, skipped: "duplicate" }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }
  }

  try {
    switch (event.type) {

      case "checkout.session.completed": {
        const session = event.data.object as Stripe.Checkout.Session;
        const userId = session.metadata?.user_id;
        const customerId = session.customer as string;

        if (!userId) {
          console.error("[stripe-webhook] No user_id in session metadata");
          break;
        }

        if (session.mode === "subscription" && session.subscription) {
          const sub = await stripe.subscriptions.retrieve(session.subscription as string);
          const rawPlanId = session.metadata?.plan_id ?? "pro";
          const dbPlanId = VALID_PLAN_IDS.has(rawPlanId) ? rawPlanId : "pro";
          const monthlyCredits = parseInt(session.metadata?.monthly_credits ?? "100", 10) || 100;

          await db.from("profiles").update({
            plan_id:             dbPlanId,
            stripe_customer_id:  customerId,
            subscription_id:     sub.id,
            subscription_status: sub.status,
          }).eq("id", userId);

          const stripePriceItem = sub.items.data[0]?.price;
          const monthlyAmountCents = stripePriceItem?.unit_amount ?? null;

          await db.from("subscriptions").upsert({
            user_id:                userId,
            stripe_subscription_id: sub.id,
            stripe_price_id:        stripePriceItem?.id ?? null,
            stripe_product_id:      stripePriceItem?.product as string ?? null,
            plan_id:                dbPlanId,
            status:                 sub.status,
            monthly_credits:        monthlyCredits,
            monthly_amount_cents:   monthlyAmountCents,
            current_period_start:   new Date((sub.current_period_start as number) * 1000).toISOString(),
            current_period_end:     new Date((sub.current_period_end as number) * 1000).toISOString(),
            updated_at:             new Date().toISOString(),
          }, { onConflict: "user_id" });

          // Subscription grants reset the credit pool — idempotent by design
          // (we set an absolute value, not an increment).
          await db.from("credit_transactions").insert({
            user_id: userId,
            amount:  monthlyCredits,
            action:  `subscription_grant:${dbPlanId}`,
          });

          await db.from("profiles").update({
            credits: monthlyCredits,
            credits_reset_at: new Date().toISOString(),
            credits_used_this_month: 0,
          }).eq("id", userId);

        } else if (session.mode === "payment" && session.metadata?.credits) {
          const credits = parseInt(session.metadata.credits, 10);
          if (credits > 0) {
            // Insert idempotency sentinel FIRST (unique on action = stripe_event:<id>).
            // If this insert fails due to a duplicate (concurrent retry), we bail cleanly.
            const { error: sentinelError } = await db.from("credit_transactions").insert({
              user_id: userId,
              amount:  0,
              action:  `stripe_event:${event.id}`,
            });

            if (sentinelError) {
              console.warn(`[stripe-webhook] Idempotency sentinel failed for ${event.id} — possible duplicate; skipping credit grant`);
              break;
            }

            // Atomic increment using Postgres expression via RPC.
            // Falls back to read-then-write if increment_profile_credits RPC is unavailable.
            const { error: rpcError } = await db.rpc("increment_profile_credits", {
              p_user_id:    userId,
              p_credits:    credits,
              p_customer_id: customerId,
            });

            if (rpcError) {
              console.warn("[stripe-webhook] RPC unavailable, falling back to update:", rpcError.message);
              // Fallback: still better than raw read-then-write because the sentinel
              // above prevents double-application from webhook retries.
              await db.from("profiles")
                .update({ stripe_customer_id: customerId })
                .eq("id", userId);

              await db.rpc("increment_credits_fallback", {
                p_user_id: userId,
                p_delta:   credits,
              }).catch(() => null);
            }

            await db.from("credit_transactions").insert({
              user_id: userId,
              amount:  credits,
              action:  `purchase:credits_pack`,
            });
          }
        }
        break;
      }

      case "customer.subscription.updated": {
        const sub = event.data.object as Stripe.Subscription;
        const customerId = sub.customer as string;

        const { data: profileData } = await db
          .from("profiles")
          .select("id, plan_id")
          .eq("stripe_customer_id", customerId)
          .maybeSingle();

        if (!profileData) break;

        const newStatus = sub.status;
        const cancelAtPeriodEnd = sub.cancel_at_period_end;

        await db.from("profiles").update({
          subscription_status: newStatus,
        }).eq("id", profileData.id);

        await db.from("subscriptions").update({
          status:               newStatus,
          current_period_start: new Date((sub.current_period_start as number) * 1000).toISOString(),
          current_period_end:   new Date((sub.current_period_end as number) * 1000).toISOString(),
          cancel_at:            cancelAtPeriodEnd && sub.cancel_at
                                  ? new Date((sub.cancel_at as number) * 1000).toISOString()
                                  : null,
          canceled_at:          sub.canceled_at
                                  ? new Date((sub.canceled_at as number) * 1000).toISOString()
                                  : null,
          updated_at:           new Date().toISOString(),
        }).eq("user_id", profileData.id);

        break;
      }

      case "customer.subscription.deleted": {
        const sub = event.data.object as Stripe.Subscription;
        const customerId = sub.customer as string;

        const { data: profileData } = await db
          .from("profiles")
          .select("id")
          .eq("stripe_customer_id", customerId)
          .maybeSingle();

        if (!profileData) break;

        await db.from("profiles").update({
          plan_id:             "free",
          subscription_id:     null,
          subscription_status: "canceled",
          credits:             FREE_CREDITS,
          credits_used_this_month: 0,
          credits_reset_at:    new Date().toISOString(),
        }).eq("id", profileData.id);

        await db.from("subscriptions").update({
          status:      "canceled",
          canceled_at: new Date().toISOString(),
          updated_at:  new Date().toISOString(),
        }).eq("user_id", profileData.id);

        break;
      }

      case "invoice.payment_failed": {
        const invoice = event.data.object as Stripe.Invoice;
        const customerId = invoice.customer as string;

        const { data: profileData } = await db
          .from("profiles")
          .select("id")
          .eq("stripe_customer_id", customerId)
          .maybeSingle();

        if (!profileData) break;

        await db.from("profiles").update({
          subscription_status: "past_due",
        }).eq("id", profileData.id);

        await db.from("subscriptions").update({
          status:     "past_due",
          updated_at: new Date().toISOString(),
        }).eq("user_id", profileData.id);

        break;
      }
    }

    return new Response(
      JSON.stringify({ received: true }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    console.error("[stripe-webhook] Handler error:", message);
    return new Response(
      JSON.stringify({ error: message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
