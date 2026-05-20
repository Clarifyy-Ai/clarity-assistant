// supabase/functions/process-stripe-webhook/index.ts
//
// Stripe webhook handler.
//
// SECURITY PURPOSE:
// - Verify Stripe webhook signature using raw request body
// - Prevent forged payment/subscription events
// - Prevent duplicate webhook processing
// - Sync subscriptions safely
// - Grant credit packs safely
// - Record webhook processing status
// - Audit webhook activity
//
// IMPORTANT:
// Do NOT require user JWT auth for Stripe webhooks.
// Stripe authenticates webhooks using the Stripe-Signature header + webhook secret.

import Stripe from "https://esm.sh/stripe@14?target=denonext";
import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";

import { createServiceClient } from "../_shared/supabase.ts";
import { logAuditEvent } from "../_shared/audit.ts";

const STRIPE_SECRET_KEY = Deno.env.get("STRIPE_SECRET_KEY") ?? "";

const STRIPE_WEBHOOK_SECRET =
  Deno.env.get("STRIPE_WEBHOOK_SECRET") ??
  Deno.env.get("STRIPE_WEBHOOK_SIGNING_SECRET") ??
  "";

const stripe = new Stripe(STRIPE_SECRET_KEY, {
  apiVersion: "2024-11-20" as Stripe.LatestApiVersion,
});

const cryptoProvider = Stripe.createSubtleCryptoProvider();

const WEBHOOK_EVENTS_TABLE = "webhook_events";

type WebhookProcessStatus = "processing" | "processed" | "failed" | "ignored";

type WebhookEventRecord = {
  event_id: string;
  event_type: string;
  status: WebhookProcessStatus;
  processed_at?: string | null;
  error_message?: string | null;
};

type CreditPackId =
  | "credits_10"
  | "credits_50"
  | "credits_150"
  | "credits_500";

function json(status: number, body: Record<string, unknown>): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json",
      "Cache-Control": "no-store",
    },
  });
}

function getStripeSignature(req: Request): string | null {
  return req.headers.get("stripe-signature") ?? req.headers.get("Stripe-Signature");
}

function isUniqueViolation(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as { code?: unknown }).code === "23505"
  );
}

function getMetadataValue(
  metadata: Stripe.Metadata | null | undefined,
  key: string
): string | null {
  const value = metadata?.[key];

  if (typeof value === "string" && value.trim().length > 0) {
    return value.trim();
  }

  return null;
}

function normalizeStripeStatus(status: Stripe.Subscription.Status): string {
  switch (status) {
    case "trialing":
      return "trialing";
    case "active":
      return "active";
    case "past_due":
      return "past_due";
    case "canceled":
      return "cancelled";
    case "unpaid":
      return "unpaid";
    case "incomplete":
      return "incomplete";
    case "incomplete_expired":
      return "incomplete_expired";
    case "paused":
      return "paused";
    default:
      return "inactive";
  }
}

function normalizePlanId(planId: string): string {
  const normalized = planId.trim().toLowerCase();

  if (normalized.includes("starter")) return "starter";
  if (normalized.includes("basic")) return "starter";
  if (normalized.includes("pro")) return "pro";
  if (normalized.includes("elite")) return "elite";
  if (normalized.includes("enterprise")) return "enterprise";
  if (normalized.includes("free")) return "free";

  return normalized || "free";
}

function planToMonthlyCredits(planId: string): number {
  switch (normalizePlanId(planId)) {
    case "free":
      return 200;
    case "starter":
      return 2_000;
    case "pro":
      return 0;
    case "elite":
      return 0;
    case "enterprise":
      return 0;
    default:
      return 0;
  }
}

function creditPackToCredits(creditPackId: string): number {
  switch (creditPackId as CreditPackId) {
    case "credits_10":
      return 10;
    case "credits_50":
      return 50;
    case "credits_150":
      return 150;
    case "credits_500":
      return 500;
    default:
      return 0;
  }
}

