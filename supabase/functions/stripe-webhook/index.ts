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

const PLAN_CREDIT_MAP: Record<string, number> = {
  free:       20,
  starter:    100,
  pro:        300,
  elite:      1000,
  enterprise: 9999,
};

function normalizePlanId(planId: string): string {
  const map: Record<string, string> = {
    elite: "enterprise",
  };
  return map[planId] ?? planId;
}

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

  try {
    switch (event.type) {

      case "checkout.session.completed": {
        const session = event.data.object as Stripe.Checkout.Session;
        const userId = session.metadata?.user_id;
        const planId = session.metadata?.plan_id;
        const creditsStr = session.metadata?.credits;
        const customerId = session.customer as string;

        if (!userId) {
          console.error("[stripe-webhook] No user_id in session metadata");
          break;
        }

        if (session.mode === "subscription" && session.subscription) {
          const sub = await stripe.subscriptions.retrieve(session.subscription as string);
          const dbPlanId = planId ? normalizePlanId(planId) : "pro";
          const monthlyCredits = PLAN_CREDIT_MAP[planId ?? "pro"] ?? 100;

          await db.from("profiles").update({
            plan_id:             dbPlanId,
            stripe_customer_id:  customerId,
            subscription_id:     sub.id,
            subscription_status: sub.status,
          }).eq("id", userId);

          await db.from("subscriptions").upsert({
            user_id:                userId,
            stripe_subscription_id: sub.id,
            stripe_price_id:        sub.items.data[0]?.price?.id ?? null,
            stripe_product_id:      sub.items.data[0]?.price?.product as string ?? null,
            plan_id:                dbPlanId,
            status:                 sub.status,
            monthly_credits:        monthlyCredits,
            current_period_start:   new Date((sub.current_period_start as number) * 1000).toISOString(),
            current_period_end:     new Date((sub.current_period_end as number) * 1000).toISOString(),
            updated_at:             new Date().toISOString(),
          }, { onConflict: "user_id" });

          await db.from("credit_transactions").insert({
            user_id: userId,
            amount:  monthlyCredits,
            reason:  `subscription_grant:${planId ?? "pro"}`,
          });

          await db.from("profiles").update({
            credits: monthlyCredits,
            credits_reset_at: new Date().toISOString(),
            credits_used_this_month: 0,
          }).eq("id", userId);

        } else if (session.mode === "payment" && creditsStr) {
          const credits = parseInt(creditsStr, 10);
          if (credits > 0) {
            const { data: profileData } = await db
              .from("profiles")
              .select("credits")
              .eq("id", userId)
              .single();

            const currentCredits = (profileData?.credits as number) ?? 0;

            await db.from("profiles").update({
              credits: currentCredits + credits,
              stripe_customer_id: customerId,
            }).eq("id", userId);

            await db.from("credit_transactions").insert({
              user_id: userId,
              amount:  credits,
              reason:  `purchase:credits_pack`,
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
          status:                 newStatus,
          current_period_start:   new Date((sub.current_period_start as number) * 1000).toISOString(),
          current_period_end:     new Date((sub.current_period_end as number) * 1000).toISOString(),
          cancel_at:              cancelAtPeriodEnd && sub.cancel_at
                                    ? new Date((sub.cancel_at as number) * 1000).toISOString()
                                    : null,
          canceled_at:            sub.canceled_at
                                    ? new Date((sub.canceled_at as number) * 1000).toISOString()
                                    : null,
          updated_at:             new Date().toISOString(),
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
          credits:             PLAN_CREDIT_MAP.free,
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
          status: "past_due",
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
