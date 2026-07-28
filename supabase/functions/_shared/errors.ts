// supabase/functions/_shared/errors.ts
//
// Shared error handling utilities for Supabase Edge Functions.
//
// SECURITY PURPOSE:
// - Return consistent JSON responses
// - Avoid leaking stack traces or internal details to users
// - Log useful debugging context safely
// - Standardize success/error response structure
// - Support future integration with Sentry or another monitoring platform

export type ErrorCode =
  | "BAD_REQUEST"
  | "UNAUTHORIZED"
  | "FORBIDDEN"
  | "NOT_FOUND"
  | "VALIDATION_ERROR"
  | "RATE_LIMITED"
  | "CONFLICT"
  | "PAYMENT_REQUIRED"
  | "INTERNAL_ERROR"
  | "SERVICE_UNAVAILABLE";

export type ErrorContext = Record<string, unknown>;

export type ApiErrorBody = {
  error: string;
  code: ErrorCode;
  errorId: string;
  details?: unknown;
};

export type ApiSuccessBody<T> = {
  data: T;
  error: null;
};

const SENSITIVE_KEYS = [
  "password",
  "token",
  "access_token",
  "refresh_token",
  "authorization",
  "api_key",
  "apikey",
  "secret",
  "service_role",
  "service_role_key",
  "stripe_secret",
  "webhook_secret",
  "openai_api_key",
  "anthropic_api_key",
  "gemini_api_key",
  "deepgram_api_key",
];

function generateErrorId(): string {
  try {
    return crypto.randomUUID();
  } catch {
    return `err_${Date.now()}_${Math.random().toString(36).slice(2)}`;
  }
}

function isSensitiveKey(key: string): boolean {
  const normalizedKey = key.toLowerCase();

  return SENSITIVE_KEYS.some((sensitiveKey) =>
    normalizedKey.includes(sensitiveKey)
  );
}

function sanitizeForLog(value: unknown): unknown {
  if (value === null || value === undefined) {
    return value;
  }

  if (typeof value === "string") {
    if (value.length > 500) {
      return `${value.slice(0, 500)}...[truncated]`;
    }

    return value;
  }

  if (typeof value === "number" || typeof value === "boolean") {
    return value;
  }

  if (Array.isArray(value)) {
    return value.map((item) => sanitizeForLog(item));
  }

  if (typeof value === "object") {
    const output: Record<string, unknown> = {};

    for (const [key, nestedValue] of Object.entries(value as Record<string, unknown>)) {
      if (isSensitiveKey(key)) {
        output[key] = "[REDACTED]";
      } else {
        output[key] = sanitizeForLog(nestedValue);
      }
    }

    return output;
  }

  return String(value);
}

function statusFromCode(code: ErrorCode): number {
  switch (code) {
    case "BAD_REQUEST":
      return 400;
    case "UNAUTHORIZED":
      return 401;
    case "PAYMENT_REQUIRED":
      return 402;
    case "FORBIDDEN":
      return 403;
    case "NOT_FOUND":
      return 404;
    case "CONFLICT":
      return 409;
    case "VALIDATION_ERROR":
      return 422;
    case "RATE_LIMITED":
      return 429;
    case "SERVICE_UNAVAILABLE":
      return 503;
    case "INTERNAL_ERROR":
    default:
      return 500;
  }
}

function defaultMessageFromCode(code: ErrorCode): string {
  switch (code) {
    case "BAD_REQUEST":
      return "Bad request.";
    case "UNAUTHORIZED":
      return "Unauthorized.";
    case "FORBIDDEN":
      return "Forbidden.";
    case "NOT_FOUND":
      return "Resource not found.";
    case "VALIDATION_ERROR":
      return "Validation failed.";
    case "RATE_LIMITED":
      return "Rate limit exceeded.";
    case "CONFLICT":
      return "Conflict.";
    case "PAYMENT_REQUIRED":
      return "Payment required.";
    case "SERVICE_UNAVAILABLE":
      return "Service temporarily unavailable.";
    case "INTERNAL_ERROR":
    default:
      return "Something went wrong.";
  }
}

export class EdgeFunctionError extends Error {
  public readonly code: ErrorCode;
  public readonly status: number;
  public readonly details?: unknown;

