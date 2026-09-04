/**
 * Shared Razorpay capture fulfillment (webhook + checkout verify).
 * Catalog credits only. Grant before marking paid. Idempotent by payment id.
 */
import { createServiceClient } from "./supabase.ts";
import {
  creditsForRazorpayProductType,
  planIdForRazorpayProductType,
  monthlyCreditsForPlan,
} from "./billingCatalog.ts";
import {
  assertPaymentStatusTransition,
  type PaymentOrderStatus,
} from "./paymentStateMachine.ts";

type Db = ReturnType<typeof createServiceClient>;

export type PaymentOrderRow = {
  id: string;
  user_id: string;
  product_type: string;
  status: string;
  promo_code_id: string | null;
  promo_code: string | null;
};

const WEBHOOK_EVENT_TTL_MS = 365 * 24 * 60 * 60 * 1000;
const PAYMENT_CLAIM_TTL_MS = 7 * 24 * 60 * 60 * 1000;

async function grantCreditsOnce(
  db: Db,
  opts: {
    userId: string;
    amount: number;
    action: string;
    description: string;
    paymentId: string;
  },
): Promise<{ ok: true; duplicate: boolean } | { ok: false; error: string }> {
  if (opts.amount <= 0) return { ok: true, duplicate: false };

  const { data: existing } = await db
    .from("credit_transactions")
    .select("id")
    .eq("stripe_payment_id", opts.paymentId)
    .maybeSingle();
  if (existing) return { ok: true, duplicate: true };

  const { error } = await db.rpc("add_credits", {
    p_user_id: opts.userId,
    p_amount: opts.amount,
    p_action: opts.action,
    p_description: opts.description,
    p_payment_id: opts.paymentId,
  });
  if (error) {
    if ((error as { code?: string }).code === "23505") {
      return { ok: true, duplicate: true };
    }
    return { ok: false, error: error.message };
  }
  return { ok: true, duplicate: false };
}

export async function claimPaymentIdempotency(
  db: Db,
  paymentId: string,
): Promise<boolean> {
  const { error } = await db
    .from("idempotency_log")
    .insert({
      key: `razorpay_payment_${paymentId}`,
      created_at: new Date().toISOString(),
      expires_at: new Date(Date.now() + PAYMENT_CLAIM_TTL_MS).toISOString(),
      metadata: { provider: "razorpay", kind: "payment_fulfill" },
    })
    .select("key")
    .single();
  if (error?.code === "23505") return false;
  if (error) throw error;
  return true;
}

export async function releasePaymentIdempotency(db: Db, paymentId: string): Promise<void> {
  await db.from("idempotency_log").delete().eq("key", `razorpay_payment_${paymentId}`);
}

/** Replay-safe webhook dedupe by Razorpay event id (refunds + captures). */
export async function claimRazorpayWebhookEvent(
  db: Db,
  eventId: string,
): Promise<boolean> {
  const key = `razorpay_webhook_${eventId}`;
  const { error } = await db
    .from("idempotency_log")
    .insert({
      key,
      created_at: new Date().toISOString(),
      expires_at: new Date(Date.now() + WEBHOOK_EVENT_TTL_MS).toISOString(),
      metadata: { provider: "razorpay", kind: "webhook_event" },
    })
    .select("key")
    .single();
  if (error?.code === "23505") return false;
  if (error) throw error;
  return true;
}

/** Mark an open checkout order failed — no credits granted. */
export async function markFailedRazorpayOrder(
  db: Db,
  opts: { orderId: string; currentStatus: string },
): Promise<{ duplicate: boolean }> {
  const current = opts.currentStatus as PaymentOrderStatus;
  if (current === "failed" || current === "cancelled") {
    return { duplicate: true };
  }
  if (current === "fulfilled" || current === "paid" || current === "refunded") {
    return { duplicate: true };
  }
  assertPaymentStatusTransition(current, "failed");
  const { error } = await db
    .from("payment_orders")
    .update({ status: "failed" })
    .eq("id", opts.orderId);
  if (error) throw error;
  return { duplicate: false };
}

