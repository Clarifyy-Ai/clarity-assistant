/**
 * Read-only canonical billing status.
 * past_due beats active. Razorpay checkout never writes past_due.
 */
import { handleCors, getCorsHeaders } from "../_shared/cors.ts";
import { authenticateRequest } from "../_shared/auth.ts";
import { createServiceClient } from "../_shared/supabase.ts";
import {
  resolveCanonicalBillingStatus,
} from "../_shared/billingPastDue.ts";

const GRACE_MS = 3 * 24 * 60 * 60 * 1000;

function json(corsHeaders: HeadersInit, body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json", "Cache-Control": "no-store" },
  });
}

Deno.serve(async (req) => {
  const cors = handleCors(req);
  if (cors) return cors;
  const corsHeaders = getCorsHeaders(req);

  if (req.method !== "GET" && req.method !== "POST") {
    return json(corsHeaders, { error: "Method not allowed", code: "INVALID_REQUEST" }, 405);
  }

  try {
    const auth = await authenticateRequest(req);
    if (auth.error || !auth.context) {
      return auth.error ?? json(corsHeaders, { error: "Unauthorized", code: "UNAUTHORIZED" }, 401);
    }
    const userId = auth.context.user.id;
    const db = createServiceClient();

    const { data: profile } = await db
      .from("profiles")
      .select("subscription_status, payment_failed_at, plan_id")
      .eq("id", userId)
      .maybeSingle();

    const { data: sub } = await db
      .from("subscriptions")
      .select("status, plan_id, updated_at")
      .eq("user_id", userId)
      .order("updated_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    const profileStatus = profile?.subscription_status ?? null;
    const subscriptionStatus = (sub as { status?: string } | null)?.status ?? null;
    const status = resolveCanonicalBillingStatus(profileStatus, subscriptionStatus);
    const source =
      status === String(profileStatus ?? "").toLowerCase()
        ? "profile"
        : status === String(subscriptionStatus ?? "").toLowerCase()
          ? "subscription"
          : "canonical";

    const paymentFailedAt = profile?.payment_failed_at ?? null;
    const graceDeadline = paymentFailedAt
      ? new Date(new Date(paymentFailedAt).getTime() + GRACE_MS).toISOString()
      : null;
    const beyondGrace = status === "past_due" && (
      !paymentFailedAt || Date.now() - new Date(paymentFailedAt).getTime() >= GRACE_MS
    );

    return json(corsHeaders, {
      status,
      profile_status: profileStatus,
      subscription_status: subscriptionStatus,
      plan_id: profile?.plan_id ?? (sub as { plan_id?: string } | null)?.plan_id ?? "free",
      payment_failed_at: paymentFailedAt,
      grace_deadline: graceDeadline,
      beyond_grace: beyondGrace,
      recovery_allowed: status === "past_due",
      source,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unauthorized";
    const status = /invalid or expired|unauthor/i.test(message) ? 401 : 500;
    return json(corsHeaders, { error: message, code: status === 401 ? "UNAUTHORIZED" : "INTERNAL_ERROR" }, status);
  }
});