  public constructor(
    code: ErrorCode,
    message = defaultMessageFromCode(code),
    details?: unknown
  ) {
    super(message);
    this.name = "EdgeFunctionError";
    this.code = code;
    this.status = statusFromCode(code);
    this.details = details;
  }
}

export function jsonResponse<T>(
  body: T,
  status = 200,
  headers: Record<string, string> = {}
): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json",
      "Cache-Control": "no-store",
      ...headers,
    },
  });
}

export function successResponse<T>(
  data: T,
  status = 200,
  headers: Record<string, string> = {}
): Response {
  return jsonResponse<ApiSuccessBody<T>>(
    {
      data,
      error: null,
    },
    status,
    headers
  );
}

export function errorResponse(
  code: ErrorCode,
  message = defaultMessageFromCode(code),
  options: {
    status?: number;
    details?: unknown;
    headers?: Record<string, string>;
    errorId?: string;
  } = {}
): Response {
  const errorId = options.errorId ?? generateErrorId();
  const status = options.status ?? statusFromCode(code);

  const body: ApiErrorBody = {
    error: message,
    code,
    errorId,
  };

  if (options.details !== undefined) {
    body.details = options.details;
  }

  return jsonResponse(body, status, options.headers);
}

export function badRequestResponse(
  message = "Bad request.",
  details?: unknown
): Response {
  return errorResponse("BAD_REQUEST", message, { details });
}

export function validationErrorResponse(
  message = "Validation failed.",
  details?: unknown
): Response {
  return errorResponse("VALIDATION_ERROR", message, { details });
}

export function unauthorizedResponse(message = "Unauthorized."): Response {
  return errorResponse("UNAUTHORIZED", message);
}

export function forbiddenResponse(message = "Forbidden."): Response {
  return errorResponse("FORBIDDEN", message);
}

export function notFoundResponse(message = "Resource not found."): Response {
  return errorResponse("NOT_FOUND", message);
}

export function conflictResponse(message = "Conflict."): Response {
  return errorResponse("CONFLICT", message);
}

export function serviceUnavailableResponse(
  message = "Service temporarily unavailable."
): Response {
  return errorResponse("SERVICE_UNAVAILABLE", message);
}

export function internalErrorResponse(errorId?: string): Response {
  return errorResponse("INTERNAL_ERROR", "Something went wrong.", {
    errorId,
  });
}

export function methodNotAllowedResponse(
  allowedMethods: string[]
): Response {
  return jsonResponse(
    {
      error: "Method not allowed.",
      code: "BAD_REQUEST",
      errorId: generateErrorId(),
    },
    405,
    {
      Allow: allowedMethods.join(", "),
    }
  );
}

export function handleOptionsRequest(
  headers: Record<string, string> = {}
): Response {
  return new Response(null, {
    status: 204,
    headers,
  });
}

export function logInfo(
  message: string,
  context: ErrorContext = {}
): void {
  console.info(
    JSON.stringify({
      level: "info",
      message,
      context: sanitizeForLog(context),
      timestamp: new Date().toISOString(),
    })
  );
}

export function logWarning(
  message: string,
  context: ErrorContext = {}
): void {
  console.warn(
    JSON.stringify({
      level: "warning",
      message,
      context: sanitizeForLog(context),
      timestamp: new Date().toISOString(),
    })
  );
}

export function logError(
  error: unknown,
  context: ErrorContext = {}
): string {
  const errorId = generateErrorId();

  const normalizedError =
    error instanceof Error
      ? {
          name: error.name,
          message: error.message,
          stack: error.stack,
        }
      : {
          name: "UnknownError",
          message: String(error),
          stack: null,
        };

  console.error(
    JSON.stringify({
      level: "error",
      errorId,
      error: sanitizeForLog(normalizedError),
      context: sanitizeForLog(context),
      timestamp: new Date().toISOString(),
    })
  );

  return errorId;
}

export function normalizeError(error: unknown): EdgeFunctionError {
  if (error instanceof EdgeFunctionError) {
    return error;
  }

  if (error instanceof SyntaxError) {
    return new EdgeFunctionError("BAD_REQUEST", "Invalid JSON payload.");
  }

  if (error instanceof Error) {
    return new EdgeFunctionError("INTERNAL_ERROR", error.message);
  }

  return new EdgeFunctionError("INTERNAL_ERROR", "Unknown error.");
}