export async function fulfillCapturedRazorpayOrder(
  db: Db,
  opts: { order: PaymentOrderRow; paymentId: string },
): Promise<{ duplicate: boolean }> {
  const { order, paymentId } = opts;
  if (order.status === "paid" || order.status === "fulfilled") return { duplicate: true };

  const isNew = await claimPaymentIdempotency(db, paymentId);
  if (!isNew) return { duplicate: true };

  const priorStatus = order.status as PaymentOrderStatus;
  if (priorStatus !== "fulfilled" && priorStatus !== "paid") {
    assertPaymentStatusTransition(priorStatus, "fulfilled");
  }

  let grantCompleted = false;

  try {
    const userId = order.user_id;
    const productType = order.product_type;
    const catalogCredits = creditsForRazorpayProductType(productType);
    const planId = planIdForRazorpayProductType(productType);

    if (planId === "pro" || planId === "enterprise") {
      const monthlyCredits = monthlyCreditsForPlan(planId);
      const { error: profileErr } = await db.from("profiles").update({
        plan_id: planId,
        subscription_status: "active",
        payment_failed_at: null,
        credits_used_this_month: 0,
        credits_reset_at: new Date().toISOString(),
        pending_promo_code: null,
        updated_at: new Date().toISOString(),
      }).eq("id", userId);
      if (profileErr) throw new Error(`profile_update_failed: ${profileErr.message}`);

      const { error: subErr } = await db.from("subscriptions").upsert({
        user_id: userId,
        plan_id: planId,
        status: "active",
        monthly_credits: monthlyCredits,
        updated_at: new Date().toISOString(),
      }, { onConflict: "user_id" });
      if (subErr) throw new Error(`subscription_upsert_failed: ${subErr.message}`);

      const grant = await grantCreditsOnce(db, {
        userId,
        amount: monthlyCredits,
        action: "subscription_grant",
        description: `Razorpay subscription — ${planId}`,
        paymentId,
      });
      if (!grant.ok) throw new Error(`credit_grant_failed: ${grant.error}`);
      grantCompleted = grantCompleted || !grant.duplicate;
    } else if (catalogCredits > 0) {
      const grant = await grantCreditsOnce(db, {
        userId,
        amount: catalogCredits,
        action: "purchase",
        description: `Razorpay credit pack — ${productType}`,
        paymentId,
      });
      if (!grant.ok) throw new Error(`credit_grant_failed: ${grant.error}`);
      grantCompleted = grantCompleted || !grant.duplicate;
    }

    if (order.promo_code_id) {
      const { data: promo } = await db
        .from("promo_codes")
        .select("redemption_count, bonus_credits")
        .eq("id", order.promo_code_id)
        .maybeSingle();

      if (promo) {
        const bonus = (promo.bonus_credits ?? 0) as number;
        if (bonus > 0) {
          const bonusGrant = await grantCreditsOnce(db, {
            userId,
            amount: bonus,
            action: "bonus",
            description: `Promo bonus credits — ${order.promo_code}`,
            paymentId: `${paymentId}_promo`,
          });
          if (!bonusGrant.ok) throw new Error(`promo_credit_grant_failed: ${bonusGrant.error}`);
          grantCompleted = grantCompleted || !bonusGrant.duplicate;
        }

        const redeemKey = `razorpay_promo_redeem_${paymentId}`;
        const { error: redeemClaimErr } = await db
          .from("idempotency_log")
          .insert({
            key: redeemKey,
            created_at: new Date().toISOString(),
            expires_at: new Date(Date.now() + PAYMENT_CLAIM_TTL_MS).toISOString(),
            metadata: { provider: "razorpay", kind: "promo_redeem" },
          })
          .select("key")
          .single();

        if (!redeemClaimErr) {
          const { error: promoErr } = await db
            .from("promo_codes")
            .update({
              redemption_count: (promo.redemption_count ?? 0) + 1,
              updated_at: new Date().toISOString(),
            })
            .eq("id", order.promo_code_id);
          if (promoErr) {
            await db.from("idempotency_log").delete().eq("key", redeemKey);
            throw new Error(`promo_redemption_failed: ${promoErr.message}`);
          }
        } else if (redeemClaimErr.code !== "23505") {
          throw new Error(`promo_redeem_claim_failed: ${redeemClaimErr.message}`);
        }
      }

      await db
        .from("profiles")
        .update({ pending_promo_code: null, updated_at: new Date().toISOString() })
        .eq("id", userId);
    }

    const { data: marked, error: paidErr } = await db
      .from("payment_orders")
      .update({
        status: "fulfilled",
        provider_payment_id: paymentId,
        paid_at: new Date().toISOString(),
        fulfilled_at: new Date().toISOString(),
        credits_granted: catalogCredits,
      })
      .eq("id", order.id)
      .not("status", "in", "(paid,fulfilled)")
      .select("id")
      .maybeSingle();
    if (paidErr) throw new Error(`mark_paid_failed: ${paidErr.message}`);
    if (!marked?.id) return { duplicate: true };

    // Referral conversion tracking only — never grants a second credit (v1 policy).
    try {
      await db.rpc("mark_referral_converted", { p_referred_user_id: userId });
    } catch (convErr) {
      console.warn(
        "[razorpay-fulfill] mark_referral_converted:",
        convErr instanceof Error ? convErr.message.slice(0, 160) : "unknown",
      );
    }

    return { duplicate: false };
  } catch (error) {
    const { data: ledgerRow } = await db
      .from("credit_transactions")
      .select("id")
      .eq("stripe_payment_id", paymentId)
      .maybeSingle();
    const promoLedger = await db
      .from("credit_transactions")
      .select("id")
      .eq("stripe_payment_id", `${paymentId}_promo`)
      .maybeSingle();
    if (!ledgerRow?.id && !promoLedger.data?.id && !grantCompleted) {
      await releasePaymentIdempotency(db, paymentId);
    }
    throw error;
  }
}

export async function hmacSha256Hex(secret: string, payload: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(payload));
  return Array.from(new Uint8Array(sig))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

export function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) {
    diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return diff === 0;
}
