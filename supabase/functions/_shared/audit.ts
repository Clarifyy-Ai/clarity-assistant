// supabase/functions/_shared/audit.ts
//
// Shared audit logging utilities for Supabase Edge Functions.
//
// SECURITY PURPOSE:
// - Track sensitive actions for investigation and compliance
// - Record who did what, when, from where, and to which resource
// - Avoid logging secrets/PII unnecessarily
// - Provide a safe non-blocking audit logger
//
// EXPECTED DATABASE TABLE:
// audit_logs
//
// Recommended columns:
// - id uuid primary key default gen_random_uuid()
// - user_id uuid null
// - action text not null
// - resource_type text null
// - resource_id text null
// - status text not null
// - metadata jsonb null
// - ip_address text null
// - user_agent text null
// - created_at timestamptz not null default now()
//
// IMPORTANT:
// Audit logging must never break the user-facing operation.
// If audit insert fails, log the failure and continue.

import { createServiceRoleClient, getClientIp, getUserAgent } from "./auth.ts";

export type AuditStatus = "success" | "failure" | "blocked";

export type AuditAction =
  | "LOGIN"
  | "LOGOUT"
  | "SIGNUP"
  | "PASSWORD_RESET_REQUEST"
  | "PASSWORD_CHANGED"
  | "PROFILE_READ"
  | "PROFILE_UPDATE"
  | "SESSION_START"
  | "SESSION_END"
  | "SESSION_DELETE"
  | "GENERATE_ANSWER"
  | "GENERATE_QUESTIONS"
  | "GENERATE_DEBRIEF"
  | "GENERATE_HINT"
  | "AI_COACH_CHAT"
  | "RESUME_UPLOAD"
  | "RESUME_PARSE"
  | "DOCUMENT_UPLOAD"
  | "DOCUMENT_DOWNLOAD"
  | "DOCUMENT_DELETE"
  | "CREDITS_DEDUCT"
  | "CREDITS_ADD"
  | "CHECKOUT_CREATE"
  | "SUBSCRIPTION_CANCEL"
  | "SUBSCRIPTION_RESUME"
  | "STRIPE_WEBHOOK_RECEIVED"
  | "STRIPE_WEBHOOK_PROCESSED"
  | "SETTINGS_UPDATE"
  | "ACCOUNT_DELETE"
  | "DATA_EXPORT"
  | "ADMIN_ACTION"
  | "ADMIN_FEATURE_FLAG_CHANGE"
  | "ADMIN_USER_IMPERSONATE"
  | "RATE_LIMIT_BLOCK"
  | "VALIDATION_FAILURE"
  | "AUTH_FAILURE"
  | "PERMISSION_DENIED"
  | "UNKNOWN";

export type AuditResourceType =
  | "auth"
  | "profile"
  | "session"
  | "answer"
  | "question"
  | "resume"
  | "document"
  | "billing"
  | "subscription"
  | "credits"
  | "webhook"
  | "account"
  | "settings"
  | "admin"
  | "system"
  | "unknown";

export type AuditEvent = {
  userId?: string | null;
  action: AuditAction;
  resourceType?: AuditResourceType;
  resourceId?: string | null;
  status?: AuditStatus;
  metadata?: Record<string, unknown>;
  ipAddress?: string | null;
  userAgent?: string | null;
};

export type AuditEventFromRequest = Omit<AuditEvent, "ipAddress" | "userAgent"> & {
  req: Request;
};

const AUDIT_LOG_TABLE = "audit_logs";

const SENSITIVE_KEYS = [
  "password",
  "currentPassword",
  "newPassword",
  "confirmPassword",
  "token",
  "access_token",
  "refresh_token",
  "authorization",
  "apiKey",
  "api_key",
  "apikey",
  "secret",
  "serviceRole",
  "service_role",
  "service_role_key",
  "stripeSecret",
  "stripe_secret",
  "webhookSecret",
  "webhook_secret",
  "openaiApiKey",
  "openai_api_key",
  "anthropicApiKey",
  "anthropic_api_key",
  "geminiApiKey",
  "gemini_api_key",
  "deepgramApiKey",
  "deepgram_api_key",
  "card",
  "cardNumber",
  "cvv",
  "cvc",
];

