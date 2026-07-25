/**
 * Razorpay webhook — payment.captured → grant credits / upgrade plan.
 * Secret: RAZORPAY_WEBHOOK_SECRET
 */
import { handleCors, getCorsHeaders } from "../_shared/cors.ts";
import { createServiceClient } from "../_shared/supabase.ts";
import { PLAN_MONTHLY_CREDITS } from "../_shared/creditEconomics.ts";

const WEBHOOK_SECRET = Deno.env.get("RAZORPAY_WEBHOOK_SECRET") ?? "";

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

Deno.serve(async (req: Request) => {
  const cors = handleCors(req);
  if (cors) return cors;
  const headers = getCorsHeaders(req);

  if (req.method !== "POST") {
    return new Response("Method not allowed", { status: 405, headers });
  }

  const rawBody = await req.text();
  const signature = req.headers.get("x-razorpay-signature") ?? "";

  if (!(await verifySignature(rawBody, signature))) {
    return new Response("Invalid signature", { status: 401, headers });
  }

  const event = JSON.parse(rawBody);
  const db = createServiceClient();

  if (event.event !== "payment.captured") {
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

  const userId = order.user_id as string;
  const productType = order.product_type as string;
  const credits = (order.credits_granted as number) ?? 0;

  await db
    .from("payment_orders")
    .update({
      status: "paid",
      provider_payment_id: paymentId,
      paid_at: new Date().toISOString(),
    })
    .eq("id", order.id);

  if (productType === "pro_monthly" || productType === "enterprise_monthly") {
    const planId = productType === "pro_monthly" ? "pro" : "enterprise";
    const monthlyCredits = PLAN_MONTHLY_CREDITS[planId as "pro" | "enterprise"];

    await db.from("profiles").update({
      plan_id: planId,
      subscription_status: "active",
      credits_used_this_month: 0,
      credits_reset_at: new Date().toISOString(),
      pending_promo_code: null,
      updated_at: new Date().toISOString(),
    }).eq("id", userId);

    await db.from("subscriptions").upsert({
      user_id: userId,
      plan_id: planId,
      status: "active",
      monthly_credits: monthlyCredits,
      updated_at: new Date().toISOString(),
    }, { onConflict: "user_id" });

    await db.rpc("add_credits", {
      p_user_id: userId,
      p_amount: monthlyCredits,
      p_action: "subscription_grant",
      p_description: `Razorpay subscription — ${planId}`,
      p_payment_id: paymentId,
    });
  } else if (credits > 0) {
    await db.rpc("add_credits", {
      p_user_id: userId,
      p_amount: credits,
      p_action: "purchase",
      p_description: `Razorpay credit pack — ${productType}`,
      p_payment_id: paymentId,
    });
  }

  if (order.promo_code_id) {
    const { data: promo } = await db
      .from("promo_codes")
      .select("redemption_count, bonus_credits")
      .eq("id", order.promo_code_id)
      .single();

    if (promo) {
      await db
        .from("promo_codes")
        .update({
          redemption_count: (promo.redemption_count ?? 0) + 1,
          updated_at: new Date().toISOString(),
        })
        .eq("id", order.promo_code_id);

      if ((promo.bonus_credits ?? 0) > 0) {
        await db.rpc("add_credits", {
          p_user_id: userId,
          p_amount: promo.bonus_credits,
          p_action: "bonus",
          p_description: `Promo bonus credits — ${order.promo_code}`,
          p_payment_id: paymentId,
        });
      }
    }

    await db
      .from("profiles")
      .update({ pending_promo_code: null, updated_at: new Date().toISOString() })
      .eq("id", userId);
  }

  return new Response(JSON.stringify({ received: true }), {
    status: 200,
    headers: { ...headers, "Content-Type": "application/json" },
  });
});
