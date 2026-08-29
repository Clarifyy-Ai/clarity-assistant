/**
 * Razorpay order creation — one-time plans and credit packs (INR).
 * Fail-closed: never return a payable provider order without a durable
 * internal payment_orders row.
 */
import { z } from "https://deno.land/x/zod@v3.22.4/mod.ts";
import { handleCors, getCorsHeaders } from "../_shared/cors.ts";
import { authenticateRequest } from "../_shared/auth.ts";
import { createServiceClient } from "../_shared/supabase.ts";
import { parseJsonBody } from "../_shared/errors.ts";
import { assertBillingConfigOrThrow } from "../_shared/billingConfig.ts";
import { opsLog } from "../_shared/opsLog.ts";
import {
  creditsForRazorpayProductType,
  planIdForRazorpayProductType,
} from "../_shared/billingCatalog.ts";
import { enforcePaymentRateLimitAsync } from "../_shared/rateLimit.ts";

const KEY_ID = Deno.env.get("RAZORPAY_KEY_ID") ?? "";
const KEY_SECRET = Deno.env.get("RAZORPAY_KEY_SECRET") ?? "";

const PRODUCT_TYPES = [
  "pro_monthly",
  "enterprise_monthly",
  "credits_50",
  "credits_150",
  "credits_500",
] as const;

const schema = z.object({
  product_type: z.enum(PRODUCT_TYPES),
  promo_code: z.string().trim().max(32).optional(),
  idempotency_key: z.string().trim().min(8).max(120).optional(),
});

type BillingSettings = {
  pro_monthly_inr_paise: number;
  enterprise_monthly_inr_paise: number;
  credits_50_inr_paise: number;
  credits_150_inr_paise: number;
  credits_500_inr_paise: number;
  razorpay_enabled: boolean;
};

const REUSABLE_STATUSES = [
  "pending",
  "provider_created",
  "created",
] as const;

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

async function razorpayFetch(path: string, body: Record<string, unknown>) {
  const auth = btoa(`${KEY_ID}:${KEY_SECRET}`);
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

  if (!KEY_ID || !KEY_SECRET) {
    return json(req, { error: "Integration not configured" }, 503);
  }

  try {
    assertBillingConfigOrThrow({ requireRazorpay: true, requireStripe: false });
  } catch {
    opsLog({
      function_name: "razorpay-create-order",
      operation: "config_validate",
      result: "error",
      error_class: "BILLING_CONFIG_INVALID",
      retryable: false,
    });
    return json(req, { error: "Billing configuration invalid" }, 503);
  }

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

  const parsed = schema.safeParse(await parseJsonBody(req));
  if (!parsed.success) {
    return json(req, {
      error: "Invalid product_type. Use a supported plan or credit pack.",
      code: "VALIDATION_ERROR",
    }, 400);
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

    if (promo) {
      const validUntil = promo.valid_until ? new Date(promo.valid_until) : null;
      if (!validUntil || validUntil > new Date()) {
        const max = promo.max_redemptions;
        const used = promo.redemption_count ?? 0;
        if (max == null || used < max) {
          const pct = promo.discount_percent ?? 0;
          amount = Math.max(100, Math.round(amount * (1 - pct / 100)));
          promoId = promo.id;
          appliedPromo = promo.code;
        }
      }
    }
  } else {
    const { data: profile } = await db
      .from("profiles")
      .select("pending_promo_code")
      .eq("id", userId)
      .single();
    if (profile?.pending_promo_code) {
      const { data: promo } = await db
        .from("promo_codes")
        .select("*")
        .ilike("code", profile.pending_promo_code)
        .eq("is_active", true)
        .maybeSingle();
      if (promo) {
        const pct = promo.discount_percent ?? 0;
        amount = Math.max(100, Math.round(amount * (1 - pct / 100)));
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
    .in("status", [...REUSABLE_STATUSES])
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
    });
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
});
