// stripe-webhook/index.ts — Handles Stripe webhook events

import { handleCors, getCorsHeaders } from "../_shared/cors.ts";
import { PLAN_MONTHLY_CREDITS } from "../_shared/creditEconomics.ts";
import { createServiceClient } from "../_shared/supabase.ts";

const STRIPE_SECRET_KEY      = Deno.env.get("STRIPE_SECRET_KEY")      ?? "";
const STRIPE_WEBHOOK_SECRET  = Deno.env.get("STRIPE_WEBHOOK_SECRET")
  ?? Deno.env.get("STRIPE_WEBHOOK_SIGNING_SECRET")
  ?? "";

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

  // Reject stale timestamps (>5 min skew) to prevent replay attacks,
  // mirroring Stripe's official SDK behaviour.
  const nowSec = Math.floor(Date.now() / 1000);
  const tsSec  = parseInt(timestamp, 10);
  if (!Number.isFinite(tsSec) || Math.abs(nowSec - tsSec) > 300) {
    console.error("[stripe-webhook] Stale or invalid timestamp — possible replay attack");
    return false;
  }

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
// ─────────────────────────────────────────────────────────────────

function derivePlanId(metadata: Record<string, string> | null | undefined): string {
  const planId = metadata?.plan_id?.trim();
  if (!planId) {
    console.warn("[stripe-webhook] Missing plan_id in metadata — defaulting to free");
    return "free";
  }
  return planId;
}

type PricePlanEntitlement = {
  planId: string;
  monthlyCredits: number;
};

function buildPriceToPlanMap(): Map<string, PricePlanEntitlement> {
  const map = new Map<string, PricePlanEntitlement>();

  function add(envKey: string, planId: keyof typeof PLAN_MONTHLY_CREDITS): void {
    const priceId = Deno.env.get(envKey)?.trim();
    if (priceId) {
      map.set(priceId, {
        planId,
        monthlyCredits: PLAN_MONTHLY_CREDITS[planId],
      });
    }
  }

  add("STRIPE_PRICE_STARTER_MONTHLY", "starter");
  add("STRIPE_PRICE_STARTER_YEARLY", "starter");
  add("STRIPE_PRICE_PRO_MONTHLY", "pro");
  add("STRIPE_PRICE_PRO_YEARLY", "pro");
  add("STRIPE_PRICE_ELITE_MONTHLY", "elite");
  add("STRIPE_PRICE_ELITE_YEARLY", "elite");
  add("STRIPE_PRICE_ENTERPRISE_MONTHLY", "enterprise");
  add("STRIPE_PRICE_ENTERPRISE_YEARLY", "enterprise");

  return map;
}

const PRICE_TO_PLAN = buildPriceToPlanMap();

function resolvePlanFromPrice(
  priceId: string | null | undefined,
  priceMetadata: Record<string, string> | null | undefined,
  fallbackMetadata?: Record<string, string> | null,
): { planId: string; monthlyCredits: number } {
  const metaPlanId = priceMetadata?.plan_id?.trim() ?? fallbackMetadata?.plan_id?.trim();
  if (metaPlanId) {
    const credits =
      PLAN_MONTHLY_CREDITS[metaPlanId as keyof typeof PLAN_MONTHLY_CREDITS] ??
      PLAN_MONTHLY_CREDITS.free;
    return { planId: metaPlanId, monthlyCredits: credits };
  }

  if (priceId) {
    const mapped = PRICE_TO_PLAN.get(priceId);
    if (mapped) {
      return mapped;
    }
    console.warn(
      `[stripe-webhook] Unknown Stripe price ${priceId} — defaulting plan to free`,
    );
  } else {
    console.warn("[stripe-webhook] No price id on subscription — defaulting plan to free");
  }

  return { planId: "free", monthlyCredits: PLAN_MONTHLY_CREDITS.free };
}

function stripeTimestampToIso(unixSeconds: number | null | undefined): string | null {
  if (typeof unixSeconds !== "number" || !Number.isFinite(unixSeconds)) {
    return null;
  }
  return new Date(unixSeconds * 1000).toISOString();
}

// ─────────────────────────────────────────────────────────────────
// Helper: idempotency guard via idempotency_log table
// Returns true if this is the first time processing the event.
// ─────────────────────────────────────────────────────────────────

async function ensureIdempotent(
  db: ReturnType<typeof createServiceClient>,
  eventId: string,
): Promise<boolean> {
  const { data, error } = await db
    .from("idempotency_log")
    .insert({ key: `stripe_event_${eventId}`, created_at: new Date().toISOString() })
    .select("key")
    .single();

  if (error?.code === "23505") return false; // unique violation → already processed
  if (error) throw error;
  return true;
}

// ─────────────────────────────────────────────────────────────────
// Handler
// ─────────────────────────────────────────────────────────────────

