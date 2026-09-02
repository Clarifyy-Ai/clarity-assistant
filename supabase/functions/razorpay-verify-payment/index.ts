/**
 * Verify Razorpay Checkout signature and fulfill the order.
 * Secrets: RAZORPAY_KEY_ID, RAZORPAY_KEY_SECRET
 *
 * Client scores/amounts are ignored. Entitlements come from billingCatalog.
 */
import { z } from "https://deno.land/x/zod@v3.22.4/mod.ts";
import { handleCors, getCorsHeaders } from "../_shared/cors.ts";
import { authenticateRequest } from "../_shared/auth.ts";
import { createServiceClient } from "../_shared/supabase.ts";
import { parseJsonBody } from "../_shared/errors.ts";
import {
  getRazorpayProviderConfig,
  paymentsNotConfiguredBody,
} from "../_shared/razorpayProvider.ts";
import { enforcePaymentRateLimitAsync } from "../_shared/rateLimit.ts";
import {
  fulfillCapturedRazorpayOrder,
  hmacSha256Hex,
  timingSafeEqual,
  type PaymentOrderRow,
} from "../_shared/razorpayFulfill.ts";
import {
  assertPaymentStatusTransition,
  type PaymentOrderStatus,
} from "../_shared/paymentStateMachine.ts";

const schema = z.object({
  razorpay_order_id: z.string().min(6).max(64),
  razorpay_payment_id: z.string().min(6).max(64),
  razorpay_signature: z.string().min(16).max(128),
});

function json(req: Request, payload: unknown, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { ...getCorsHeaders(req), "Content-Type": "application/json" },
  });
}

async function fetchRazorpayPayment(
  paymentId: string,
  keyId: string,
  keySecret: string,
): Promise<{ status?: string; order_id?: string } | null> {
  const auth = btoa(`${keyId}:${keySecret}`);
  const res = await fetch(`https://api.razorpay.com/v1/payments/${paymentId}`, {
    headers: { Authorization: `Basic ${auth}` },
  });
  if (!res.ok) return null;
  return await res.json();
}

Deno.serve(async (req: Request) => {
  const cors = handleCors(req);
  if (cors) return cors;
  const headers = getCorsHeaders(req);

  if (req.method !== "POST") {
    return json(req, { error: "Method not allowed" }, 405);
  }

  const razorpayProvider = getRazorpayProviderConfig();
  const KEY_ID = razorpayProvider.keyId;
  const KEY_SECRET = razorpayProvider.keySecret;

  if (!razorpayProvider.checkoutConfigured) {
    return json(req, paymentsNotConfiguredBody(), 503);
  }

  const auth = await authenticateRequest(req);
  if (auth.error || !auth.context) {
    return auth.error ?? json(req, { error: "Unauthorized" }, 401);
  }

  const db = createServiceClient();
  const rateLimited = await enforcePaymentRateLimitAsync(
    db,
    "razorpay-verify-payment",
    auth.context.user.id,
  );
  if (rateLimited) return rateLimited;

  let parsedBody: unknown;
  try {
    parsedBody = await parseJsonBody(req);
  } catch {
    return json(req, { error: "Invalid payment payload" }, 400);
  }
  const parsed = schema.safeParse(parsedBody);
  if (!parsed.success) {
    return json(req, { error: "Invalid payment payload" }, 400);
  }

  const { razorpay_order_id, razorpay_payment_id, razorpay_signature } = parsed.data;
  const expected = await hmacSha256Hex(
    KEY_SECRET,
    `${razorpay_order_id}|${razorpay_payment_id}`,
  );
  if (!timingSafeEqual(expected, razorpay_signature)) {
    return json(req, { error: "Invalid payment signature" }, 401);
  }

  const remote = await fetchRazorpayPayment(razorpay_payment_id, KEY_ID, KEY_SECRET);
  if (!remote || remote.order_id !== razorpay_order_id) {
    return json(req, { error: "Payment could not be confirmed" }, 400);
  }
  const status = String(remote.status ?? "");
  // Entitlements are granted only after Razorpay confirms capture. An
  // authorized payment may still be cancelled or expire without settlement.
  if (status !== "captured") {
    return json(req, {
      error: "Payment has not been captured yet. Complete checkout and try again.",
      code: "PAYMENT_NOT_CAPTURED",
    }, 409);
  }

  const { data: order, error: orderErr } = await db
    .from("payment_orders")
    .select("id,user_id,product_type,status,promo_code_id,promo_code")
    .eq("provider", "razorpay")
    .eq("provider_order_id", razorpay_order_id)
    .eq("user_id", auth.context.user.id)
    .maybeSingle();

  if (orderErr || !order) {
    return json(req, { error: "Order not found" }, 404);
  }

  const currentStatus = order.status as PaymentOrderStatus;
  if (currentStatus === "fulfilled" || currentStatus === "paid") {
    return json(req, {
      ok: true,
      duplicate: true,
      status: currentStatus,
    });
  }

  try {
    assertPaymentStatusTransition(currentStatus, "fulfilled");
  } catch {
    return json(req, {
      error: "Order is not in a payable state.",
      code: "INVALID_ORDER_STATE",
    }, 409);
  }

  try {
    const result = await fulfillCapturedRazorpayOrder(db, {
      order: order as PaymentOrderRow,
      paymentId: razorpay_payment_id,
    });
    return json(req, {
      ok: true,
      duplicate: result.duplicate,
      status: "fulfilled",
    });
  } catch (error) {
    console.error(
      "[razorpay-verify-payment] fulfillment failed:",
      error instanceof Error ? error.message : String(error),
    );
    return json(
      req,
      { error: "Payment could not be finalized. Please contact support if you were charged.", code: "PAYMENT_FULFILLMENT_FAILED" },
      500,
    );
  }
});