const MAX_STRING_LENGTH = 1_000;
const MAX_ARRAY_LENGTH = 50;
const MAX_OBJECT_KEYS = 100;

function isSensitiveKey(key: string): boolean {
  const normalized = key.toLowerCase();

  return SENSITIVE_KEYS.some((sensitive) =>
    normalized.includes(sensitive.toLowerCase())
  );
}

function truncateString(value: string): string {
  if (value.length <= MAX_STRING_LENGTH) {
    return value;
  }

  return `${value.slice(0, MAX_STRING_LENGTH)}...[truncated]`;
}

function sanitizeMetadataValue(value: unknown, depth = 0): unknown {
  if (depth > 5) {
    return "[MAX_DEPTH_REACHED]";
  }

  if (value === null || value === undefined) {
    return value;
  }

  if (typeof value === "string") {
    return truncateString(value);
  }

  if (typeof value === "number" || typeof value === "boolean") {
    return value;
  }

  if (Array.isArray(value)) {
    return value
      .slice(0, MAX_ARRAY_LENGTH)
      .map((item) => sanitizeMetadataValue(item, depth + 1));
  }

  if (typeof value === "object") {
    const output: Record<string, unknown> = {};
    const entries = Object.entries(value as Record<string, unknown>).slice(
      0,
      MAX_OBJECT_KEYS
    );

    for (const [key, nestedValue] of entries) {
      if (isSensitiveKey(key)) {
        output[key] = "[REDACTED]";
      } else {
        output[key] = sanitizeMetadataValue(nestedValue, depth + 1);
      }
    }

    return output;
  }

  return String(value);
}

export function sanitizeAuditMetadata(
  metadata: Record<string, unknown> = {}
): Record<string, unknown> {
  return sanitizeMetadataValue(metadata) as Record<string, unknown>;
}

function normalizeAuditEvent(event: AuditEvent): Required<AuditEvent> {
  return {
    userId: event.userId ?? null,
    action: event.action ?? "UNKNOWN",
    resourceType: event.resourceType ?? "unknown",
    resourceId: event.resourceId ?? null,
    status: event.status ?? "success",
    metadata: sanitizeAuditMetadata(event.metadata ?? {}),
    ipAddress: event.ipAddress ?? null,
    userAgent: event.userAgent ?? null,
  };
}

/**
 * Writes an audit event to the audit_logs table.
 *
 * This function is intentionally non-throwing.
 * If audit logging fails, it logs the error and allows the caller to continue.
 */
export async function logAuditEvent(event: AuditEvent): Promise<void> {
  try {
    const normalized = normalizeAuditEvent(event);
    const supabase = createServiceRoleClient();

    const { error } = await supabase.from(AUDIT_LOG_TABLE).insert({
      user_id: normalized.userId,
      action: normalized.action,
      resource_type: normalized.resourceType,
      resource_id: normalized.resourceId,
      status: normalized.status,
      metadata: normalized.metadata,
      ip_address: normalized.ipAddress,
      user_agent: normalized.userAgent,
    });

    if (error) {
      console.error(
        JSON.stringify({
          level: "error",
          message: "[audit] Failed to insert audit event.",
          error: error.message,
          action: normalized.action,
          resourceType: normalized.resourceType,
          resourceId: normalized.resourceId,
          timestamp: new Date().toISOString(),
        })
      );
    }
  } catch (error) {
    console.error(
      JSON.stringify({
        level: "error",
        message: "[audit] Unexpected audit logger failure.",
        error: error instanceof Error ? error.message : String(error),
        timestamp: new Date().toISOString(),
      })
    );
  }
}

/**
 * Logs an audit event and automatically captures IP/user-agent from Request.
 */