Deno.serve(async (req) => {
  // Note: Stripe webhooks are server-to-server (no Origin header),
  // but we still handle OPTIONS for any proxy/testing scenarios.
  const cors = handleCors(req);
  if (cors) return cors;

  const headers = getCorsHeaders(req);

  if (!STRIPE_SECRET_KEY) {
    console.error("[stripe-webhook] STRIPE_SECRET_KEY not configured");
    return new Response(
      JSON.stringify({ error: "Stripe not configured" }),
      { status: 503, headers: { ...headers, "Content-Type": "application/json" } },
    );
  }

  // SECURITY: Hard-fail if webhook secret is missing. We must NEVER process
  // payment events without verifying the signature — accepting unsigned
  // webhooks would let any attacker mint subscriptions or credit grants.
  if (!STRIPE_WEBHOOK_SECRET) {
    console.error(
      "[stripe-webhook] STRIPE_WEBHOOK_SECRET not configured — refusing to process events. " +
      "Set this secret in the Edge Function environment before going live.",
    );
    return new Response(
      JSON.stringify({ error: "Webhook secret not configured" }),
      { status: 503, headers: { ...headers, "Content-Type": "application/json" } },
    );
  }

  const db = createServiceClient();

  try {
    const rawBody  = await req.text();
    const signature = req.headers.get("stripe-signature") ?? "";

    if (!signature) {
      console.error("[stripe-webhook] Missing stripe-signature header");
      return new Response(
        JSON.stringify({ error: "Missing signature" }),
        { status: 400, headers: { ...headers, "Content-Type": "application/json" } },
      );
    }

    const valid = await verifyStripeSignature(rawBody, signature, STRIPE_WEBHOOK_SECRET);
    if (!valid) {
      console.error("[stripe-webhook] Invalid webhook signature — rejecting event");
      return new Response(
        JSON.stringify({ error: "Invalid signature" }),
        { status: 400, headers: { ...headers, "Content-Type": "application/json" } },
      );
    }

    const event     = JSON.parse(rawBody);
    const eventType = event.type as string;

    console.log(`[stripe-webhook] Processing: ${eventType} (id: ${event.id})`);

    const isNew = await ensureIdempotent(db, event.id);
    if (!isNew) {
      console.log(`[stripe-webhook] Duplicate event ${event.id} — skipping`);
      return new Response(
        JSON.stringify({ received: true, duplicate: true }),
        { status: 200, headers: { ...headers, "Content-Type": "application/json" } },
      );
    }

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

        const linkedProfile = await getProfileByCustomer(db, customerId);
        if (linkedProfile && linkedProfile.id !== userId) {
          console.error(
            `[stripe-webhook] checkout.session.completed: user_id mismatch — metadata=${userId}, customer profile=${linkedProfile.id}`,
          );
          break;
        }

        const creditAmount = metadata.credit_amount ? parseInt(metadata.credit_amount, 10) : 0;
        const isCreditPurchase = creditAmount > 0 && !subscriptionId;
        const planId = derivePlanId(metadata);

        if (isCreditPurchase) {
          await db.from("profiles").update({
            stripe_customer_id: customerId,
            updated_at: new Date().toISOString(),
          }).eq("id", userId);
        } else {
          await db.from("profiles").update({
            stripe_customer_id:  customerId,
            subscription_id:     subscriptionId,
            subscription_status: "active",
            plan_id:             planId,
            updated_at:          new Date().toISOString(),
          }).eq("id", userId);
        }

        if (subscriptionId) {
          await db.from("subscriptions").upsert({
            user_id:                userId,
            stripe_subscription_id: subscriptionId,
            plan_id:                planId,
            status:                 "active",
            updated_at:             new Date().toISOString(),
          }, { onConflict: "user_id" });
        }

        // One-time credit top-up (credit pack purchase) — idempotent via stripe_payment_id
        if (creditAmount > 0) {
          const amount = creditAmount;
          const paymentId = (session.payment_intent as string | null) ?? session.id;
          if (amount > 0 && paymentId) {
            const { data: existing } = await db
              .from("credit_transactions")
              .select("id")
              .eq("stripe_payment_id", paymentId)
              .maybeSingle();

            if (!existing) {
              await db.rpc("add_credits", {
                p_user_id:    userId,
                p_amount:     amount,
                p_action:     "purchase",
                p_description: `Purchased ${amount} credits`,
                p_payment_id: paymentId,
              });
            } else {
              console.log(`[stripe-webhook] Skipping duplicate credit grant for ${paymentId}`);
            }
          }
        }

        console.log(`[stripe-webhook] checkout.session.completed — user: ${userId}, plan: ${planId}`);
        break;
      }

      // ── Invoice paid → keep subscription active, reset monthly credits ──
      case "invoice.paid": {
        const invoice        = event.data.object;
        const customerId     = invoice.customer     as string;
        const subscriptionId = invoice.subscription as string | null;

        if (!subscriptionId) break;

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

        // Monthly subscription credit refresh on renewal (invoice.paid fires each billing cycle).
        // Grants plan credits via add_credits RPC; idempotent on invoice.id prevents double-grant.
        const monthlyCredits = parseInt(
          (invoice.lines?.data?.[0]?.metadata?.monthly_credits as string) ?? "0",
          10,
        ) || PLAN_MONTHLY_CREDITS.pro;
        if (monthlyCredits > 0 && invoice.id) {
          const { data: existing } = await db
            .from("credit_transactions")
            .select("id")
            .eq("stripe_payment_id", invoice.id)
            .maybeSingle();
          if (!existing) {
            await db.rpc("add_credits", {
              p_user_id:    profile.id,
              p_amount:     monthlyCredits,
              p_action:     "subscription_grant",
              p_description: `Monthly subscription credits`,
              p_payment_id: invoice.id,
            });
          }
        }

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

        const priceItem = subscription.items?.data?.[0];
        const priceId = (priceItem?.price?.id as string | undefined) ?? null;
        const priceMetadata = (priceItem?.price?.metadata ?? {}) as Record<string, string>;
        const subMetadata = (subscription.metadata ?? {}) as Record<string, string>;
        const { planId, monthlyCredits } = resolvePlanFromPrice(
          priceId,
          priceMetadata,
          subMetadata,
        );

        const status = subscription.cancel_at_period_end
          ? "canceling"
          : (subscription.status as string);

        const trialStart = stripeTimestampToIso(subscription.trial_start);
        const trialEnd = stripeTimestampToIso(subscription.trial_end);

        await db.from("profiles").update({
          subscription_status: status,
          plan_id:             planId,
          updated_at:          new Date().toISOString(),
        }).eq("id", profile.id);

        const subscriptionUpdate: Record<string, unknown> = {
          status,
          plan_id:          planId,
          stripe_price_id:  priceId,
          monthly_credits:  monthlyCredits,
          cancel_at: subscription.cancel_at
            ? new Date(subscription.cancel_at * 1000).toISOString()
            : null,
          updated_at: new Date().toISOString(),
        };

        if (trialStart !== null) {
          subscriptionUpdate.trial_start = trialStart;
        }
        if (trialEnd !== null) {
          subscriptionUpdate.trial_end = trialEnd;
        }

        await db.from("subscriptions").update(subscriptionUpdate).eq("user_id", profile.id);

        console.log(
          `[stripe-webhook] subscription.updated — customer: ${customerId}, status: ${status}, plan: ${planId}`,
        );
        break;
      }

      // ── Payment failed → dunning: grace period then downgrade ──
      case "invoice.payment_failed": {
        const invoice    = event.data.object;
        const customerId = invoice.customer as string;

        const { data: failedProfile } = await db
          .from("profiles")
          .select("id, plan_id")
          .eq("stripe_customer_id", customerId)
          .single();
        if (!failedProfile) break;

        const nowIso = new Date().toISOString();

        if ((invoice.attempt_count ?? 0) >= 3) {
          await db.from("profiles").update({
            plan_id:             "free",
            credits:             PLAN_MONTHLY_CREDITS.free,
            subscription_status: "past_due",
            payment_failed_at:   nowIso,
            updated_at:          nowIso,
          }).eq("id", failedProfile.id);

          await db.from("subscriptions").update({
            status:     "past_due",
            plan_id:    "free",
            updated_at: nowIso,
          }).eq("user_id", failedProfile.id);

          await db.from("audit_logs").insert({
            user_id: failedProfile.id,
            action:  "payment_downgrade",
            details: {
              reason: "payment_failed_3x",
              previous_plan: failedProfile.plan_id,
              attempt_count: invoice.attempt_count,
            },
          });

          console.log(`[stripe-webhook] invoice.payment_failed — downgraded customer: ${customerId}`);
        } else {
          await db.from("profiles").update({
            subscription_status: "past_due",
            payment_failed_at:   nowIso,
            updated_at:          nowIso,
          }).eq("id", failedProfile.id);

          await db.from("subscriptions").update({
            status:     "past_due",
            updated_at: nowIso,
          }).eq("user_id", failedProfile.id);

          console.log(
            `[stripe-webhook] invoice.payment_failed — grace period, attempt ${invoice.attempt_count ?? 1}, customer: ${customerId}`,
          );
        }
        break;
      }

      default:
        console.log(`[stripe-webhook] Unhandled event type: ${eventType}`);
    }

    return new Response(
      JSON.stringify({ received: true }),
      { status: 200, headers: { ...headers, "Content-Type": "application/json" } },
    );

  } catch (err) {
    console.error("[stripe-webhook] Unhandled error:", err);
    return new Response(
      JSON.stringify({ error: "Internal server error" }),
      { status: 500, headers: { ...headers, "Content-Type": "application/json" } },
    );
  }
});
