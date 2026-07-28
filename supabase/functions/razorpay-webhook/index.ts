/**
 * Razorpay webhook — payment.captured → grant credits / upgrade plan.
 * Also handles refund.processed / refund.created / payment.refunded (P4-2).
 * Secret: RAZORPAY_WEBHOOK_SECRET
 *
 * Integrity rules (aligned with stripe-webhook):
 * - Credit amounts come from billingCatalog only (never client / order.credits_granted).
 * - Grant entitlements BEFORE marking payment_orders paid (retry can re-attempt grant).
 * - Idempotency: idempotency_log claim + credit_transactions.stripe_payment_id check.
 * - Ledger: add_credits RPC inserts credit_transactions (see migration add_credits).
 * - Refunds: set payment_orders.status='refunded'; claw back only if unspent balance covers grant.
 * - Do not log webhook secrets or full payloads.
 */
import { handleCors, getCorsHeaders } from "../_shared/cors.ts";
import { assertBillingConfigOrThrow } from "../_shared/billingConfig.ts";
import { opsLog } from "../_shared/opsLog.ts";
import { createServiceClient } from "../_shared/supabase.ts";
import { reportEdgeError } from "../_shared/errors.ts";
import {
  creditsForRazorpayProductType,
  planIdForRazorpayProductType,
  monthlyCreditsForPlan,
} from "../_shared/billingCatalog.ts";

const WEBHOOK_SECRET = Deno.env.get("RAZORPAY_WEBHOOK_SECRET") ?? "";

/**
 * P4-2: Only claw back when unspent balance covers the original grant.
 * Never blindly wipe the wallet.
 */
export function decideRefundClawback(opts: {
  currentBalance: number;
  creditsGranted: number;
}): {
  clawbackAmount: number;
  shouldClawback: boolean;
  reason: "full_clawback" | "insufficient_unspent" | "nothing_to_claw";
} {
  const balance = Math.max(0, Math.floor(opts.currentBalance));
  const granted = Math.max(0, Math.floor(opts.creditsGranted));
  if (granted <= 0) {
    return { clawbackAmount: 0, shouldClawback: false, reason: "nothing_to_claw" };
  }
  if (balance >= granted) {
    return { clawbackAmount: granted, shouldClawback: true, reason: "full_clawback" };
  }
  return { clawbackAmount: 0, shouldClawback: false, reason: "insufficient_unspent" };
}

async function verifySignature(body: string, signature: string): Promise<boolean> {
  if (!WEBHOOK_SECRET || !signature) return false;
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(WEBHOOK_SECRET),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign(
    "HMAC",
    key,
    new TextEncoder().encode(body),
  );
  const expected = Array.from(new Uint8Array(sig))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
  if (expected.length !== signature.length) return false;
  let diff = 0;
  for (let i = 0; i < expected.length; i++) {
    diff |= expected.charCodeAt(i) ^ signature.charCodeAt(i);
  }
  return diff === 0;
}

/** Returns true if this is the first claim for the payment. */
async function ensureIdempotent(
  db: ReturnType<typeof createServiceClient>,
  paymentId: string,
): Promise<boolean> {
  const { error } = await db
    .from("idempotency_log")
    .insert({
      key: `razorpay_payment_${paymentId}`,
      created_at: new Date().toISOString(),
    })
    .select("key")
    .single();

  if (error?.code === "23505") return false;
  if (error) throw error;
  return true;
}

async function creditTxnExists(
  db: ReturnType<typeof createServiceClient>,
  paymentId: string,
): Promise<boolean> {
  const { data } = await db
    .from("credit_transactions")
    .select("id")
    .eq("stripe_payment_id", paymentId)
    .maybeSingle();
  return !!data;
}