export async function logAuditEventFromRequest(
  event: AuditEventFromRequest
): Promise<void> {
  const { req, ...auditEvent } = event;

  await logAuditEvent({
    ...auditEvent,
    ipAddress: getClientIp(req),
    userAgent: getUserAgent(req),
  });
}

/**
 * Logs successful operation.
 */
export async function logAuditSuccess(
  event: Omit<AuditEvent, "status">
): Promise<void> {
  await logAuditEvent({
    ...event,
    status: "success",
  });
}

/**
 * Logs failed operation.
 */
export async function logAuditFailure(
  event: Omit<AuditEvent, "status">
): Promise<void> {
  await logAuditEvent({
    ...event,
    status: "failure",
  });
}

/**
 * Logs blocked operation.
 *
 * Use for:
 * - rate limit blocks
 * - permission denied
 * - validation failure
 * - auth failure
 */
export async function logAuditBlocked(
  event: Omit<AuditEvent, "status">
): Promise<void> {
  await logAuditEvent({
    ...event,
    status: "blocked",
  });
}

/**
 * Helper for rate-limit audit events.
 */
export async function logRateLimitBlocked(options: {
  req: Request;
  userId?: string | null;
  functionName: string;
  limit?: number;
  retryAfterSeconds?: number;
}): Promise<void> {
  await logAuditEventFromRequest({
    req: options.req,
    userId: options.userId ?? null,
    action: "RATE_LIMIT_BLOCK",
    resourceType: "system",
    resourceId: options.functionName,
    status: "blocked",
    metadata: {
      functionName: options.functionName,
      limit: options.limit,
      retryAfterSeconds: options.retryAfterSeconds,
    },
  });
}

/**
 * Helper for validation failure audit events.
 */
export async function logValidationFailure(options: {
  req: Request;
  userId?: string | null;
  functionName: string;
  details?: unknown;
}): Promise<void> {
  await logAuditEventFromRequest({
    req: options.req,
    userId: options.userId ?? null,
    action: "VALIDATION_FAILURE",
    resourceType: "system",
    resourceId: options.functionName,
    status: "blocked",
    metadata: {
      details: sanitizeMetadataValue(options.details),
    },
  });
}

/**
 * Helper for auth failure audit events.
 */
export async function logAuthFailure(options: {
  req: Request;
  functionName: string;
  reason?: string;
}): Promise<void> {
  await logAuditEventFromRequest({
    req: options.req,
    userId: null,
    action: "AUTH_FAILURE",
    resourceType: "auth",
    resourceId: options.functionName,
    status: "blocked",
    metadata: {
      reason: options.reason ?? "Authentication failed.",
    },
  });
}

/**
 * Helper for permission-denied audit events.
 */
export async function logPermissionDenied(options: {
  req: Request;
  userId?: string | null;
  functionName: string;
  resourceType?: AuditResourceType;
  resourceId?: string | null;
  reason?: string;
}): Promise<void> {
  await logAuditEventFromRequest({
    req: options.req,
    userId: options.userId ?? null,
    action: "PERMISSION_DENIED",
    resourceType: options.resourceType ?? "unknown",
    resourceId: options.resourceId ?? options.functionName,
    status: "blocked",
    metadata: {
      reason: options.reason ?? "Permission denied.",
      functionName: options.functionName,
    },
  });
}

/**
 * Helper for payment/credit audit events.
 */
export async function logBillingAudit(options: {
  req: Request;
  userId: string;
  action:
    | "CREDITS_DEDUCT"
    | "CREDITS_ADD"
    | "CHECKOUT_CREATE"
    | "SUBSCRIPTION_CANCEL"
    | "SUBSCRIPTION_RESUME"
    | "STRIPE_WEBHOOK_RECEIVED"
    | "STRIPE_WEBHOOK_PROCESSED";
  resourceId?: string | null;
  status?: AuditStatus;
  metadata?: Record<string, unknown>;
}): Promise<void> {
  await logAuditEventFromRequest({
    req: options.req,
    userId: options.userId,
    action: options.action,
    resourceType: "billing",
    resourceId: options.resourceId ?? null,
    status: options.status ?? "success",
    metadata: options.metadata ?? {},
  });
}

