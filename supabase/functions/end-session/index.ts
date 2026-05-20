// supabase/functions/end-session/index.ts
//
// Finalizes an interview session ownership protection// Finalizes an interview session.
// - safe final status update
// - final metrics handling
// - rate limiting
// - audit logging
// - safe JSON responses

import { z } from "https://deno.land/x/zod@v3.22.4/mod.ts";

import {
  handleCors,
  getCorsHeaders,
  withCorsHeaders,
} from "../_shared/cors.ts";

import {
  authenticateRequest,
  enforceResourceOwnership,
} from "../_shared/auth.ts";

import {
  checkRateLimit,
  createRateLimitKey,
  rateLimitResponse,
  RATE_LIMIT_PRESETS,
} from "../_shared/rateLimit.ts";

import { parseJsonBody } from "../_shared/errors.ts";

import {
  logAuthFailure,
  logAuditEventFromRequest,
  logPermissionDenied,
  logRateLimitBlocked,
  logValidationFailure,
} from "../_shared/audit.ts";

import { createServiceClient } from "../_shared/supabase.ts";

const FUNCTION_NAME = "end-session";

const endSessionSchema = z.object({
  session_id: z.string().uuid("Invalid session ID."),

  status: z
    .enum(["completed", "cancelled", "failed"])
    .optional()
    .default("completed"),

  credits_used: z
    .number()
    .int("credits_used must be a whole number.")
    .min(0, "credits_used cannot be negative.")
    .max(100_000, "credits_used is too large.")
    .optional()
    .default(0),

  duration_seconds: z
    .number()
    .int("duration_seconds must be a whole number.")
    .min(0, "duration_seconds cannot be negative.")
    .max(24 * 60 * 60, "duration_seconds is too large.")
    .nullable()
    .optional(),

  overall_score: z
    .number()
    .min(0, "overall_score cannot be below 0.")
    .max(100, "overall_score cannot exceed 100.")
    .nullable()
    .optional(),

  avg_wpm: z
    .number()
    .min(0, "avg_wpm cannot be negative.")
    .max(500, "avg_wpm is too large.")
    .nullable()
    .optional(),

  total_filler_words: z
    .number()
    .int("total_filler_words must be a whole number.")
    .min(0, "total_filler_words cannot be negative.")
    .max(100_000, "total_filler_words is too large.")
    .nullable()
    .optional(),

  notes: z
    .string()
    .trim()
    .max(10_000, "Notes are too long.")
    .optional()
    .default(""),
});

type EndSessionRequest = z.infer<typeof endSessionSchema>;

type SessionRow = {
  id: string;
  user_id: string;
  status: string | null;
  started_at: string | null;
  duration_seconds: number | null;
};

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

function sanitizeText(value: unknown, limit = 10_000): string {
  return String(value ?? "")
    .replace(/<[^>]*>/g, "")
    .replace(/[\u0000-\u001F\u007F]/g, "")
    .slice(0, limit)
    .trim();
}

function calculateDurationSeconds(
  startedAt: string | null,
  fallbackDuration: number | null | undefined
): number | null {
  if (typeof fallbackDuration === "number" && Number.isFinite(fallbackDuration)) {
    return Math.floor(fallbackDuration);
  }

  if (!startedAt) {
    return null;
  }

  const startedAtMs = new Date(startedAt).getTime();

  if (!Number.isFinite(startedAtMs)) {
    return null;
  }

  const duration = Math.floor((Date.now() - startedAtMs) / 1000);

  if (!Number.isFinite(duration) || duration < 0) {
    return null;
  }

  return Math.min(duration, 24 * 60 * 60);
}

async function parseAndValidateRequest(
  req: Request,
  corsHeaders: HeadersInit
): Promise<
  | {
      ok: true;
      data: EndSessionRequest;
    }
  | {
      ok: false;
      response: Response;
      details?: unknown;
    }
> {
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

  const validation = endSessionSchema.safeParse(rawBody);

  if (!validation.success) {
    return {
      ok: false,
      details: zodErrors(validation.error),
      response: json(corsHeaders, 422, {
        error: "Validation failed.",
        code: "VALIDATION_ERROR",
        details: {
          fieldErrors: zodErrors(validation.error),
        },
      }),
    };
  }

  return {
    ok: true,
    data: {
      ...validation.data,
      notes: sanitizeText(validation.data.notes),
    },
  };
}