async function markWebhookProcessing(
  db: SupabaseClient,
  event: Stripe.Event
): Promise<boolean> {
  try {
    const record: WebhookEventRecord = {
      event_id: event.id,
      event_type: event.type,
      status: "processing",
      processed_at: null,
      error_message: null,
    };

    const { error } = await db.from(WEBHOOK_EVENTS_TABLE).insert(record);

    if (!error) {
      return true;
    }

    if (isUniqueViolation(error)) {
      console.info("[stripe-webhook] Duplicate event ignored:", event.id);
      return false;
    }

    console.error("[stripe-webhook] Failed to insert webhook event:", error.message);
    return true;
  } catch (error) {
    console.error("[stripe-webhook] Webhook idempotency insert failed:", error);
    return true;
  }
}

async function markWebhookStatus(
  db: SupabaseClient,
  eventId: string,
  status: WebhookProcessStatus,
  errorMessage?: string
): Promise<void> {
  try {
    await db
      .from(WEBHOOK_EVENTS_TABLE)
      .update({
        status,
        processed_at: new Date().toISOString(),
        error_message: errorMessage?.slice(0, 1_000) ?? null,
      })
      .eq("event_id", eventId);
  } catch (error) {
    console.error("[stripe-webhook] Failed to update webhook status:", error);
  }
}

async function getUserIdFromCustomer(customerId: string): Promise<string | null> {
  try {
    const customer = await stripe.customers.retrieve(customerId);

    if (customer.deleted) {
      return null;
    }

    return (
      getMetadataValue(customer.metadata, "supabase_user_id") ??
      getMetadataValue(customer.metadata, "user_id")
    );
  } catch (error) {
    console.error("[stripe-webhook] Failed to retrieve customer:", error);
    return null;
  }
}

async function getUserIdFromSubscription(
  subscription: Stripe.Subscription
): Promise<string | null> {
  const metadataUserId =
    getMetadataValue(subscription.metadata, "supabase_user_id") ??
    getMetadataValue(subscription.metadata, "user_id");

  if (metadataUserId) {
    return metadataUserId;
  }

  const firstItem = subscription.items.data[0];

  const priceMetadataUserId =
    getMetadataValue(firstItem?.price?.metadata, "supabase_user_id") ??
    getMetadataValue(firstItem?.price?.metadata, "user_id");

  if (priceMetadataUserId) {
    return priceMetadataUserId;
  }

  const customerId =
    typeof subscription.customer === "string"
      ? subscription.customer
      : subscription.customer.id;

  return getUserIdFromCustomer(customerId);
}

async function handleCheckoutCompleted(
  db: SupabaseClient,
  session: Stripe.Checkout.Session
): Promise<void> {
  const userId =
    getMetadataValue(session.metadata, "supabase_user_id") ??
    getMetadataValue(session.metadata, "user_id") ??
    session.client_reference_id ??
    null;

  if (session.mode === "payment") {
    await handleCreditPackCheckout(db, session, userId);
    return;
  }

  if (session.mode === "subscription") {
    const subscriptionId =
      typeof session.subscription === "string"
        ? session.subscription
        : session.subscription?.id;

    if (!subscriptionId) {
      console.warn("[stripe-webhook] checkout.session.completed missing subscription ID.");
      return;
    }

    const subscription = await stripe.subscriptions.retrieve(subscriptionId);
    await syncSubscription(db, subscription);
  }
}

