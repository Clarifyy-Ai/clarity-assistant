// supabase/functions/create-billing-portal/index.ts
//
// Creates a Stripe Billing// Creates a Stripe Billing Portal session.
// - strict request validation
// - required Idempotency-Key header
// - safe return URL validation
// - Stripe customer lookup/creation fallback
// - rate limiting
// - audit logging
// - safe JSON responses

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
  logRateLimitBlocked,
  logValidationFailure,
} from "../_shared/audit.ts";

import { createServiceClient } from "../_shared/supabase.ts";

import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";

const FUNCTION_NAME = "create-billing-portal";

const STRIPE_SECRET_KEY = Deno.env.get("STRIPE_SECRET_KEY") ?? "";
const PUBLIC_URL = Deno.env.get("PUBLIC_URL") ?? "";

type BillingProfile = {
  stripe_customer_id?: string | null;
  full_name?: string | null;
  email?: string | null;
};

const idempotencyKeySchema = z
  .string()
  .trim()
  .min(16, "Idempotency-Key must be at least 16 characters.")
  .max(150, "Idempotency-Key is too long.")
  .regex(/^[A-Za-z0-9._:-]+$/, "Idempotency-Key contains invalid characters.");

const billingPortalSchema = z.object({
  return_url: z
    .string()
    .trim()
    .url("Invalid return_url."),
});

type BillingPortalRequest = z.infer<typeof billingPortalSchema>;

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

function normalizeOrigin(rawUrl: string): string | null {
  try {
    const parsed = new URL(rawUrl);

    if (parsed.protocol !== "https:" && parsed.protocol !== "http:") {
      return null;
    }

    if (
      parsed.protocol === "http:" &&
      parsed.hostname !== "localhost" &&
      parsed.hostname !== "127.0.0.1"
    ) {
      return null;
    }

    return parsed.origin;
  } catch {
    return null;
  }
}

function getAllowedReturnOrigins(): Set<string> {
  const origins = new Set<string>([
    "http://localhost:3000",
    "http://localhost:4173",
    "http://localhost:5000",
    "http://localhost:5173",
    "http://127.0.0.1:3000",
    "http://127.0.0.1:4173",
    "http://127.0.0.1:5000",
    "http://127.0.0.1:5173",
  ]);

  if (PUBLIC_URL) {
    const publicOrigin = normalizeOrigin(PUBLIC_URL);

    if (publicOrigin) {
      origins.add(publicOrigin);
    }
  }

  const allowedOriginsEnv = Deno.env.get("ALLOWED_ORIGINS") ?? "";

  for (const origin of allowedOriginsEnv.split(",")) {
    const normalized = normalizeOrigin(origin.trim());

    if (normalized) {
      origins.add(normalized);
    }
  }

  return origins;
}

function isAllowedReturnUrl(rawUrl: string): boolean {
  const origin = normalizeOrigin(rawUrl);

  if (!origin) {
    return false;
  }

  return getAllowedReturnOrigins().has(origin);
}

async function parseAndValidateRequest(
  req: Request,
  corsHeaders: HeadersInit
): Promise<
  | {
      ok: true;
      data: BillingPortalRequest;
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

  let rawBody: unknown;

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

  const validationResult = billingPortalSchema.safeParse(rawBody);

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

async function getOrCreateStripeCustomer(options: {
  stripe: Stripe;
  db: SupabaseClient;
  userId: string;
  userEmail?: string | null;
}): Promise<string> {
  const { stripe, db, userId, userEmail } = options;

  const { data: profileData, error: profileError } = await db
    .from("profiles")
    .select("stripe_customer_id, full_name, email")
    .eq("id", userId)
    .single();

  if (profileError) {
    console.warn(
      "[create-billing-portal] Failed to load profile:",
      profileError.message
    );
  }

  const profile = profileData as BillingProfile | null;

  if (profile?.stripe_customer_id) {
    return profile.stripe_customer_id;
  }

  const customer = await stripe.customers.create({
    email: userEmail ?? profile?.email ?? undefined,
    name: profile?.full_name ?? undefined,
    metadata: {
      supabase_user_id: userId,
      user_id: userId,
    },
  });

  const { error: updateError } = await db
    .from("profiles")
    .update({
      stripe_customer_id: customer.id,
      updated_at: new Date().toISOString(),
    })
    .eq("id", userId);

  if (updateError) {
    console.warn(
      "[create-billing-portal] Failed to save Stripe customer ID:",
      updateError.message
    );
  }

  return customer.id;
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
    console.error("[create-billing-portal] STRIPE_SECRET_KEY is not configured.");

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

  if (!isAllowedReturnUrl(data.return_url)) {
    await logValidationFailure({
      req,
      userId: user.id,
      functionName: FUNCTION_NAME,
      details: {
        reason: "Invalid return_url.",
      },
    });

    return json(corsHeaders, 400, {
      error: "Invalid return URL.",
      code: "INVALID_RETURN_URL",
    });
  }

  const stripe = new Stripe(STRIPE_SECRET_KEY, {
    apiVersion: "2024-04-10",
    httpClient: Stripe.createFetchHttpClient(),
  });

  const db = createServiceClient();

  try {
    const customerId = await getOrCreateStripeCustomer({
      stripe,
      db,
      userId: user.id,
      userEmail: user.email,
    });

    const portalSession = await stripe.billingPortal.sessions.create(
      {
        customer: customerId,
        return_url: data.return_url,
      },
      {
        idempotencyKey,
      }
    );

    await logBillingAudit({
      req,
      userId: user.id,
      action: "SUBSCRIPTION_RESUME",
      resourceId: portalSession.id,
      status: "success",
      metadata: {
        stripeCustomerId: customerId,
        returnUrlOrigin: normalizeOrigin(data.return_url),
        operation: "billing_portal_create",
      },
    });

    return json(corsHeaders, 200, {
      url: portalSession.url,
      session_id: portalSession.id,
    });
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : "Billing portal creation failed.";

    console.error("[create-billing-portal] Stripe portal failed:", message);

    await logBillingAudit({
      req,
      userId: user.id,
      action: "SUBSCRIPTION_RESUME",
      resourceId: null,
      status: "failure",
      metadata: {
        reason: message,
        operation: "billing_portal_create",
      },
    });

    return json(corsHeaders, 500, {
      error: "Billing portal creation failed.",
      code: "BILLING_PORTAL_CREATE_FAILED",
    });
  }
});
//
// Production hardening included:
// - CORS handling
// - POST-only method enforcement