export function safeErrorResponse(
  error: unknown,
  context: ErrorContext = {}
): Response {
  const normalized = normalizeError(error);
  const errorId = logError(error, context);

  if (normalized.code === "INTERNAL_ERROR") {
    return internalErrorResponse(errorId);
  }

  return errorResponse(normalized.code, normalized.message, {
    status: normalized.status,
    details: normalized.details,
    errorId,
  });
}

export async function parseJsonBody<T = unknown>(req: Request): Promise<T> {
  try {
    return (await req.json()) as T;
  } catch {
    throw new EdgeFunctionError("BAD_REQUEST", "Invalid JSON payload.");
  }
}

export function requireMethod(req: Request, allowedMethods: string[]): Response | null {
  if (allowedMethods.includes(req.method)) {
    return null;
  }

  return methodNotAllowedResponse(allowedMethods);
}

/**
 * P4-3: Optional Sentry reporting for edge functions.
 * Uses a minimal HTTPS envelope POST when SENTRY_DSN is set.
 * Always emits a structured ERROR log with requestId (works without DSN).
 */
export async function reportEdgeError(
  error: unknown,
  context: ErrorContext = {},
): Promise<string> {
  const requestId =
    typeof context.requestId === "string" && context.requestId
      ? context.requestId
      : generateErrorId();

  const normalizedError =
    error instanceof Error
      ? { name: error.name, message: error.message, stack: error.stack }
      : { name: "UnknownError", message: String(error), stack: null };

  const dsn = (Deno.env.get("SENTRY_DSN") ?? "").trim();
  const sentryReady = dsn.length > 0;

  console.error(
    JSON.stringify({
      level: "error",
      errorId: requestId,
      requestId,
      sentry_ready: sentryReady,
      error: sanitizeForLog(normalizedError),
      context: sanitizeForLog(context),
      timestamp: new Date().toISOString(),
    }),
  );

  if (!sentryReady) {
    return requestId;
  }

  try {
    const parsed = new URL(dsn);
    // DSN form: https://<key>@<host>/<projectId>
    const publicKey = parsed.username;
    const projectId = parsed.pathname.replace(/^\//, "");
    if (!publicKey || !projectId) {
      return requestId;
    }

    const ingestHost = parsed.host;
    const envelopeUrl = `https://${ingestHost}/api/${projectId}/envelope/`;
    const eventId = requestId.replace(/-/g, "").slice(0, 32);
    const timestamp = Math.floor(Date.now() / 1000);

    const header = JSON.stringify({
      dsn,
      event_id: eventId,
      sent_at: new Date().toISOString(),
    });
    const itemHeader = JSON.stringify({ type: "event", content_type: "application/json" });
    const payload = JSON.stringify({
      event_id: eventId,
      timestamp,
      platform: "javascript",
      level: "error",
      environment: Deno.env.get("APP_ENV") ?? Deno.env.get("ENVIRONMENT") ?? "unknown",
      message: normalizedError.message,
      exception: {
        values: [
          {
            type: normalizedError.name,
            value: normalizedError.message,
            stacktrace: normalizedError.stack
              ? { frames: [{ filename: "edge", function: String(context.functionName ?? "unknown") }] }
              : undefined,
          },
        ],
      },
      tags: {
        requestId,
        functionName: String(context.functionName ?? "unknown"),
      },
      extra: sanitizeForLog(context),
    });

    await fetch(envelopeUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-sentry-envelope",
        "X-Sentry-Auth": `Sentry sentry_version=7, sentry_client=clarify-edge/1.0, sentry_key=${publicKey}`,
      },
      body: `${header}\n${itemHeader}\n${payload}`,
    }).catch(() => null);
  } catch (reportErr) {
    console.warn(
      "[sentry] report failed:",
      reportErr instanceof Error ? reportErr.message : String(reportErr),
    );
  }

  return requestId;
}

/**
 * Wrapper for consistent Edge Function error handling.
 *
 * Usage:
 * Deno.serve(withErrorHandling("function-name", async (req) => {
 *   ...
 *   return successResponse({ ok: true });
 * }));
 */
export function withErrorHandling(
  functionName: string,
  handler: (req: Request) => Promise<Response> | Response
): (req: Request) => Promise<Response> {
  return async (req: Request): Promise<Response> => {
    try {
      return await handler(req);
    } catch (error) {
      return safeErrorResponse(error, {
        functionName,
        method: req.method,
        url: req.url,
      });
    }
  };
}
