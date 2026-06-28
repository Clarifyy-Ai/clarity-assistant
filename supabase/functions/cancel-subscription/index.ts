// supabase/functions/cancel-subscription/index.ts
//
// Cancels a Stripe subscription at period end.

import Stripe from "https://esm.sh/stripe@14.21.0?target=deno&deno-std=0.132.0";
import { z } from "https://deno.land/x/zod@v3.22.4/mod.ts";

import {
  handleCors,
  getCorsHeaders,
  withCorsHeaders,
} from "../_shared/cors.ts";

import { authenticateRequest } from "../_shared/auth.ts";

import {
  checkRateLimit,
  createRateLimitKey,
  rateLimitResponse,
  RATE_LIMIT_PRESETS,
} from "../_shared/rateLimit.ts";

import { parseJsonBody } from "../_shared/errors.ts";

import {
  logAuthFailure,
  logBillingAudit,
  logPermissionDenied,
  logRateLimitBlocked,
  logValidationFailure,
} from "../_shared/audit.ts";

import { createServiceClient } from "../_shared/supabase.ts";

const FUNCTION_NAME = "cancel-subscription";

const STRIPE_SECRET_KEY = Deno.env.get("STRIPE_SECRET_KEY") ?? "";

type SubscriptionRow = {
  stripe_subscription_id: string | null;
  stripe_customer_id: string | null;
  plan_id?: string | null;
  status?: string | null;
};

const idempotencyKeySchema = z
  .string()
  .trim()
  .min(16, "Idempotency-Key must be at least 16 characters.")
  .max(150, "Idempotency-Key is too long.")
  .regex(/^[A-Za-z0-9._:-]+$/, "Idempotency-Key contains invalid characters.");

const cancelSubscriptionSchema = z
  .object({
    reason: z
      .string()
      .trim()
      .max(2_000, "Cancellation reason is too long.")
      .optional(),

    subscription_id: z
      .string()
      .trim()
      .max(200, "subscription_id is too long.")
      .optional(),
  })
  .optional()
  .default({});

type CancelSubscriptionRequest = z.infer<typeof cancelSubscriptionSchema>;

function json(
  corsHeaders: HeadersInit,
  status: number,
  body: unknown
): Response {
  const headers = new Headers(corsHeaders);
  headers.set("Content-Type", "application/json");
  headers.set("Cache-Control", "no-store");

  return new Response(JSON.stringify(body), {
    status,
    headers,
  });
}

function getIdempotencyKey(req: Request): string | null {
  return (
    req.headers.get("Idempotency-Key") ??
    req.headers.get("idempotency-key")
  );
}

function zodErrors(error: z.ZodError): Record<string, string[]> {
  const fieldErrors: Record<string, string[]> = {};

  for (const issue of error.issues) {
    const key =
      issue.path.length > 0 ? issue.path.map(String).join(".") : "_form";

    if (!fieldErrors[key]) {
      fieldErrors[key] = [];
    }

    fieldErrors[key].push(issue.message);
  }

  return fieldErrors;
}