async function handleCreditPackCheckout(
  db: SupabaseClient,
  session: Stripe.Checkout.Session,
  userId: string | null
): Promise<void> {
  if (!userId) {
    console.warn("[stripe-webhook] Credit checkout missing user ID.");
    return;
  }

  const creditPackId =
    getMetadataValue(session.metadata, "credit_pack_id") ??
    getMetadataValue(session.metadata, "creditPackId");

  if (!creditPackId) {
    console.warn("[stripe-webhook] Payment checkout missing credit pack ID.");
    return;
  }

  const creditsToAdd = creditPackToCredits(creditPackId);

  if (creditsToAdd <= 0) {
    console.warn("[stripe-webhook] Unknown credit pack:", creditPackId);
    return;
  }

  const { data: profile, error: readError } = await db
    .from("profiles")
    .select("credits")
    .eq("id", userId)
    .single();

  if (readError || !profile) {
    console.error("[stripe-webhook] Failed to load profile for credit pack:", readError?.message);
    return;
  }

  const currentCredits =
    typeof profile.credits === "number" ? profile.credits : 0;

  const nextCredits = currentCredits + creditsToAdd;

  const { error: updateError } = await db
    .from("profiles")
    .update({
      credits: nextCredits,
      updated_at: new Date().toISOString(),
    })
    .eq("id", userId);

  if (updateError) {
    console.error("[stripe-webhook] Failed to add credit pack:", updateError.message);
    return;
  }

  await db.from("credit_transactions").insert({
    user_id: userId,
    action: "purchase",
    amount: creditsToAdd,
    balance_after: nextCredits,
    description: `Stripe credit pack: ${creditPackId}`,
    stripe_session_id: session.id,
    created_at: new Date().toISOString(),
  });

  await logAuditEvent({
    userId,
    action: "CREDITS_ADD",
    resourceType: "billing",
    resourceId: session.id,
    status: "success",
    metadata: {
      creditPackId,
      creditsToAdd,
      balanceAfter: nextCredits,
    },
  });
}

async function syncSubscription(
  db: SupabaseClient,
  subscription: Stripe.Subscription
): Promise<void> {
  const customerId =
    typeof subscription.customer === "string"
      ? subscription.customer
      : subscription.customer.id;

  const userId = await getUserIdFromSubscription(subscription);

  if (!userId) {
    console.warn("[stripe-webhook] Subscription missing supabase_user_id metadata.");
    return;
  }

  const firstItem = subscription.items.data[0];

  const rawPlanId =
    firstItem?.price?.lookup_key ??
    firstItem?.price?.metadata?.plan_id ??
    firstItem?.price?.nickname ??
    "free";

  const planId = normalizePlanId(rawPlanId);
  const status = normalizeStripeStatus(subscription.status);
  const creditsMonthly = planToMonthlyCredits(planId);

  const { error: subscriptionError } = await db.from("subscriptions").upsert(
    {
      user_id: userId,
      stripe_customer_id: customerId,
      stripe_subscription_id: subscription.id,
      plan_id: planId,
      status,
      credits_monthly: creditsMonthly,
      current_period_start: new Date(
        subscription.current_period_start * 1000
      ).toISOString(),
      current_period_end: new Date(
        subscription.current_period_end * 1000
      ).toISOString(),
      cancel_at_period_end: subscription.cancel_at_period_end,
      updated_at: new Date().toISOString(),
    },
    {
      onConflict: "user_id,plan_id",
    }
  );

  if (subscriptionError) {
    console.error(
      "[stripe-webhook] subscriptions upsert error:",
      subscriptionError.message
    );
  }

  const profilePatch: Record<string, unknown> = {
    plan_id: planId,
    subscription_status: status,
    updated_at: new Date().toISOString(),
  };

  if (status === "active" || status === "trialing") {
    profilePatch.credits = creditsMonthly;
  }

  if (
    status === "cancelled" ||
    status === "unpaid" ||
    status === "incomplete_expired"
  ) {
    profilePatch.plan_id = "free";
  }

  const { error: profileError } = await db
    .from("profiles")
    .update(profilePatch)
    .eq("id", userId);

  if (profileError) {
    console.error("[stripe-webhook] profiles update error:", profileError.message);
  }

  await logAuditEvent({
    userId,
    action: "SUBSCRIPTION_CHANGE",
    resourceType: "subscription",
    resourceId: subscription.id,
    status: "success",
    metadata: {
      stripeCustomerId: customerId,
      planId,
      subscriptionStatus: status,
      creditsMonthly,
      cancelAtPeriodEnd: subscription.cancel_at_period_end,
    },
  });
}

