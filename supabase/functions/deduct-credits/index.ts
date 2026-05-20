// supabase/functions/deduct-credits/index.ts// supabase/functions/deduct-credits AI/session actions.
//
// Production hardening included:
// - CORS handling
// - POST-only method enforcement
// - centralized JWT authentication
// - required Idempotency-Key header
// - strict payload validation
// - rate limiting
// - atomic credit deduction
// - audit logging
// - safe JSON responses

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

import {
  parseJsonBody,
} from "../_shared/errors.ts";

import {
  logAuthFailure,
  logBillingAudit,
  logRateLimitBlocked,
  logValidationFailure,
} from "../_shared/audit.ts";

import { deductCreditsAtomic } from "../_shared/supabase.ts";

const FUNCTION_NAME = "deduct-credits";

const idempotencyKeySchema = z
  .string()
  .trim()
  .min(16, "Idempotency-Key must be at least 16 characters.")
  .max(150, "Idempotency-Key is too long.")
  .regex(/^[A-Za-z0-9._:-]+$/, "Idempotency-Key contains invalid characters.");

const deductCreditsRequestSchema = z.object({
  // Backward compatible with existing callers.
  action: z
    .string()
    .trim()
    .min(1, "Action is required.")
    .max(100, "Action is too long.")
    .regex(/^[A-Za-z0-9._:-]+$/, "Action contains invalid characters."),

  cost: z
    .number()
    .int("Cost must be a whole number.")
    .min(1, "Cost must be at least 1.")
    .max(10_000, "Cost is too large."),

  session_id: z
    .string()
    .uuid("Invalid session ID.")
    .nullable()
    .optional(),

  reference_id: z
    .string()
    .uuid("Invalid reference ID.")
    .nullable()
    .optional(),
});

type DeductCreditsRequest = z.infer<typeof deductCreditsRequestSchema>;

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
    const key = issue.path.length > 0 ? issue.path.map(String).join(".") : "_form";

    if (!fieldErrors[key]) {
      fieldErrors[key] = [];
    }

    fieldErrors[key].push(issue.message);
  }

  return fieldErrors;
}

async function parseAndValidateRequest(
  req: Request,
  corsHeaders: HeadersInit
): Promise<
  | {
      ok: true;
      data: DeductCreditsRequest;
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

  const validationResult = deductCreditsRequestSchema.safeParse(rawBody);

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

  const result = await deductCreditsAtomic({
    userId: user.id,
    action: data.action,
    cost: data.cost,
    sessionId: data.session_id ?? null,
    idempotencyKey,
  });

  if (!result.success) {
    const message = result.error ?? "Credit deduction failed.";
    const isInsufficient = message.toLowerCase().includes("insufficient");

    await logBillingAudit({
      req,
      userId: user.id,
      action: "CREDITS_DEDUCT",
      resourceId: data.session_id ?? data.reference_id ?? null,
      status: "failure",
      metadata: {
        reason: message,
        creditAction: data.action,
        cost: data.cost,
        idempotencyKey,
      },
    });

    return json(corsHeaders, isInsufficient ? 402 : 500, {
      error: isInsufficient ? message : "Credit deduction failed.",
      code: isInsufficient ? "PAYMENT_REQUIRED" : "CREDIT_DEDUCTION_FAILED",
    });
  }

  await logBillingAudit({
    req,
    userId: user.id,
    action: "CREDITS_DEDUCT",
    resourceId: data.session_id ?? data.reference_id ?? null,
    status: "success",
    metadata: {
      creditAction: data.action,
      cost: data.cost,
      balanceAfter: result.balanceAfter ?? 0,
      transactionId: result.transactionId ?? null,
      idempotencyKey,
    },
  });

  return json(corsHeaders, 200, {
    credits_remaining: result.balanceAfter ?? 0,
    transaction_id: result.transactionId ?? null,
  });
});
//