Deno.serve(async (req: Request) => {
  const corsResponse = handleCors(req);

  if (corsResponse) {
    return corsResponse;
  }

  const corsHeaders = getCorsHeaders(req);
  const requestId = crypto.randomUUID();

  if (req.method !== "POST") {
    return json(corsHeaders, 405, {
      error: "Method not allowed.",
      code: "METHOD_NOT_ALLOWED",
      request_id: requestId,
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
    ...RATE_LIMIT_PRESETS.SESSION_ACTION,
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

  const body = validation.data;

  const ownershipFailure = await enforceResourceOwnership({
    table: "sessions",
    resourceId: body.session_id,
    authenticatedUserId: user.id,
  });

  if (ownershipFailure) {
    await logPermissionDenied({
      req,
      userId: user.id,
      functionName: FUNCTION_NAME,
      resourceType: "session",
      resourceId: body.session_id,
      reason: "Session ownership check failed.",
    });

    return withCorsHeaders(req, ownershipFailure);
  }

  const db = createServiceClient();

  try {
    const { data: existingData, error: fetchError } = await db
      .from("sessions")
      .select("id, user_id, status, started_at, duration_seconds")
      .eq("id", body.session_id)
      .eq("user_id", user.id)
      .maybeSingle();

    if (fetchError || !existingData) {
      return json(corsHeaders, 404, {
        error: "Session not found.",
        code: "SESSION_NOT_FOUND",
        request_id: requestId,
      });
    }

    const existing = existingData as SessionRow;
    const nowIso = new Date().toISOString();

    if (
      existing.status === "completed" ||
      existing.status === "cancelled" ||
      existing.status === "failed"
    ) {
      await logAuditEventFromRequest({
        req,
        userId: user.id,
        action: "SESSION_END",
        resourceType: "session",
        resourceId: body.session_id,
        status: "success",
        metadata: {
          requestId,
          alreadyEnded: true,
          existingStatus: existing.status,
        },
      });

      return json(corsHeaders, 200, {
        success: true,
        request_id: requestId,
        session_id: body.session_id,
        status: existing.status,
        already_ended: true,
      });
    }

    const calculatedDuration = calculateDurationSeconds(
      existing.started_at,
      body.duration_seconds ?? existing.duration_seconds
    );

    const patch: Record<string, unknown> = {
      status: body.status,
      ended_at: nowIso,
      credits_consumed: body.credits_used,
      updated_at: nowIso,
    };

    if (calculatedDuration !== null) {
      patch.duration_seconds = calculatedDuration;
    }

    if (typeof body.overall_score === "number") {
      patch.overall_score = body.overall_score;
    }

    if (typeof body.avg_wpm === "number") {
      patch.avg_wpm = body.avg_wpm;
    }

    if (typeof body.total_filler_words === "number") {
      patch.total_filler_words = body.total_filler_words;
    }

    if (body.notes) {
      patch.notes = body.notes;
    }

    const { error: updateError } = await db
      .from("sessions")
      .update(patch)
      .eq("id", body.session_id)
      .eq("user_id", user.id);

    if (updateError) {
      console.error("[end-session] Update error:", updateError.message);

      await logAuditEventFromRequest({
        req,
        userId: user.id,
        action: "SESSION_END",
        resourceType: "session",
        resourceId: body.session_id,
        status: "failure",
        metadata: {
          requestId,
          reason: updateError.message,
        },
      });

      return json(corsHeaders, 500, {
        error: "Could not finalize session.",
        code: "SESSION_UPDATE_FAILED",
        request_id: requestId,
      });
    }

    await logAuditEventFromRequest({
      req,
      userId: user.id,
      action: "SESSION_END",
      resourceType: "session",
      resourceId: body.session_id,
      status: "success",
      metadata: {
        requestId,
        finalStatus: body.status,
        durationSeconds: calculatedDuration,
        creditsUsed: body.credits_used,
        overallScore: body.overall_score ?? null,
        avgWpm: body.avg_wpm ?? null,
        totalFillerWords: body.total_filler_words ?? null,
      },
    });

    return json(corsHeaders, 200, {
      success: true,
      request_id: requestId,
      session_id: body.session_id,
      status: body.status,
      ended_at: nowIso,
      duration_seconds: calculatedDuration,
      credits_used: body.credits_used,
    });
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : "Unexpected end-session error.";

    console.error("[end-session] Unhandled error:", message);

    await logAuditEventFromRequest({
      req,
      userId: user.id,
      action: "SESSION_END",
      resourceType: "session",
      resourceId: body.session_id,
      status: "failure",
      metadata: {
        requestId,
        reason: message,
      },
    });

    return json(corsHeaders, 500, {
      error: "Internal server error.",
      code: "INTERNAL_ERROR",
      request_id: requestId,
    });
  }
});
//
// Production hardening included:
// - CORS handling
// - POST-only method enforcement
// - centralized JWT authentication
// - request validation
