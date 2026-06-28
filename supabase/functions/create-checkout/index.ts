// supabase/functions/create-checkout/index.ts
//
// Creates Stripe Checkout sessions.
//
// Productionency-Key header// Production hardening included:
// - trusted server-side price allowlist
// - safe redirect URL allowlist
// - Stripe customer reuse/creation
// - Stripe idempotency request option
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
import { PLAN_MONTHLY_CREDITS } from "../_shared/creditEconomics.ts";

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

const FUNCTION_NAME = "create-checkout";

const PUBLIC_URL = Deno.env.get("PUBLIC_URL") ?? "";
const STRIPE_SECRET_KEY = Deno.env.get("STRIPE_SECRET_KEY") ?? "";

type CheckoutMode = "subscription" | "payment";

type PriceEntitlement = {
  mode: CheckoutMode;
  planId?: string;
  creditPackId?: string;
  credits?: number;
  monthlyCredits?: number;
};

type CheckoutProfile = {
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

const createCheckoutSchema = z.object({
  price_id: z
    .string()
    .trim()
    .min(1, "price_id is required.")
    .max(200, "price_id is too long.")
    .regex(/^price_[A-Za-z0-9_]+$/, "Invalid Stripe price ID."),

  success_url: z
    .string()
    .trim()
    .url("Invalid success_url."),

  cancel_url: z
    .string()
    .trim()
    .url("Invalid cancel_url."),

  coupon_code: z
    .string()
    .trim()
    .max(100, "coupon_code is too long.")
    .regex(/^[A-Za-z0-9_-]*$/, "coupon_code contains invalid characters.")
    .optional(),
});

type CreateCheckoutRequest = z.infer<typeof createCheckoutSchema>;

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

function buildPriceAllowlist(): Map<string, PriceEntitlement> {
  const allowlist = new Map<string, PriceEntitlement>();

  function add(envKey: string, entitlement: PriceEntitlement): void {
    const priceId = Deno.env.get(envKey);

    if (priceId && priceId.trim().length > 0) {
      allowlist.set(priceId.trim(), entitlement);
    }
  }

  // Subscriptions
  add("STRIPE_PRICE_STARTER_MONTHLY", {
    mode: "subscription",
    planId: "starter",
    monthlyCredits: PLAN_MONTHLY_CREDITS.starter,
  });

  add("STRIPE_PRICE_STARTER_YEARLY", {
    mode: "subscription",
    planId: "starter",
    monthlyCredits: PLAN_MONTHLY_CREDITS.starter,
  });

  add("STRIPE_PRICE_PRO_MONTHLY", {
    mode: "subscription",
    planId: "pro",
    monthlyCredits: PLAN_MONTHLY_CREDITS.pro,
  });

  add("STRIPE_PRICE_PRO_YEARLY", {
    mode: "subscription",
    planId: "pro",
    monthlyCredits: PLAN_MONTHLY_CREDITS.pro,
  });

  add("STRIPE_PRICE_ELITE_MONTHLY", {
    mode: "subscription",
    planId: "elite",
    monthlyCredits: PLAN_MONTHLY_CREDITS.elite,
  });

  add("STRIPE_PRICE_ELITE_YEARLY", {
    mode: "subscription",
    planId: "elite",
    monthlyCredits: PLAN_MONTHLY_CREDITS.elite,
  });

  add("STRIPE_PRICE_ENTERPRISE_MONTHLY", {
    mode: "subscription",
    planId: "enterprise",
    monthlyCredits: PLAN_MONTHLY_CREDITS.enterprise,
  });

  add("STRIPE_PRICE_ENTERPRISE_YEARLY", {
    mode: "subscription",
    planId: "enterprise",
    monthlyCredits: PLAN_MONTHLY_CREDITS.enterprise,
  });

  // Credit packs
  add("STRIPE_PRICE_CREDITS_10", {
    mode: "payment",
    creditPackId: "credits_10",
    credits: 10,
  });

  add("STRIPE_PRICE_CREDITS_50", {
    mode: "payment",
    creditPackId: "credits_50",
    credits: 50,
  });

  add("STRIPE_PRICE_CREDITS_150", {
    mode: "payment",
    creditPackId: "credits_150",
    credits: 150,
  });

  add("STRIPE_PRICE_CREDITS_500", {
    mode: "payment",
    creditPackId: "credits_500",
    credits: 500,
  });

  return allowlist;
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

function getAllowedRedirectOrigins(): Set<string> {
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

  const publicOrigin = PUBLIC_URL ? normalizeOrigin(PUBLIC_URL) : null;

  if (publicOrigin) {
    origins.add(publicOrigin);
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

function isAllowedRedirectUrl(rawUrl: string): boolean {
  const origin = normalizeOrigin(rawUrl);

  if (!origin) {
    return false;
  }

  return getAllowedRedirectOrigins().has(origin);
}

async function parseAndValidateRequest(
  req: Request,
  corsHeaders: HeadersInit
): Promise<
  | {
      ok: true;
      data: CreateCheckoutRequest;
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

  const validationResult = createCheckoutSchema.safeParse(rawBody);

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
      "[create-checkout] Failed to load profile:",
      profileError.message
    );
  }

  const profile = profileData as CheckoutProfile | null;

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
      "[create-checkout] Failed to save Stripe customer ID:",
      updateError.message
    );
  }

  return customer.id;
}