async function grantCreditsOnce(
  db: ReturnType<typeof createServiceClient>,
  opts: {
    userId: string;
    amount: number;
    action: string;
    description: string;
    paymentId: string;
  },
): Promise<{ ok: true } | { ok: false; error: string }> {
  if (opts.amount <= 0) return { ok: true };

  if (await creditTxnExists(db, opts.paymentId)) {
    console.log(
      `[razorpay-webhook] Skipping duplicate credit grant for ${opts.paymentId}`,
    );
    return { ok: true };
  }

  const { error } = await db.rpc("add_credits", {
    p_user_id: opts.userId,
    p_amount: opts.amount,
    p_action: opts.action,
    p_description: opts.description,
    p_payment_id: opts.paymentId,
  });
  if (error) {
    return { ok: false, error: error.message };
  }
  return { ok: true };
}

async function handleRefundEvent(
  db: ReturnType<typeof createServiceClient>,
  event: { event?: string; payload?: Record<string, unknown> },
  headers: Record<string, string>,
): Promise<Response> {
  const refund = (event.payload?.refund as { entity?: Record<string, unknown> } | undefined)
    ?.entity;
  const payment = (event.payload?.payment as { entity?: Record<string, unknown> } | undefined)
    ?.entity;

  const paymentId =
    (refund?.payment_id as string | undefined) ??
    (payment?.id as string | undefined);
  const orderId = payment?.order_id as string | undefined;

  if (!paymentId && !orderId) {
    return new Response(JSON.stringify({ received: true, skipped: "no_payment_ref" }), {
      status: 200,
      headers: { ...headers, "Content-Type": "application/json" },
    });
  }

  let orderQuery = db.from("payment_orders").select("*").eq("provider", "razorpay");
  if (paymentId) {
    orderQuery = orderQuery.eq("provider_payment_id", paymentId);
  } else if (orderId) {
    orderQuery = orderQuery.eq("provider_order_id", orderId);
  }

  const { data: order } = await orderQuery.maybeSingle();
  if (!order) {
    console.warn("[razorpay-webhook] refund: unknown order", { paymentId, orderId });
    return new Response(JSON.stringify({ received: true, skipped: "unknown_order" }), {
      status: 200,
      headers: { ...headers, "Content-Type": "application/json" },
    });
  }

  if (order.status === "refunded") {
    return new Response(JSON.stringify({ received: true, duplicate: true }), {
      status: 200,
      headers: { ...headers, "Content-Type": "application/json" },
    });
  }

  const nowIso = new Date().toISOString();
  await db
    .from("payment_orders")
    .update({ status: "refunded" })
    .eq("id", order.id);

  const catalogCredits = creditsForRazorpayProductType(order.product_type as string);
  const granted =
    typeof order.credits_granted === "number" && order.credits_granted > 0
      ? order.credits_granted
      : catalogCredits;

  const { data: profile } = await db
    .from("profiles")
    .select("id, credits")
    .eq("id", order.user_id)
    .maybeSingle();

  let clawed = 0;
  if (profile) {
    const decision = decideRefundClawback({
      currentBalance: profile.credits ?? 0,
      creditsGranted: granted,
    });
    if (decision.shouldClawback && decision.clawbackAmount > 0) {
      const { data: updated } = await db
        .from("profiles")
        .update({
          credits: (profile.credits ?? 0) - decision.clawbackAmount,
          updated_at: nowIso,
        })
        .eq("id", profile.id)
        .gte("credits", decision.clawbackAmount)
        .select("credits")
        .maybeSingle();

      if (updated) {
        clawed = decision.clawbackAmount;
        await db.from("credit_transactions").insert({
          user_id: profile.id,
          action: "refund",
          amount: -clawed,
          balance_after: updated.credits,
          description: `Razorpay refund clawback (${paymentId ?? orderId})`,
          stripe_payment_id: `rzp_refund_${paymentId ?? orderId}`,
          created_at: nowIso,
        });
      }
    }
  }

  opsLog({
    function_name: "razorpay-webhook",
    operation: String(event.event ?? "refund"),
    result: "ok",
    provider: "razorpay",
    provider_event_id: paymentId ?? orderId,
    meta: { clawed, order_id: order.id },
  });

  return new Response(
    JSON.stringify({ received: true, status: "refunded", clawed }),
    { status: 200, headers: { ...headers, "Content-Type": "application/json" } },
  );
}

