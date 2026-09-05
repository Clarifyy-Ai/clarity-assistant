/**
 * Razorpay order creation — one-time plans and credit packs (INR).
 * Fail-closed: never return a payable provider order without a durable
 * internal payment_orders row.
 */
import { z } from "https://deno.land/x/zod@v3.22.4/mod.ts";
import { handleCors, getCorsHeaders } from "../_shared/cors.ts";
import { authenticateRequest } from "../_shared/auth.ts";
import { createServiceClient } from "../_shared/supabase.ts";
import { EdgeFunctionError, parseJsonBody } from "../_shared/errors.ts";
import {
  getRazorpayProviderConfig,
  paymentsNotConfiguredBody,
} from "../_shared/razorpayProvider.ts";
import { opsLog } from "../_shared/opsLog.ts";
import {
  creditsForRazorpayProductType,
  planIdForRazorpayProductType,
} from "../_shared/billingCatalog.ts";
import { enforcePaymentRateLimitAsync } from "../_shared/rateLimit.ts";
import {
  assertPaymentStatusTransition,
  REUSABLE_CHECKOUT_STATUSES,
  type PaymentOrderStatus,
} from "../_shared/paymentStateMachine.ts";

const PRODUCT_TYPES = [
  "pro_monthly",
  "enterprise_monthly",
  "credits_50",
  "credits_150",
  "credits_500",
] as const;

const createSchema = z.object({
  product_type: z.enum(PRODUCT_TYPES),
  promo_code: z.string().trim().max(32).optional(),
  idempotency_key: z.string().trim().min(8).max(120).optional(),
});

const cancelSchema = z.object({
  action: z.literal("cancel"),
  payment_order_id: z.string().uuid(),
});

const failSchema = z.object({
  action: z.literal("fail"),
  payment_order_id: z.string().uuid(),
});

const TERMINAL_ORDER_STATUSES = new Set<PaymentOrderStatus>([
  "fulfilled",
  "paid",
  "refunded",
]);

type BillingSettings = {
  pro_monthly_inr_paise: number;
  enterprise_monthly_inr_paise: number;
  credits_50_inr_paise: number;
  credits_150_inr_paise: number;
  credits_500_inr_paise: number;
  razorpay_enabled: boolean;
};

type PromoRow = {
  id: string;
  code: string;
  discount_percent: number | null;
  valid_until: string | null;
  max_redemptions: number | null;
  redemption_count: number | null;
  is_active: boolean;
};

function isPromoEligible(promo: PromoRow): boolean {
  if (!promo.is_active) return false;
  const validUntil = promo.valid_until ? new Date(promo.valid_until) : null;
  if (validUntil && validUntil <= new Date()) return false;
  const max = promo.max_redemptions;
  const used = promo.redemption_count ?? 0;
  if (max != null && used >= max) return false;
  return true;
}

function applyPromoDiscount(amount: number, promo: PromoRow): number {
  const pct = promo.discount_percent ?? 0;
  return Math.max(100, Math.round(amount * (1 - pct / 100)));
}

function json(req: Request, payload: unknown, status: number) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { ...getCorsHeaders(req), "Content-Type": "application/json" },
  });
}

function baseAmountPaise(
  product: (typeof PRODUCT_TYPES)[number],
  settings: BillingSettings,
): number {
  switch (product) {
    case "pro_monthly":
      return Number(settings.pro_monthly_inr_paise);
    case "enterprise_monthly":
      return Number(settings.enterprise_monthly_inr_paise);
    case "credits_50":
      return Number(settings.credits_50_inr_paise);
    case "credits_150":
      return Number(settings.credits_150_inr_paise);
    case "credits_500":
      return Number(settings.credits_500_inr_paise);
  }
}