function buildCheckoutMetadata(options: {
  userId: string;
  priceId: string;
  entitlement: PriceEntitlement;
  idempotencyKey: string;
}): Record<string, string> {
  const metadata: Record<string, string> = {
    user_id: options.userId,
    supabase_user_id: options.userId,
    price_id: options.priceId,
    idempotency_key: options.idempotencyKey,
  };

  if (options.entitlement.planId) {
    metadata.plan_id = options.entitlement.planId;
  }

  if (options.entitlement.creditPackId) {
    metadata.credit_pack_id = options.entitlement.creditPackId;
  }

  if (typeof options.entitlement.credits === "number") {
    metadata.credit_amount = String(options.entitlement.credits);
  }

  if (typeof options.entitlement.monthlyCredits === "number") {
    metadata.monthly_credits = String(options.entitlement.monthlyCredits);
  }

  return metadata;
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
    console.error("[create-checkout] STRIPE_SECRET_KEY is not configured.");

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

  if (
    !isAllowedRedirectUrl(data.success_url) ||
    !isAllowedRedirectUrl(data.cancel_url)
  ) {
    await logValidationFailure({
      req,
      userId: user.id,
      functionName: FUNCTION_NAME,
      details: {
        reason: "Invalid redirect URLs.",
      },
    });

    return json(corsHeaders, 400, {
      error: "Invalid redirect URLs.",
      code: "INVALID_REDIRECT_URL",
    });
  }

  const priceAllowlist = buildPriceAllowlist();
  const entitlement = priceAllowlist.get(data.price_id);

  if (!entitlement) {
    await logValidationFailure({
      req,
      userId: user.id,
      functionName: FUNCTION_NAME,
      details: {
        reason: "Unknown price_id.",
      },
    });

    return json(corsHeaders, 400, {
      error: "Invalid or unrecognized price_id.",
      code: "INVALID_PRICE_ID",
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

    const metadata = buildCheckoutMetadata({
      userId: user.id,
      priceId: data.price_id,
      entitlement,
      idempotencyKey,
    });

    const params: Stripe.Checkout.SessionCreateParams = {
      customer: customerId,
      line_items: [
        {
          price: data.price_id,
          quantity: 1,
        },
      ],
      mode: entitlement.mode,
      success_url: data.success_url,
      cancel_url: data.cancel_url,
      allow_promotion_codes: true,
      metadata,
      payment_method_types: ["card"],
      client_reference_id: user.id,
    };

    if (entitlement.mode === "subscription") {
      params.subscription_data = {
        metadata,
      };
    }

    if (data.coupon_code?.trim()) {
      params.discounts = [{ coupon: data.coupon_code.trim() }];
    }

    const session = await stripe.checkout.sessions.create(params, {
      idempotencyKey,
    });

    await logBillingAudit({
      req,
      userId: user.id,
      action: "CHECKOUT_CREATE",
      resourceId: session.id,
      status: "success",
      metadata: {
        mode: entitlement.mode,
        priceId: data.price_id,
        planId: entitlement.planId ?? null,
        creditPackId: entitlement.creditPackId ?? null,
        credits: entitlement.credits ?? null,
        monthlyCredits: entitlement.monthlyCredits ?? null,
      },
    });

    return json(corsHeaders, 200, {
      url: session.url,
      session_id: session.id,
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Checkout creation failed.";

    console.error("[create-checkout] Stripe checkout failed:", message);

    await logBillingAudit({
      req,
      userId: user.id,
      action: "CHECKOUT_CREATE",
      resourceId: null,
      status: "failure",
      metadata: {
        reason: message,
        priceId: data.price_id,
        mode: entitlement.mode,
      },
    });

    return json(corsHeaders, 500, {
      error: "Checkout creation failed.",
      code: "CHECKOUT_CREATE_FAILED",
    });
  }
});
