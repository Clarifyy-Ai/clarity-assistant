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
} from "../_shared/billingCatalog.ts";
import {
  fulfillCapturedRazorpayOrder,
  claimRazorpayWebhookEvent,
  markFailedRazorpayOrder,
  hmacSha256Hex,
  timingSafeEqual,
  type PaymentOrderRow,
} from "../_shared/razorpayFulfill.ts";

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
  const expected = await hmacSha256Hex(WEBHOOK_SECRET, body);
  return timingSafeEqual(expected, signature);
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
  const refundId = (refund?.id as string | undefined) ?? paymentId;
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

  const catalogCredits = creditsForRazorpayProductType(order.product_type as string);
  const granted =
    typeof order.credits_granted === "number" && order.credits_granted > 0
      ? order.credits_granted
      : catalogCredits;

  const { data: refundResult, error: refundError } = await db.rpc(
    "apply_razorpay_refund",
    {
      p_order_id: order.id,
      p_refund_key: refundId ?? orderId,
      p_credits_granted: granted,
    },
  );
  if (refundError) throw refundError;
  const refundDecision = refundResult as
    | { success?: boolean; code?: string; clawed?: number }
    | null;
  if (!refundDecision?.success) {
    throw new Error(
      `Razorpay refund application failed: ${refundDecision?.code ?? "UNKNOWN"}`,
    );
  }
  const clawed = Number(refundDecision.clawed ?? 0);

  opsLog({
    function_name: "razorpay-webhook",
    operation: String(event.event ?? "refund"),
    result: "ok",
    provider: "razorpay",
    provider_event_id: refundId ?? orderId,
    meta: { clawed, order_id: order.id },
  });

  return new Response(
    JSON.stringify({ received: true, status: "refunded", clawed }),
    { status: 200, headers: { ...headers, "Content-Type": "application/json" } },
  );
}

async function claimWebhookEvent(
  db: ReturnType<typeof createServiceClient>,
  eventId: string,
  fallbackKey?: string,
): Promise<boolean> {
  const key = eventId.trim() || fallbackKey?.trim() || "";
  if (!key) return true;
  return await claimRazorpayWebhookEvent(db, key);
}

async function handlePaymentFailedEvent(
  db: ReturnType<typeof createServiceClient>,
  event: { payload?: Record<string, unknown> },
  headers: Record<string, string>,
): Promise<Response> {
  const payment = (event.payload?.payment as { entity?: Record<string, unknown> } | undefined)
    ?.entity;
  const orderId = payment?.order_id as string | undefined;
  const paymentId = payment?.id as string | undefined;

  if (!orderId) {
    return new Response(JSON.stringify({ received: true, skipped: "no_order_id" }), {
      status: 200,
      headers: { ...headers, "Content-Type": "application/json" },
    });
  }

  const { data: order } = await db
    .from("payment_orders")
    .select("id, status")
    .eq("provider", "razorpay")
    .eq("provider_order_id", orderId)
    .maybeSingle();

  if (!order) {
    console.warn("[razorpay-webhook] payment.failed: unknown order", orderId);
    return new Response(JSON.stringify({ received: true, skipped: "unknown_order" }), {
      status: 200,
      headers: { ...headers, "Content-Type": "application/json" },
    });
  }

  const result = await markFailedRazorpayOrder(db, {
    orderId: order.id as string,
    currentStatus: order.status as string,
  });

  opsLog({
    function_name: "razorpay-webhook",
    operation: "payment.failed",
    result: "ok",
    provider: "razorpay",
    provider_event_id: paymentId ?? orderId,
    meta: { order_id: order.id, duplicate: result.duplicate },
  });

  return new Response(
    JSON.stringify({ received: true, status: "failed", duplicate: result.duplicate }),
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
    assertBillingConfigOrThrow({
      requireRazorpay: true,
      requireStripe: false,
      requireRazorpayWebhook: true,
    });
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

  try {
    const eventName = event.event as string;
    const eventId = typeof event.id === "string" ? event.id.trim() : "";
    const paymentEntity = (event.payload?.payment as { entity?: Record<string, unknown> } | undefined)
      ?.entity;
    const paymentIdForDedupe = typeof paymentEntity?.id === "string"
      ? paymentEntity.id
      : "";
    const fallbackDedupeKey = !eventId && paymentIdForDedupe
      ? `razorpay_webhook_payment_${paymentIdForDedupe}_${eventName}`
      : "";

    const isNewEvent = await claimWebhookEvent(db, eventId, fallbackDedupeKey);
    if (!isNewEvent) {
      return new Response(
        JSON.stringify({
          received: true,
          duplicate: true,
          event_id: eventId || fallbackDedupeKey,
        }),
        { status: 200, headers: { ...headers, "Content-Type": "application/json" } },
      );
    }

    // P4-2: refund events — mark payment_orders refunded + conditional clawback
    if (
      eventName === "refund.processed" ||
      eventName === "refund.created" ||
      eventName === "payment.refunded"
    ) {
      return await handleRefundEvent(db, event, headers);
    }

    if (eventName === "payment.failed") {
      return await handlePaymentFailedEvent(db, event, headers);
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

    const result = await fulfillCapturedRazorpayOrder(db, {
      order: order as PaymentOrderRow,
      paymentId,
    });
    return new Response(JSON.stringify({ received: true, duplicate: result.duplicate }), {
      status: 200,
      headers: { ...headers, "Content-Type": "application/json" },
    });
  } catch (err) {
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