async function razorpayFetch(
  path: string,
  body: Record<string, unknown>,
  keyId: string,
  keySecret: string,
) {
  const auth = btoa(`${keyId}:${keySecret}`);
  const res = await fetch(`https://api.razorpay.com/v1${path}`, {
    method: "POST",
    headers: {
      Authorization: `Basic ${auth}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
  const jsonBody = await res.json();
  if (!res.ok) {
    throw new Error(jsonBody?.error?.description ?? "Razorpay API error");
  }
  return jsonBody;
}

async function recordReconciliation(
  db: ReturnType<typeof createServiceClient>,
  row: {
    user_id: string;
    provider_order_id?: string | null;
    payment_order_id?: string | null;
    reason: string;
    details?: Record<string, unknown>;
  },
) {
  await db.from("billing_reconciliation_incidents").insert({
    user_id: row.user_id,
    provider: "razorpay",
    provider_order_id: row.provider_order_id ?? null,
    payment_order_id: row.payment_order_id ?? null,
    reason: row.reason,
    details: row.details ?? {},
  }).then(() => {}, () => {});

  opsLog({
    function_name: "razorpay-create-order",
    operation: "reconciliation",
    result: "error",
    error_class: row.reason,
    retryable: true,
  });
}

Deno.serve(async (req: Request) => {
  const cors = handleCors(req);
  if (cors) return cors;

  if (req.method !== "POST") {
    return json(req, { error: "Method not allowed" }, 405);
  }

  const razorpayProvider = getRazorpayProviderConfig();
  const KEY_ID = razorpayProvider.keyId;
  const KEY_SECRET = razorpayProvider.keySecret;

  try {
  const auth = await authenticateRequest(req);
  if (auth.error || !auth.context) {
    // authenticateRequest → auth.requireAuth(getUser(accessToken)) — JWT required.
    return auth.error ?? json(req, { error: "Unauthorized", code: "AUTH_INVALID" }, 401);
  }

  const userId = auth.context.user.id;
  const db = createServiceClient();
  const rateLimited = await enforcePaymentRateLimitAsync(
    db,
    "razorpay-create-order",
    userId,
  );
  if (rateLimited) return rateLimited;

  let rawBody: unknown;
  try {
    rawBody = await parseJsonBody(req);
  } catch (parseErr) {
    if (parseErr instanceof EdgeFunctionError) {
      return json(req, { error: parseErr.message, code: "VALIDATION_ERROR" }, 400);
    }
    return json(req, { error: "Invalid request body.", code: "VALIDATION_ERROR" }, 400);
  }

  async function transitionOrder(
    paymentOrderId: string,
    target: "cancelled" | "failed",
  ): Promise<Response> {
    const { data: row } = await db
      .from("payment_orders")
      .select("id, status")
      .eq("id", paymentOrderId)
      .eq("user_id", userId)
      .maybeSingle();

    if (!row?.id) {
      return json(req, { error: "Order not found", code: "ORDER_NOT_FOUND" }, 404);
    }

    const current = row.status as PaymentOrderStatus;
    if (current === target) {
      return json(req, { ok: true, status: current, duplicate: true }, 200);
    }
    if (TERMINAL_ORDER_STATUSES.has(current)) {
      return json(req, { ok: true, status: current, duplicate: true }, 200);
    }

    try {
      assertPaymentStatusTransition(current, target);
    } catch {
      return json(req, {
        error: `Order cannot be marked ${target} in its current state.`,
        code: "INVALID_TRANSITION",
      }, 409);
    }

    const patch: Record<string, unknown> = { status: target };
    if (target === "cancelled") {
      patch.cancelled_at = new Date().toISOString();
    }

    await db.from("payment_orders").update(patch).eq("id", paymentOrderId).eq("user_id", userId);
    return json(req, { ok: true, status: target }, 200);
  }

  const cancelParsed = cancelSchema.safeParse(rawBody);
  if (cancelParsed.success) {
    return await transitionOrder(cancelParsed.data.payment_order_id, "cancelled");
  }

  const failParsed = failSchema.safeParse(rawBody);
  if (failParsed.success) {
    return await transitionOrder(failParsed.data.payment_order_id, "failed");
  }

  const parsed = createSchema.safeParse(rawBody);
  if (!parsed.success) {
    return json(req, {
      error: "Invalid product_type. Use a supported plan or credit pack.",
      code: "VALIDATION_ERROR",
    }, 400);
  }

  if (!razorpayProvider.checkoutConfigured) {
    opsLog({
      function_name: "razorpay-create-order",
      operation: "config_validate",
      result: "error",
      error_class: "PAYMENTS_NOT_CONFIGURED",
      retryable: false,
    });
    return json(req, paymentsNotConfiguredBody(), 503);
  }

  const { data: settingsRow } = await db
    .from("billing_settings")
    .select("*")
    .eq("id", 1)
    .maybeSingle();

  const settings = (settingsRow ?? {}) as BillingSettings;
  if (settings.razorpay_enabled === false) {
    return json(req, { error: "Razorpay payments disabled" }, 403);
  }

  const { product_type, promo_code } = parsed.data;
  let amount = baseAmountPaise(product_type, settings);
  let promoId: string | null = null;
  let appliedPromo: string | null = null;

  if (!Number.isFinite(amount) || amount < 100) {
    return json(req, {
      error: "Checkout is not available for this product right now.",
      code: "PRICE_UNAVAILABLE",
    }, 503);
  }

  if (promo_code) {
    const code = promo_code.toUpperCase();
    const { data: promo } = await db
      .from("promo_codes")
      .select("*")
      .eq("is_active", true)
      .ilike("code", code)
      .maybeSingle();

    if (promo && isPromoEligible(promo as PromoRow)) {
      amount = applyPromoDiscount(amount, promo as PromoRow);
      promoId = promo.id;
      appliedPromo = promo.code;
    }
  } else {
    const { data: profile } = await db
      .from("profiles")
      .select("pending_promo_code")
      .eq("id", userId)
      .single();
    if (profile?.pending_promo_code) {
      const pendingCode = profile.pending_promo_code.toUpperCase();
      const { data: promo } = await db
        .from("promo_codes")
        .select("*")
        .ilike("code", pendingCode)
        .eq("is_active", true)
        .maybeSingle();
      if (
        promo &&
        promo.code.toUpperCase() === pendingCode &&
        isPromoEligible(promo as PromoRow)
      ) {
        amount = applyPromoDiscount(amount, promo as PromoRow);
        promoId = promo.id;
        appliedPromo = promo.code;
      }
    }
  }

  const headerKey = (
    req.headers.get("Idempotency-Key") ??
    req.headers.get("x-idempotency-key") ??
    ""
  ).trim().slice(0, 120);

  const idempotencyKey =
    parsed.data.idempotency_key ??
    (headerKey.length >= 8 ? headerKey : `${userId}:${product_type}:${appliedPromo ?? "none"}`);

  const { data: existing } = await db
    .from("payment_orders")
    .select("id, provider_order_id, amount_paise, status, promo_code")
    .eq("user_id", userId)
    .eq("idempotency_key", idempotencyKey)
    .in("status", [...REUSABLE_CHECKOUT_STATUSES])
    .maybeSingle();

  if (existing?.provider_order_id && existing.id) {
    return json(req, {
      key_id: KEY_ID,
      order_id: existing.provider_order_id,
      amount: existing.amount_paise,
      currency: "INR",
      payment_order_id: existing.id,
      promo_applied: existing.promo_code,
      product_type,
      idempotentReplay: true,
    }, 200);
  }

  let paymentOrderId = existing?.id as string | undefined;
  if (!paymentOrderId) {
    const { data: reserved, error: reserveErr } = await db
      .from("payment_orders")
      .insert({
        user_id: userId,
        provider: "razorpay",
        product_type,
        amount_paise: amount,
        currency: "INR",
        status: "pending",
        credits_granted: creditsForRazorpayProductType(product_type),
        plan_id: planIdForRazorpayProductType(product_type),
        promo_code_id: promoId,
        promo_code: appliedPromo,
        idempotency_key: idempotencyKey,
        metadata: { reserved: true },
      })
      .select("id")
      .single();

    if (reserveErr || !reserved?.id) {
      if (reserveErr?.code === "23505") {
        const { data: raced } = await db
          .from("payment_orders")
          .select("id, provider_order_id, amount_paise, status, promo_code")
          .eq("user_id", userId)
          .eq("idempotency_key", idempotencyKey)
          .maybeSingle();
        if (raced?.provider_order_id && raced.id) {
          return json(req, {
            key_id: KEY_ID,
            order_id: raced.provider_order_id,
            amount: raced.amount_paise,
            currency: "INR",
            payment_order_id: raced.id,
            promo_applied: raced.promo_code,
            product_type,
            idempotentReplay: true,
          }, 200);
        }
        if (raced?.id) paymentOrderId = raced.id;
      }
      if (!paymentOrderId) {
        opsLog({
          function_name: "razorpay-create-order",
          operation: "reserve_internal_order",
          result: "error",
          error_class: "PAYMENT_ORDER_PERSIST_FAILED",
          retryable: true,
        });
        return json(req, {
          error: "Could not start checkout. Please try again.",
          code: "ORDER_PERSIST_FAILED",
        }, 500);
      }
    } else {
      paymentOrderId = reserved.id;
    }
  }

  const receipt = `clarity_${userId.slice(0, 8)}_${paymentOrderId.slice(0, 8)}`;
  let order: { id?: string };
  try {
    order = await razorpayFetch("/orders", {
      amount,
      currency: "INR",
      receipt,
      notes: {
        user_id: userId,
        product_type,
        payment_order_id: paymentOrderId,
      },
    }, KEY_ID, KEY_SECRET);
  } catch {
    await db.from("payment_orders").update({
      status: "failed",
      metadata: { receipt, provider_error: true },
    }).eq("id", paymentOrderId);
    return json(req, {
      error: "Payment provider is unavailable. Please try again.",
      code: "PROVIDER_UNAVAILABLE",
    }, 502);
  }

  if (!order?.id) {
    await db.from("payment_orders").update({ status: "failed" }).eq("id", paymentOrderId);
    return json(req, {
      error: "Could not create a payment order.",
      code: "PROVIDER_ORDER_INVALID",
    }, 502);
  }

  const { data: persisted, error: persistErr } = await db
    .from("payment_orders")
    .update({
      provider_order_id: order.id,
      amount_paise: amount,
      status: "provider_created",
      metadata: { receipt },
    })
    .eq("id", paymentOrderId)
    .select("id, provider_order_id")
    .single();

  if (persistErr || !persisted?.id || !persisted.provider_order_id) {
    await db.from("payment_orders").update({
      status: "reconciliation_required",
      provider_order_id: order.id,
      reconciliation_reason: "provider_created_internal_update_failed",
    }).eq("id", paymentOrderId);
    await recordReconciliation(db, {
      user_id: userId,
      provider_order_id: order.id,
      payment_order_id: paymentOrderId,
      reason: "provider_created_without_durable_update",
    });
    return json(req, {
      error: "Could not start checkout. Please try again.",
      code: "ORDER_PERSIST_FAILED",
    }, 500);
  }

  return json(req, {
    key_id: KEY_ID,
    order_id: persisted.provider_order_id,
    amount,
    currency: "INR",
    payment_order_id: persisted.id,
    promo_applied: appliedPromo,
    product_type,
  }, 200);
  } catch (error) {
    if (error instanceof EdgeFunctionError) {
      return json(req, { error: error.message, code: error.code }, error.status);
    }
    opsLog({
      function_name: "razorpay-create-order",
      operation: "handler",
      result: "error",
      error_class: "UNHANDLED",
      retryable: true,
    });
    return json(req, {
      error: "Could not start checkout. Please try again.",
      code: "ORDER_PERSIST_FAILED",
    }, 500);
  }
});
