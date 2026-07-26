// supabase/functions/save-answer/index.ts
//
// Saves or updates a user's answer for an interview session.
//
// Production hardening included:
// - CORS handling
// - POST-only method enforcement
// - centralized JWT authentication
// - session ownership verification
// - strict request validation
// - transcript/answer sanitization
// - safe insert/upsert
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
  checkRateLimitAsync,
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

const FUNCTION_NAME = "save-answer";

const SUSPICIOUS_HTML_PATTERNS = [
  /<script/i,
  /<\/script/i,
  /javascript:/i,
  /vbscript:/i,
  /data:text\/html/i,
  /onerror\s*=/i,
  /onload\s*=/i,
  /onclick\s*=/i,
  /srcdoc\s*=/i,
  /<iframe/i,
  /<object/i,
  /<embed/i,
  /<svg/i,
  /<math/i,
];

const answerSchema = z.object({
  session_id: z.string().uuid("Invalid session ID."),

  question_id: z
    .string()
    .uuid("Invalid question ID.")
    .nullable()
    .optional(),

  question_index: z
    .number()
    .int("question_index must be a whole number.")
    .min(0, "question_index cannot be negative.")
    .max(500, "question_index is too large.")
    .optional()
    .default(0),

  question_text: z
    .string()
    .trim()
    .max(5_000, "Question text is too long.")
    .optional()
    .default(""),

  answer: z
    .string()
    .trim()
    .max(50_000, "Answer is too long.")
    .optional()
    .default(""),

  transcript: z
    .string()
    .trim()
    .max(50_000, "Transcript is too long.")
    .optional()
    .default(""),

  score: z
    .number()
    .min(0, "Score cannot be below 0.")
    .max(100, "Score cannot exceed 100.")
    .nullable()
    .optional(),

  duration_seconds: z
    .number()
    .int("duration_seconds must be a whole number.")
    .min(0, "duration_seconds cannot be negative.")
    .max(24 * 60 * 60, "duration_seconds is too large.")
    .nullable()
    .optional(),

  metadata: z
    .record(z.unknown())
    .optional()
    .default({}),
});

type SaveAnswerRequest = z.infer<typeof answerSchema>;

type SavedAnswerRow = {
  id: string;
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

function hasSuspiciousHtml(value: string): boolean {
  return SUSPICIOUS_HTML_PATTERNS.some((pattern) => pattern.test(value));
}

function sanitizeText(value: unknown, limit = 50_000): string {
  return String(value ?? "")
    .replace(/<[^>]*>/g, "")
    .replace(/[\u0000-\u001F\u007F]/g, "")
    .slice(0, limit)
    .trim();
}

function sanitizeMetadata(value: Record<string, unknown>): Record<string, unknown> {
  const output: Record<string, unknown> = {};

  for (const [key, nestedValue] of Object.entries(value).slice(0, 100)) {
    const safeKey = sanitizeText(key, 100).replace(/[^A-Za-z0-9_.:-]/g, "_");

    if (!safeKey) {
      continue;
    }

    if (
      typeof nestedValue === "string" ||
      typeof nestedValue === "number" ||
      typeof nestedValue === "boolean" ||
      nestedValue === null
    ) {
      output[safeKey] =
        typeof nestedValue === "string"
          ? sanitizeText(nestedValue, 1_000)
          : nestedValue;
    }
  }

  return output;
}

async function parseAndValidateRequest(
  req: Request,
  corsHeaders: HeadersInit
): Promise<
  | {
      ok: true;
      data: SaveAnswerRequest;
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

  const validation = answerSchema.safeParse(rawBody);

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

  const questionText = sanitizeText(validation.data.question_text, 5_000);
  const answer = sanitizeText(validation.data.answer, 50_000);
  const transcript = sanitizeText(validation.data.transcript, 50_000);

  const joinedContent = `${questionText}\n${answer}\n${transcript}`;

  if (hasSuspiciousHtml(joinedContent)) {
    return {
      ok: false,
      response: json(corsHeaders, 422, {
        error: "Answer content contains unsafe HTML.",
        code: "VALIDATION_ERROR",
      }),
    };
  }

  return {
    ok: true,
    data: {
      ...validation.data,
      question_text: questionText,
      answer,
      transcript,
      metadata: sanitizeMetadata(validation.data.metadata),
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

  const rateLimitResult = await checkRateLimitAsync(createServiceClient(), {
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
    const answerPayload = {
      user_id: user.id,
      session_id: body.session_id,
      question_id: body.question_id ?? null,
      question_index: body.question_index,
      question_text: body.question_text,
      question: body.question_text,
      answer: body.answer,
      transcript: body.transcript,
      score: body.score ?? null,
      duration_seconds: body.duration_seconds ?? null,
      metadata: body.metadata,
      updated_at: new Date().toISOString(),
    };

    const { data, error } = await db
      .from("session_answers")
      .upsert(answerPayload, {
        onConflict: "session_id,user_id,question_index",
      })
      .select("id")
      .single();

    if (error || !data) {
      console.error("[save-answer] Upsert error:", error?.message);

      await logAuditEventFromRequest({
        req,
        userId: user.id,
        action: "VALIDATION_FAILURE",
        resourceType: "answer",
        resourceId: body.session_id,
        status: "failure",
        metadata: {
          requestId,
          reason: error?.message ?? "Answer upsert failed.",
        },
      });

      return json(corsHeaders, 500, {
        error: "Could not save answer.",
        code: "ANSWER_SAVE_FAILED",
        request_id: requestId,
      });
    }

    const saved = data as SavedAnswerRow;

    await logAuditEventFromRequest({
      req,
      userId: user.id,
      action: "SESSION_START",
      resourceType: "answer",
      resourceId: saved.id,
      status: "success",
      metadata: {
        requestId,
        sessionId: body.session_id,
        questionIndex: body.question_index,
        hasTranscript: body.transcript.length > 0,
        hasAnswer: body.answer.length > 0,
      },
    });

    return json(corsHeaders, 200, {
      success: true,
      request_id: requestId,
      answer_id: saved.id,
      session_id: body.session_id,
      question_index: body.question_index,
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unexpected save-answer error.";

    console.error("[save-answer] Error:", message);

    await logAuditEventFromRequest({
      req,
      userId: user.id,
      action: "VALIDATION_FAILURE",
      resourceType: "answer",
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