function normalizeStripeSubscriptionStatus(
  status: Stripe.Subscription.Status
): string {
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

function getStripeCustomerId(subscription: Stripe.Subscription): string {
  return typeof subscription.customer === "string"
    ? subscription.customer
    : subscription.customer.id;
}

async function parseAndValidateRequest(
  req: Request,
  corsHeaders: HeadersInit
): Promise<
  | {
      ok: true;
      data: CancelSubscriptionRequest;
      idempotencyKey: string;
    }
  | {
      ok: false;
      response: Response;
      details?: unknown;
    }
> {
  const rawIdempotencyKey = getIdempotencyKey(req);
  const idempotencyResult = idempotencyKeySchema.safeParse(rawIdempotencyKey);

  if (!idempotencyResult.success) {
    return {
      ok: false,
      details: zodErrors(idempotencyResult.error),
      response: json(corsHeaders, 400, {
        error: "Valid Idempotency-Key header is required.",
        code: "IDEMPOTENCY_KEY_REQUIRED",
        details: {
          fieldErrors: zodErrors(idempotencyResult.error),
        },
      }),
    };
  }

  let rawBody: unknown = {};

  const contentLength = req.headers.get("content-length");

  if (contentLength && Number(contentLength) > 0) {
    try {
      rawBody = await parseJsonBody(req);
    } catch {
      return {
        ok: false,
        response: json(corsHeaders, 400, {
          error: "Invalid JSON payload.",
          code: "BAD_REQUEST",
        }),
      };
    }
  }

  const validationResult = cancelSubscriptionSchema.safeParse(rawBody);

  if (!validationResult.success) {
    return {
      ok: false,
      details: zodErrors(validationResult.error),
      response: json(corsHeaders, 422, {
        error: "Validation failed.",
        code: "VALIDATION_ERROR",
        details: {
          fieldErrors: zodErrors(validationResult.error),
        },
      }),
    };
  }

  return {
    ok: true,
    data: validationResult.data,
    idempotencyKey: idempotencyResult.data,
  };
}

Deno.serve(async (req: Request) => {
  const corsResponse = handleCors(req);

  if (corsResponse) {
    return corsResponse;
  }

  const corsHeaders = getCorsHeaders(req);

  if (req.method !== "POST") {
    return json(corsHeaders, 405, {
      error: "Method not allowed.",
      code: "METHOD_NOT_ALLOWED",
    });
  }

  if (!STRIPE_SECRET_KEY) {
    console.error("[cancel-subscription] STRIPE_SECRET_KEY is not configured.");

    return json(corsHeaders, 503, {
      error: "Stripe is not configured.",
      code: "SERVICE_UNAVAILABLE",
    });
  }

  const auth = await authenticateRequest(req);

  if (auth.error) {
    await logAuthFailure({
      req,
      functionName: FUNCTION_NAME,
      reason: "Missing or invalid access token.",
    });

    return withCorsHeaders(req, auth.error);
  }

  const { user } = auth.context;

  const rateLimitResult = checkRateLimit({
    key: createRateLimitKey(FUNCTION_NAME, user.id),
    ...RATE_LIMIT_PRESETS.PAYMENT_ACTION,
  });

  if (!rateLimitResult.allowed) {
    await logRateLimitBlocked({
      req,
      userId: user.id,
      functionName: FUNCTION_NAME,
      limit: rateLimitResult.limit,
      retryAfterSeconds: rateLimitResult.retryAfterSeconds,
    });

    return withCorsHeaders(req, rateLimitResponse(rateLimitResult));
  }

  const validation = await parseAndValidateRequest(req, corsHeaders);

  if (!validation.ok) {
    await logValidationFailure({
      req,
      userId: user.id,
      functionName: FUNCTION_NAME,
      details: validation.details,
    });

    return validation.response;
  }

  const { data, idempotencyKey } = validation;

  const stripe = new Stripe(STRIPE_SECRET_KEY, {
    apiVersion: "2024-04-10",
    httpClient: Stripe.createFetchHttpClient(),
  });

  const db = createServiceClient();

  try {
    const { data: subscriptionData, error: subscriptionError } = await db
      .from("subscriptions")
      .select("stripe_subscription_id, stripe_customer_id, plan_id, status")
      .eq("user_id", user.id)
      .maybeSingle();

    if (subscriptionError) {
      console.error(
        "[cancel-subscription] Subscription lookup failed:",
        subscriptionError.message
      );

      return json(corsHeaders, 500, {
        error: "Failed to load subscription.",
        code: "SUBSCRIPTION_LOOKUP_FAILED",
      });
    }

    const subscriptionRow = subscriptionData as SubscriptionRow | null;

    if (!subscriptionRow?.stripe_subscription_id) {
      return json(corsHeaders, 404, {
        error: "No active subscription found.",
        code: "SUBSCRIPTION_NOT_FOUND",
      });
    }

    if (
      data.subscription_id &&
      data.subscription_id !== subscriptionRow.stripe_subscription_id
    ) {
      await logPermissionDenied({
        req,
        userId: user.id,
        functionName: FUNCTION_NAME,
        resourceType: "subscription",
        resourceId: data.subscription_id,
        reason: "Requested subscription does not belong to authenticated user.",
      });

      return json(corsHeaders, 403, {
        error: "Unauthorized subscription access.",
        code: "FORBIDDEN",
      });
    }

    const subscription = await stripe.subscriptions.retrieve(
      subscriptionRow.stripe_subscription_id
    );

    const stripeCustomerId = getStripeCustomerId(subscription);

    if (
      subscriptionRow.stripe_customer_id &&
      stripeCustomerId !== subscriptionRow.stripe_customer_id
    ) {
      await logPermissionDenied({
        req,
        userId: user.id,
        functionName: FUNCTION_NAME,
        resourceType: "subscription",
        resourceId: subscription.id,
        reason: "Stripe customer mismatch.",
      });

      return json(corsHeaders, 403, {
        error: "Unauthorized subscription access.",
        code: "FORBIDDEN",
      });
    }

    if (subscription.cancel_at_period_end === true) {
      await logBillingAudit({
        req,
        userId: user.id,
        action: "SUBSCRIPTION_CANCEL",
        resourceId: subscription.id,
        status: "success",
        metadata: {
          alreadyCanceled: true,
          cancelAt: subscription.cancel_at,
          status: subscription.status,
        },
      });

      return json(corsHeaders, 200, {
        success: true,
        already_canceled: true,
        cancel_at: subscription.cancel_at,
        cancel_at_period_end: true,
      });
    }

    if (subscription.status === "canceled") {
      await logBillingAudit({
        req,
        userId: user.id,
        action: "SUBSCRIPTION_CANCEL",
        resourceId: subscription.id,
        status: "success",
        metadata: {
          alreadyCanceled: true,
          status: subscription.status,
        },
      });

      return json(corsHeaders, 200, {
        success: true,
        already_canceled: true,
        cancel_at: null,
        cancel_at_period_end: true,
      });
    }

    const updatedSubscription = await stripe.subscriptions.update(
      subscription.id,
      {
        cancel_at_period_end: true,
        metadata: {
          ...subscription.metadata,
          cancellation_requested_by: user.id,
          cancellation_reason: data.reason ?? "",
        },
      },
      {
        idempotencyKey,
      }
    );

    const cancelAtIso =
      updatedSubscription.cancel_at != null
        ? new Date(updatedSubscription.cancel_at * 1000).toISOString()
        : null;

    const normalizedStatus = normalizeStripeSubscriptionStatus(
      updatedSubscription.status
    );

    const { error: updateError } = await db
      .from("subscriptions")
      .update({
        status: normalizedStatus,
        cancel_at: cancelAtIso,
        cancel_at_period_end: updatedSubscription.cancel_at_period_end,
        updated_at: new Date().toISOString(),
      })
      .eq("user_id", user.id)
      .eq("stripe_subscription_id", updatedSubscription.id);

    if (updateError) {
      console.warn(
        "[cancel-subscription] Failed to update subscriptions row:",
        updateError.message
      );
    }

    const { error: profileUpdateError } = await db
      .from("profiles")
      .update({
        subscription_status: normalizedStatus,
        updated_at: new Date().toISOString(),
      })
      .eq("id", user.id);

    if (profileUpdateError) {
      console.warn(
        "[cancel-subscription] Failed to update profile subscription status:",
        profileUpdateError.message
      );
    }

    await logBillingAudit({
      req,
      userId: user.id,
      action: "SUBSCRIPTION_CANCEL",
      resourceId: updatedSubscription.id,
      status: "success",
      metadata: {
        cancelAt: updatedSubscription.cancel_at,
        cancelAtIso,
        cancelAtPeriodEnd: updatedSubscription.cancel_at_period_end,
        stripeCustomerId,
        reason: data.reason ?? null,
      },
    });

    return json(corsHeaders, 200, {
      success: true,
      subscription_id: updatedSubscription.id,
      cancel_at: updatedSubscription.cancel_at,
      cancel_at_iso: cancelAtIso,
      cancel_at_period_end: updatedSubscription.cancel_at_period_end,
      status: normalizedStatus,
    });
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : "Subscription cancellation failed.";

    console.error("[cancel-subscription] Error:", message);

    await logBillingAudit({
      req,
      userId: user.id,
      action: "SUBSCRIPTION_CANCEL",
      resourceId: data.subscription_id ?? null,
      status: "failure",
      metadata: {
        reason: message,
      },
    });

    return json(corsHeaders, 500, {
      error: "Subscription cancellation failed.",
      code: "SUBSCRIPTION_CANCEL_FAILED",
    });
  }
});