Deno.serve(async (req: Request) => {
  const cors = handleCors(req);
  if (cors) return cors;
  const headers = getCorsHeaders(req);

  if (req.method !== "POST") {
    return new Response("Method not allowed", { status: 405, headers });
  }

  try {
    assertBillingConfigOrThrow({ requireRazorpay: true });
  } catch {
    return new Response(JSON.stringify({ error: "Billing configuration invalid" }), {
      status: 503,
      headers: { ...headers, "Content-Type": "application/json" },
    });
  }

  if (!WEBHOOK_SECRET) {
    console.error(
      "[razorpay-webhook] RAZORPAY_WEBHOOK_SECRET not configured — refusing events",
    );
    return new Response(JSON.stringify({ error: "Webhook secret not configured" }), {
      status: 503,
      headers: { ...headers, "Content-Type": "application/json" },
    });
  }

  const rawBody = await req.text();
  const signature = req.headers.get("x-razorpay-signature") ?? "";

  if (!(await verifySignature(rawBody, signature))) {
    opsLog({
      function_name: "razorpay-webhook",
      operation: "verify_signature",
      result: "denied",
      provider: "razorpay",
      error_class: "INVALID_SIGNATURE",
      retryable: false,
    });
    return new Response("Invalid signature", { status: 401, headers });
  }

  const event = JSON.parse(rawBody);
  const db = createServiceClient();
  let claimedEventKey: string | null = null;

  try {
    const eventName = event.event as string;

    // P4-2: refund events — mark payment_orders refunded + conditional clawback
    if (
      eventName === "refund.processed" ||
      eventName === "refund.created" ||
      eventName === "payment.refunded"
    ) {
      return await handleRefundEvent(db, event, headers);
    }

    if (eventName !== "payment.captured") {
      return new Response(JSON.stringify({ received: true }), {
        status: 200,
        headers: { ...headers, "Content-Type": "application/json" },
      });
    }

    const payment = event.payload?.payment?.entity;
    const orderId = payment?.order_id as string | undefined;
    const paymentId = payment?.id as string | undefined;

    if (!orderId || !paymentId) {
      return new Response(JSON.stringify({ error: "Missing payment data" }), {
        status: 400,
        headers: { ...headers, "Content-Type": "application/json" },
      });
    }

    opsLog({
      function_name: "razorpay-webhook",
      operation: "payment.captured",
      result: "ok",
      provider: "razorpay",
      provider_event_id: paymentId,
    });

    const { data: order } = await db
      .from("payment_orders")
      .select("*")
      .eq("provider", "razorpay")
      .eq("provider_order_id", orderId)
      .maybeSingle();

    if (!order) {
      console.warn("[razorpay-webhook] unknown order", orderId);
      return new Response(JSON.stringify({ received: true }), {
        status: 200,
        headers: { ...headers, "Content-Type": "application/json" },
      });
    }

    if (order.status === "paid") {
      return new Response(JSON.stringify({ received: true, duplicate: true }), {
        status: 200,
        headers: { ...headers, "Content-Type": "application/json" },
      });
    }

    const isNew = await ensureIdempotent(db, paymentId);
    if (!isNew) {
      return new Response(JSON.stringify({ received: true, duplicate: true }), {
        status: 200,
        headers: { ...headers, "Content-Type": "application/json" },
      });
    }
    claimedEventKey = `razorpay_payment_${paymentId}`;

    const userId = order.user_id as string;
    const productType = order.product_type as string;
    // Server catalog only — ignore order.credits_granted / any client amount.
    const catalogCredits = creditsForRazorpayProductType(productType);
    const planId = planIdForRazorpayProductType(productType);

    // Grant entitlements BEFORE marking paid so a mid-flight failure does not
    // leave the order "paid" without credits/plan updates.
    if (planId === "pro" || planId === "enterprise") {
      const monthlyCredits = monthlyCreditsForPlan(planId);

      const { error: profileErr } = await db.from("profiles").update({
        plan_id: planId,
        subscription_status: "active",
        credits_used_this_month: 0,
        credits_reset_at: new Date().toISOString(),
        pending_promo_code: null,
        updated_at: new Date().toISOString(),
      }).eq("id", userId);
      if (profileErr) {
        throw new Error(`profile_update_failed: ${profileErr.message}`);
      }

      const { error: subErr } = await db.from("subscriptions").upsert({
        user_id: userId,
        plan_id: planId,
        status: "active",
        monthly_credits: monthlyCredits,
        updated_at: new Date().toISOString(),
      }, { onConflict: "user_id" });
      if (subErr) {
        throw new Error(`subscription_upsert_failed: ${subErr.message}`);
      }

      const grant = await grantCreditsOnce(db, {
        userId,
        amount: monthlyCredits,
        action: "subscription_grant",
        description: `Razorpay subscription — ${planId}`,
        paymentId,
      });
      if (!grant.ok) {
        throw new Error(`credit_grant_failed: ${grant.error}`);
      }
    } else if (catalogCredits > 0) {
      const grant = await grantCreditsOnce(db, {
        userId,
        amount: catalogCredits,
        action: "purchase",
        description: `Razorpay credit pack — ${productType}`,
        paymentId,
      });
      if (!grant.ok) {
        throw new Error(`credit_grant_failed: ${grant.error}`);
      }
    } else {
      console.warn(
        `[razorpay-webhook] unknown/zero-credit product_type=${productType}`,
      );
    }

    // Promo bonus + redemption BEFORE paid mark (same grant-before-paid rule).
    if (order.promo_code_id) {
      const { data: promo } = await db
        .from("promo_codes")
        .select("redemption_count, bonus_credits")
        .eq("id", order.promo_code_id)
        .maybeSingle();

      if (promo) {
        const bonusPaymentId = `${paymentId}_promo`;
        const bonus = (promo.bonus_credits ?? 0) as number;
        if (bonus > 0) {
          const bonusGrant = await grantCreditsOnce(db, {
            userId,
            amount: bonus,
            action: "bonus",
            description: `Promo bonus credits — ${order.promo_code}`,
            paymentId: bonusPaymentId,
          });
          if (!bonusGrant.ok) {
            throw new Error(`promo_credit_grant_failed: ${bonusGrant.error}`);
          }
        }

        const redeemKey = `razorpay_promo_redeem_${paymentId}`;
        const { error: redeemClaimErr } = await db
          .from("idempotency_log")
          .insert({
            key: redeemKey,
            created_at: new Date().toISOString(),
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

    const { error: paidErr } = await db
      .from("payment_orders")
      .update({
        status: "paid",
        provider_payment_id: paymentId,
        paid_at: new Date().toISOString(),
        credits_granted: catalogCredits,
      })
      .eq("id", order.id)
      .neq("status", "paid");
    if (paidErr) {
      throw new Error(`mark_paid_failed: ${paidErr.message}`);
    }

    return new Response(JSON.stringify({ received: true }), {
      status: 200,
      headers: { ...headers, "Content-Type": "application/json" },
    });
  } catch (err) {
    if (claimedEventKey) {
      try {
        await db.from("idempotency_log").delete().eq("key", claimedEventKey);
      } catch (releaseErr) {
        console.error("[razorpay-webhook] Failed to release idempotency claim:", releaseErr);
      }
    }
    const requestId = await reportEdgeError(err, {
      functionName: "razorpay-webhook",
      operation: "handler",
    });
    opsLog({
      function_name: "razorpay-webhook",
      operation: "handler",
      result: "error",
      provider: "razorpay",
      error_class: "UNHANDLED",
      retryable: true,
      meta: {
        message: err instanceof Error ? err.message : "unknown",
        requestId,
      },
    });
    console.error(
      "[razorpay-webhook] handler error:",
      err instanceof Error ? err.message : "unknown",
    );
    return new Response(JSON.stringify({ error: "Internal server error", requestId }), {
      status: 500,
      headers: { ...headers, "Content-Type": "application/json" },
    });
  }
});