async function handleInvoicePaymentSucceeded(
  db: SupabaseClient,
  invoice: Stripe.Invoice
): Promise<void> {
  const subscriptionId =
    typeof invoice.subscription === "string"
      ? invoice.subscription
      : invoice.subscription?.id;

  if (!subscriptionId) {
    return;
  }

  const subscription = await stripe.subscriptions.retrieve(subscriptionId);
  await syncSubscription(db, subscription);
}

Deno.serve(async (req: Request) => {
  if (req.method !== "POST") {
    return json(405, {
      error: "Method not allowed.",
      code: "METHOD_NOT_ALLOWED",
    });
  }

  if (!STRIPE_SECRET_KEY || !STRIPE_WEBHOOK_SECRET) {
    console.error("[stripe-webhook] Missing Stripe secret key or webhook secret.");

    return json(500, {
      error: "Webhook is not configured.",
      code: "WEBHOOK_NOT_CONFIGURED",
    });
  }

  const signature = getStripeSignature(req);

  if (!signature) {
    return json(400, {
      error: "Missing Stripe signature.",
      code: "MISSING_SIGNATURE",
    });
  }

  const rawBody = await req.text();

  let event: Stripe.Event;

  try {
    event = await stripe.webhooks.constructEventAsync(
      rawBody,
      signature,
      STRIPE_WEBHOOK_SECRET,
      undefined,
      cryptoProvider
    );
  } catch (error) {
    console.error("[stripe-webhook] Signature verification failed:", error);

    await logAuditEvent({
      userId: null,
      action: "STRIPE_WEBHOOK_RECEIVED",
      resourceType: "webhook",
      resourceId: null,
      status: "blocked",
      metadata: {
        reason: "Invalid Stripe signature.",
      },
    });

    return json(400, {
      error: "Invalid signature.",
      code: "INVALID_SIGNATURE",
    });
  }

  const db = createServiceClient();

  const shouldProcess = await markWebhookProcessing(db, event);

  if (!shouldProcess) {
    return json(200, {
      ok: true,
      duplicate: true,
    });
  }

  await logAuditEvent({
    userId: null,
    action: "STRIPE_WEBHOOK_RECEIVED",
    resourceType: "webhook",
    resourceId: event.id,
    status: "success",
    metadata: {
      eventType: event.type,
      livemode: event.livemode,
    },
  });

  try {
    switch (event.type) {
      case "checkout.session.completed": {
        const session = event.data.object as Stripe.Checkout.Session;
        await handleCheckoutCompleted(db, session);
        break;
      }

      case "customer.subscription.created":
      case "customer.subscription.updated":
      case "customer.subscription.deleted": {
        const subscription = event.data.object as Stripe.Subscription;
        await syncSubscription(db, subscription);
        break;
      }

      case "invoice.payment_succeeded": {
        const invoice = event.data.object as Stripe.Invoice;
        await handleInvoicePaymentSucceeded(db, invoice);
        break;
      }

      default: {
        console.info("[stripe-webhook] Ignoring event type:", event.type);

        await markWebhookStatus(db, event.id, "ignored");

        return json(200, {
          ok: true,
          ignored: true,
          event_type: event.type,
        });
      }
    }

    await markWebhookStatus(db, event.id, "processed");

    await logAuditEvent({
      userId: null,
      action: "STRIPE_WEBHOOK_PROCESSED",
      resourceType: "webhook",
      resourceId: event.id,
      status: "success",
      metadata: {
        eventType: event.type,
        livemode: event.livemode,
      },
    });

    return json(200, {
      ok: true,
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Webhook handling failed.";

    console.error("[stripe-webhook] Handler error:", message);

    await markWebhookStatus(db, event.id, "failed", message);

    await logAuditEvent({
      userId: null,
      action: "STRIPE_WEBHOOK_PROCESSED",
      resourceType: "webhook",
      resourceId: event.id,
      status: "failure",
      metadata: {
        eventType: event.type,
        error: message,
      },
    });

    return json(500, {
      error: "Webhook handling failed.",
      code: "WEBHOOK_HANDLER_FAILED",
    });
  }
});
