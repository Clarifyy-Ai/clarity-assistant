/**
 * Razorpay order creation — subscriptions and credit packs (INR).
 * Secrets: RAZORPAY_KEY_ID, RAZORPAY_KEY_SECRET
 */
import { z } from "https://deno.land/x/zod@v3.22.4/mod.ts";
import { handleCors, getCorsHeaders } from "../_shared/cors.ts";
import { authenticateRequest } from "../_shared/auth.ts";
import { createServiceClient } from "../_shared/supabase.ts";
import { parseJsonBody } from "../_shared/errors.ts";
import { PLAN_MONTHLY_CREDITS } from "../_shared/creditEconomics.ts";
import { assertBillingConfigOrThrow } from "../_shared/billingConfig.ts";
import { opsLog } from "../_shared/opsLog.ts";
import { monthlyCreditsForPlan } from "../_shared/billingCatalog.ts";

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
});

type BillingSettings = {
  pro_monthly_inr_paise: number;
  enterprise_monthly_inr_paise: number;
  credits_50_inr_paise: number;
  credits_150_inr_paise: number;
  credits_500_inr_paise: number;
  razorpay_enabled: boolean;
};

function baseAmountPaise(
  product: (typeof PRODUCT_TYPES)[number],
  settings: BillingSettings,
): number {
  switch (product) {
    case "pro_monthly":
      return settings.pro_monthly_inr_paise;
    case "enterprise_monthly":
      return settings.enterprise_monthly_inr_paise;
    case "credits_50":
      return settings.credits_50_inr_paise;
    case "credits_150":
      return settings.credits_150_inr_paise;
    case "credits_500":
      return settings.credits_500_inr_paise;
  }
}

function creditsForProduct(product: (typeof PRODUCT_TYPES)[number]): number {
  switch (product) {
    case "pro_monthly":
      return monthlyCreditsForPlan("pro");
    case "enterprise_monthly":
      return monthlyCreditsForPlan("enterprise");
    case "credits_50":
      return 50;
    case "credits_150":
      return 150;
    case "credits_500":
      return 500;
  }
}

function planIdForProduct(product: (typeof PRODUCT_TYPES)[number]): string | null {
  if (product === "pro_monthly") return "pro";
  if (product === "enterprise_monthly") return "enterprise";
  return null;
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
  const json = await res.json();
  if (!res.ok) {
    throw new Error(json?.error?.description ?? "Razorpay API error");
  }
  return json;
}

Deno.serve(async (req: Request) => {
  const cors = handleCors(req);
  if (cors) return cors;
  const headers = getCorsHeaders(req);

  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405,
      headers: { ...headers, "Content-Type": "application/json" },
    });
  }

  if (!KEY_ID || !KEY_SECRET) {
    return new Response(JSON.stringify({ error: "Razorpay not configured" }), {
      status: 503,
      headers: { ...headers, "Content-Type": "application/json" },
    });
  }

  try {
    assertBillingConfigOrThrow({ requireRazorpay: true });
  } catch {
    opsLog({
      function_name: "razorpay-create-order",
      operation: "config_validate",
      result: "error",
      error_class: "BILLING_CONFIG_INVALID",
      retryable: false,
    });
    return new Response(JSON.stringify({ error: "Billing configuration invalid" }), {
      status: 503,
      headers: { ...headers, "Content-Type": "application/json" },
    });
  }

  const auth = await authenticateRequest(req);
  if (auth.error) {
    return new Response(auth.error.body, {
      status: auth.error.status,
      headers: { ...headers, "Content-Type": "application/json" },
    });
  }

  const raw = await parseJsonBody(req);
  const parsed = schema.safeParse(raw);
  if (!parsed.success) {
    return new Response(JSON.stringify({ error: "Invalid request" }), {
      status: 400,
      headers: { ...headers, "Content-Type": "application/json" },
    });
  }

  const db = createServiceClient();
  const { data: settingsRow } = await db
    .from("billing_settings")
    .select("*")
    .eq("id", 1)
    .maybeSingle();

  const settings = (settingsRow ?? {}) as BillingSettings;
  if (settings.razorpay_enabled === false) {
    return new Response(JSON.stringify({ error: "Razorpay payments disabled" }), {
      status: 403,
      headers: { ...headers, "Content-Type": "application/json" },
    });
  }

  const { product_type, promo_code } = parsed.data;
  let amount = baseAmountPaise(product_type, settings);
  let promoId: string | null = null;
  let appliedPromo: string | null = null;

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
      .eq("id", auth.context.user.id)
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

  const receipt = `clarity_${auth.context.user.id.slice(0, 8)}_${Date.now()}`;
  const order = await razorpayFetch("/orders", {
    amount,
    currency: "INR",
    receipt,
    notes: {
      user_id: auth.context.user.id,
      product_type,
    },
  });

  const { data: row, error: insertErr } = await db
    .from("payment_orders")
    .insert({
      user_id: auth.context.user.id,
      provider: "razorpay",
      provider_order_id: order.id,
      product_type,
      amount_paise: amount,
      currency: "INR",
      status: "created",
      credits_granted: creditsForProduct(product_type),
      plan_id: planIdForProduct(product_type),
      promo_code_id: promoId,
      promo_code: appliedPromo,
      metadata: { receipt },
    })
    .select("id")
    .single();

  if (insertErr) {
    console.error("[razorpay-create-order] insert", insertErr.message);
  }

  return new Response(
    JSON.stringify({
      key_id: KEY_ID,
      order_id: order.id,
      amount,
      currency: "INR",
      payment_order_id: row?.id ?? null,
      promo_applied: appliedPromo,
      product_type,
    }),
    {
      status: 200,
      headers: { ...headers, "Content-Type": "application/json" },
    },
  );
});