/**
 * Helper for AI generation audit events.
 */
export async function logAiAudit(options: {
  req: Request;
  userId: string;
  action:
    | "GENERATE_ANSWER"
    | "GENERATE_QUESTIONS"
    | "GENERATE_DEBRIEF"
    | "GENERATE_HINT"
    | "AI_COACH_CHAT";
  sessionId?: string | null;
  status?: AuditStatus;
  metadata?: Record<string, unknown>;
}): Promise<void> {
  await logAuditEventFromRequest({
    req: options.req,
    userId: options.userId,
    action: options.action,
    resourceType: "session",
    resourceId: options.sessionId ?? null,
    status: options.status ?? "success",
    metadata: options.metadata ?? {},
  });
}

/**
 * Helper for account deletion audit events.
 */
export async function logAccountDeletionAudit(options: {
  req: Request;
  userId: string;
  status?: AuditStatus;
  metadata?: Record<string, unknown>;
}): Promise<void> {
  await logAuditEventFromRequest({
    req: options.req,
    userId: options.userId,
    action: "ACCOUNT_DELETE",
    resourceType: "account",
    resourceId: options.userId,
    status: options.status ?? "success",
    metadata: options.metadata ?? {},
  });
}

/**
 * Helper for data export audit events.
 */
export async function logDataExportAudit(options: {
  req: Request;
  userId: string;
  status?: AuditStatus;
  metadata?: Record<string, unknown>;
}): Promise<void> {
  await logAuditEventFromRequest({
    req: options.req,
    userId: options.userId,
    action: "DATA_EXPORT",
    resourceType: "account",
    resourceId: options.userId,
    status: options.status ?? "success",
    metadata: options.metadata ?? {},
  });
}

/**
 * Helper for document access audit events (upload, download, delete).
 */
export async function logDocumentAudit(options: {
  req: Request;
  userId: string;
  action: "DOCUMENT_UPLOAD" | "DOCUMENT_DOWNLOAD" | "DOCUMENT_DELETE";
  documentId?: string | null;
  documentType?: string;
  status?: AuditStatus;
  metadata?: Record<string, unknown>;
}): Promise<void> {
  await logAuditEventFromRequest({
    req: options.req,
    userId: options.userId,
    action: options.action,
    resourceType: "document",
    resourceId: options.documentId ?? null,
    status: options.status ?? "success",
    metadata: {
      documentType: options.documentType,
      ...options.metadata,
    },
  });
}

/**
 * Helper for settings change audit events.
 */
export async function logSettingsAudit(options: {
  req: Request;
  userId: string;
  settingKey: string;
  oldValue?: unknown;
  newValue?: unknown;
  status?: AuditStatus;
  metadata?: Record<string, unknown>;
}): Promise<void> {
  await logAuditEventFromRequest({
    req: options.req,
    userId: options.userId,
    action: "SETTINGS_UPDATE",
    resourceType: "settings",
    resourceId: options.settingKey,
    status: options.status ?? "success",
    metadata: {
      settingKey: options.settingKey,
      oldValue: sanitizeMetadataValue(options.oldValue),
      newValue: sanitizeMetadataValue(options.newValue),
      ...options.metadata,
    },
  });
}

/**
 * Helper for admin action audit events.
 */
export async function logAdminAudit(options: {
  req: Request;
  userId: string;
  action: "ADMIN_ACTION" | "ADMIN_FEATURE_FLAG_CHANGE" | "ADMIN_USER_IMPERSONATE";
  targetUserId?: string | null;
  resourceId?: string | null;
  status?: AuditStatus;
  metadata?: Record<string, unknown>;
}): Promise<void> {
  await logAuditEventFromRequest({
    req: options.req,
    userId: options.userId,
    action: options.action,
    resourceType: "admin",
    resourceId: options.resourceId ?? null,
    status: options.status ?? "success",
    metadata: {
      targetUserId: options.targetUserId,
      ...options.metadata,
    },
  });
}
