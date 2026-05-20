// supabase/functions/save-transcript/index.ts
//
// Stores transcript chunks during a session.
//
// Production hardening included:
// - CORS handling
// - POST-only method enforcement
// - centralized authentication
// - session ownership validation
// - chunk validation
// - rate limiting (important for streaming)
// - sanitization / XSS protection
// - safe DB insert
// - audit logging
// - safe JSON response

import { z } from "https://deno.land/x/zod@v3.22.4/mod.ts";

import {
  handleCors,
  getCorsHeaders,
  withCorsHeaders
} from "../_shared/cors.ts";

import {
  authenticateRequest,
  enforceResourceOwnership
} from "../_shared/auth.ts";

import {
  checkRateLimit,
  createRateLimitKey,
  rateLimitResponse,
  RATE_LIMIT_PRESETS
} from "../_shared/rateLimit.ts";

import { parseJsonBody } from "../_shared/errors.ts";

import {
  logAuthFailure,
  logPermissionDenied,
  logRateLimitBlocked,
  logValidationFailure,
  logAuditEventFromRequest
} from "../_shared/audit.ts";

import { createServiceClient } from "../_shared/supabase.ts";

const FUNCTION_NAME = "save-transcript";

// ✅ TRANSCRIPT INPUT SCHEMA
const transcriptSchema = z.object({
  session_id: z.string().uuid("Invalid session ID."),

  content: z
    .string()
    .trim()
    .min(1, "Transcript content required.")
    .max(20_000, "Transcript chunk too large."),

  speaker: z
    .enum(["user", "ai", "system"])
    .optional()
    .default("user"),

  timestamp_ms: z
    .number()
    .int()
    .min(0)
    .max(24 * 60 * 60 * 1000)
    .optional(),

  sequence: z
    .number()
    .int()
    .min(0)
    .max(1_000_000)
    .optional(),

  is_final: z.boolean().optional().default(true)
});

type TranscriptRequest = z.infer<typeof transcriptSchema>;

function json(headers: HeadersInit, status: number, body: unknown) {
  const h = new Headers(headers);
  h.set("Content-Type", "application/json");
  h.set("Cache-Control", "no-store");

  return new Response(JSON.stringify(body), { status, headers: h });
}

/* ---------------- SANITIZATION ---------------- */

const SUSPICIOUS_PATTERNS = [
  /<script/i,
  /<\/script/i,
  /javascript:/i,
  /onerror\s*=/i,
  /onload\s*=/i
];

function sanitizeText(value: string, limit = 20_000): string {
  return value
    .replace(/<[^>]*>/g, "")
    .replace(/[\u0000-\u001F\u007F]/g, "")
    .slice(0, limit)
    .trim();
}

function isUnsafe(value: string): boolean {
  return SUSPICIOUS_PATTERNS.some((p) => p.test(value));
}

/* ---------------- VALIDATION ---------------- */

async function parseAndValidate(
  req: Request,
  headers: HeadersInit
): Promise<
  | { ok: true; data: TranscriptRequest }
  | { ok: false; response: Response }
> {
  let raw;

  try {
    raw = await parseJsonBody(req);
  } catch {
    return {
      ok: false,
      response: json(headers, 400, {
        error: "Invalid JSON payload",
        code: "BAD_REQUEST"
      })
    };
  }

  const parsed = transcriptSchema.safeParse(raw);

  if (!parsed.success) {
    return {
      ok: false,
      response: json(headers, 422, {
        error: "Validation failed",
        code: "VALIDATION_ERROR"
      })
    };
  }

  const cleaned = sanitizeText(parsed.data.content);

  if (isUnsafe(cleaned)) {
    return {
      ok: false,
      response: json(headers, 422, {
        error: "Unsafe transcript content",
        code: "SECURITY_VALIDATION_FAILED"
      })
    };
  }

  return {
    ok: true,
    data: {
      ...parsed.data,
      content: cleaned
    }
  };
}

/* ---------------- MAIN HANDLER ---------------- */

Deno.serve(async (req: Request) => {
  const cors = handleCors(req);
  if (cors) return cors;

  const headers = getCorsHeaders(req);
  const requestId = crypto.randomUUID();

  if (req.method !== "POST") {
    return json(headers, 405, {
      error: "Method not allowed",
      code: "METHOD_NOT_ALLOWED",
      request_id: requestId
    });
  }

  /* ── AUTH ── */
  const auth = await authenticateRequest(req);

  if (auth.error) {
    await logAuthFailure({
      req,
      functionName: FUNCTION_NAME,
      reason: "Invalid token"
    });

    return withCorsHeaders(req, auth.error);
  }

  const userId = auth.context.user.id;

  /* ── RATE LIMIT ── (important for audio streaming) */
  const rl = checkRateLimit({
    key: createRateLimitKey(FUNCTION_NAME, userId),
    ...RATE_LIMIT_PRESETS.STREAMING_ACTION
  });

  if (!rl.allowed) {
    await logRateLimitBlocked({
      req,
      userId,
      functionName: FUNCTION_NAME,
      limit: rl.limit,
      retryAfterSeconds: rl.retryAfterSeconds
    });

    return withCorsHeaders(req, rateLimitResponse(rl));
  }

  /* ── VALIDATION ── */
  const validation = await parseAndValidate(req, headers);

  if (!validation.ok) {
    await logValidationFailure({
      req,
      userId,
      functionName: FUNCTION_NAME
    });

    return validation.response;
  }

  const body = validation.data;

  /* ── OWNERSHIP CHECK ── */
  const ownership = await enforceResourceOwnership({
    table: "sessions",
    resourceId: body.session_id,
    authenticatedUserId: userId
  });

  if (ownership) {
    await logPermissionDenied({
      req,
      userId,
      functionName: FUNCTION_NAME,
      resourceType: "session",
      resourceId: body.session_id,
      reason: "Session ownership failed"
    });

    return withCorsHeaders(req, ownership);
  }

  const db = createServiceClient();

  /* ── INSERT TRANSCRIPT ── */
  try {
    const { data, error } = await db
      .from("session_transcripts")
      .insert({
        user_id: userId,
        session_id: body.session_id,
        content: body.content,
        speaker: body.speaker,
        timestamp_ms: body.timestamp_ms ?? null,
        sequence: body.sequence ?? null,
        is_final: body.is_final,
        created_at: new Date().toISOString()
      })
      .select("id")
      .single();

    if (error || !data) {
      throw new Error(error?.message ?? "Insert failed");
    }

    await logAuditEventFromRequest({
      req,
      userId,
      action: "SESSION_TRANSCRIPT_SAVE",
      resourceType: "transcript",
      resourceId: data.id,
      status: "success",
      metadata: {
        requestId,
        sessionId: body.session_id,
        length: body.content.length
      }
    });

    return json(headers, 200, {
      success: true,
      request_id: requestId,
      transcript_id: data.id
    });

  } catch (err) {
    console.error("[save-transcript]", err);

    await logAuditEventFromRequest({
      req,
      userId,
      action: "SESSION_TRANSCRIPT_SAVE",
      resourceType: "transcript",
      resourceId: body.session_id,
      status: "failure",
      metadata: {
        requestId,
        error: String(err)
      }
    });

    return json(headers, 500, {
      error: "Failed to save transcript",
      code: "TRANSCRIPT_SAVE_FAILED",
      request_id: requestId
    });
  }
});
