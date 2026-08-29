// src/lib/logger.ts
//
// Structured event logger with automatic redaction of sensitive fields.
//
// SECURITY PURPOSE:
// - Provide consistent, structured log events across the application
// - Automatically redact known-sensitive fields before logging
// - In production: emit as Sentry breadcrumbs for correlation
// - In development: emit to console only
// - Never log: tokens, passwords, keys, full emails, PII
//
// Usage:
//   import { logger } from "@/lib/logger";
//   logger.info("auth.login.succeeded", { authState: "authenticated", durationMs: 340 });
//   logger.warn("auth.profile.load.timed_out", { attempt: 1, durationMs: 4000, retryable: true });
//   logger.error("dashboard.http_503", { httpStatus: 503, route: "/app/dashboard" });

import * as Sentry from "@sentry/react";
import {
  isCrashReportingEnabled,
  isAiTrainingAllowed,
  stripSessionTextFromPayload,
} from "@/lib/privacy/privacyPrefs";

// ── Types ─────────────────────────────────────────────────────────────────────

type LogLevel = "debug" | "info" | "warn" | "error" | "fatal";

export interface LogEvent {
  /** Stable dot-namespaced event name */
  event: string;
  level?: LogLevel;
  /** ISO-8601 UTC timestamp (auto-set if omitted) */
  timestamp?: string;
  /** Current route pathname */
  route?: string;
  /** Auth state at time of event */
  authState?: string;
  /** Which operation is being performed */
  operation?: string;
  /** Attempt number (1-based) */
  attempt?: number;
  /** How long the operation took */
  durationMs?: number;
  /** HTTP status from a network response */
  httpStatus?: number;
  /** Supabase error code (not the full JWT or token) */
  supabaseCode?: string;
  /** Whether the error is retryable */
  retryable?: boolean;
  /** What recovery action was taken */
  recoveryAction?: string;
  /** Outcome of the operation */
  outcome?: "succeeded" | "failed" | "timed_out" | "skipped" | "retrying";
  /** Release/commit identifier */
  release?: string;
  /** Non-secret correlation ID for tracing this bootstrap sequence */
  correlationId?: string;
  /** Any additional safe fields */
  [key: string]: unknown;
}

// ── Redaction ─────────────────────────────────────────────────────────────────

/**
 * Fields that must NEVER appear in logs.
 * Add fields here as new sensitive data is identified.
 */
const REDACTED_FIELDS = new Set([
  "password",
  "refresh_token",
  "refreshToken",
  "access_token",
  "accessToken",
  "authorization",
  "Authorization",
  "cookie",
  "Cookie",
  "service_role_key",
  "serviceRoleKey",
  "anon_key",
  "anonKey",
  "api_key",
  "apiKey",
  "secret",
  "token",
  "jwt",
  "otp",
  "code",
  "reset_token",
  "resetToken",
  "magic_link",
  "magicLink",
  "oauth_code",
  "oauthCode",
  "email",         // use a hashed/masked variant if user correlation is needed
  "phone",
  "full_name",
  "fullName",
  "resume",
  "transcript",
  "prompt",
  "response",
  "full_transcript",
  "utterance",
  "utterances",
  "session_text",
  "document",
  "document_text",
  "answer_text",
]);

function redact(obj: Record<string, unknown>): Record<string, unknown> {
  const safe: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(obj)) {
    if (REDACTED_FIELDS.has(key)) {
      safe[key] = "[REDACTED]";
    } else if (value !== null && typeof value === "object" && !Array.isArray(value)) {
      safe[key] = redact(value as Record<string, unknown>);
    } else {
      safe[key] = value;
    }
  }
  return safe;
}

/** Exported for unit tests — same redaction used by the logger. */
export function redactSensitiveFields(
  obj: Record<string, unknown>,
): Record<string, unknown> {
  return redact(obj);
}

// ── Environment helpers ────────────────────────────────────────────────────────

const IS_PRODUCTION = import.meta.env.PROD;
const APP_ENV = import.meta.env.VITE_APP_ENV ?? "development";
const APP_RELEASE = import.meta.env.VITE_APP_VERSION ?? "unknown";

// ── Core logger ───────────────────────────────────────────────────────────────

function emit(level: LogLevel, event: string, fields: Omit<LogEvent, "event" | "level"> = {}): void {
  const redacted = redact(fields as Record<string, unknown>);
  const safeFields = isAiTrainingAllowed()
    ? redacted
    : stripSessionTextFromPayload(redacted);

  const entry: LogEvent = {
    timestamp: new Date().toISOString(),
    level,
    event,
    environment: APP_ENV,
    release: APP_RELEASE,
    ...safeFields,
  };

  // Always emit to Sentry (breadcrumbs for info/warn, capture for error/fatal)
  if (isCrashReportingEnabled() && (level !== "debug" || !IS_PRODUCTION)) {
    try {
      if (level === "error" || level === "fatal") {
        const severity: Sentry.SeverityLevel = level === "fatal" ? "fatal" : "error";
        const errObj = entry.error;
        if (errObj instanceof Error) {
          Sentry.captureException(errObj, { level: severity, tags: { event }, extra: entry });
        } else {
          Sentry.captureMessage(`[${event}] ${typeof errObj === "string" ? errObj : JSON.stringify(entry)}`, { level: severity, tags: { event }, extra: entry });
        }
      } else {
        Sentry.addBreadcrumb({
          category: event,
          message: event,
          level: level as Sentry.SeverityLevel,
          data: entry,
        });
      }
    } catch {
      // Sentry may not be initialized in all environments
    }
  }

  // Console output
  if (IS_PRODUCTION) {
    // In production: only warn/error/fatal reach the console
    if (level === "warn") {
      console.warn(`[clarify:${event}]`, entry);
    } else if (level === "error" || level === "fatal") {
      console.error(`[clarify:${event}]`, entry);
    }
    // debug + info are silenced in production (esbuild strips console.debug/log via vite.config)
  } else {
    // In development: full output with color
    const prefix = `[clarify:${event}]`;
    switch (level) {
      case "debug":  console.debug(prefix, entry);  break;
      case "info":   console.info(prefix, entry);   break;
      case "warn":   console.warn(prefix, entry);   break;
      case "error":  console.error(prefix, entry);  break;
      case "fatal":  console.error(prefix, entry);  break;
    }
  }
}

// ── Public API ────────────────────────────────────────────────────────────────

export const logger = {
  debug: (event: string, fields?: Omit<LogEvent, "event" | "level">) =>
    emit("debug", event, fields),

  info: (event: string, fields?: Omit<LogEvent, "event" | "level">) =>
    emit("info", event, fields),

  warn: (event: string, fields?: Omit<LogEvent, "event" | "level">) =>
    emit("warn", event, fields),

  error: (event: string, fields?: Omit<LogEvent, "event" | "level">) =>
    emit("error", event, fields),

  fatal: (event: string, fields?: Omit<LogEvent, "event" | "level">) =>
    emit("fatal", event, fields),
} as const;

// ── Standard event names (for autocomplete and grep-ability) ──────────────────

export const LogEvents = {
  BOOTSTRAP_STARTED:                    "app.bootstrap.started",
  BOOTSTRAP_COMPLETED:                  "app.bootstrap.completed",
  BOOTSTRAP_FAILED:                     "app.bootstrap.failed",
  BOOTSTRAP_DUPLICATE_PREVENTED:        "auth.bootstrap.duplicate_prevented",

  AUTH_CLIENT_INITIALIZED:              "auth.client.initialized",
  AUTH_SESSION_RECOVERY_STARTED:        "auth.session.recovery.started",
  AUTH_SESSION_RECOVERY_SUCCEEDED:      "auth.session.recovery.succeeded",
  AUTH_SESSION_RECOVERY_INVALID_TOKEN:  "auth.session.recovery.invalid_refresh_token",
  AUTH_SESSION_CLEARED:                 "auth.session.cleared",
  AUTH_STATE_CHANGED:                   "auth.state.changed",

  AUTH_LOGIN_SUCCEEDED:                 "auth.login.succeeded",
  AUTH_LOGIN_FAILED:                    "auth.login.failed",
  AUTH_LOGOUT_STARTED:                  "auth.logout.started",
  AUTH_LOGOUT_COMPLETED:                "auth.logout.completed",
  AUTH_LOGOUT_FAILED:                   "auth.logout.failed",

  AUTH_PROFILE_LOAD_STARTED:            "auth.profile.load.started",
  AUTH_PROFILE_LOAD_SUCCEEDED:          "auth.profile.load.succeeded",
  AUTH_PROFILE_LOAD_FAILED:             "auth.profile.load.failed",
  AUTH_PROFILE_LOAD_TIMED_OUT:          "auth.profile.load.timed_out",

  AUTH_ROLE_LOAD_STARTED:               "auth.role.load.started",
  AUTH_ROLE_LOAD_SUCCEEDED:             "auth.role.load.succeeded",
  AUTH_ROLE_LOAD_FAILED:                "auth.role.load.failed",
  AUTH_ROLE_LOAD_TIMED_OUT:             "auth.role.load.timed_out",

  ROUTE_GUARD_DECISION:                 "route.guard.decision",
  ROUTE_REDIRECT:                       "route.redirect",
  ROUTE_ACCESS_DENIED:                  "route.rbac.access_denied",
  UI_COMPONENT_ERROR:                   "ui.component.error",

  DASHBOARD_LOAD_STARTED:               "dashboard.load.started",
  DASHBOARD_LOAD_SUCCEEDED:             "dashboard.load.succeeded",
  DASHBOARD_LOAD_FAILED:                "dashboard.load.failed",
  DASHBOARD_HTTP_503:                   "dashboard.http_503",
  FOCUS_RECOVERY_STARTED:               "app.focus_recovery.started",
  FOCUS_RECOVERY_SKIPPED:               "app.focus_recovery.skipped",
  FOCUS_RECOVERY_COMPLETED:             "app.focus_recovery.completed",

  CSP_VIOLATION_REPORTED:               "csp.violation.reported",
  NETWORK_TRANSIENT_FAILURE:            "network.request.transient_failure",
  NETWORK_RETRY:                        "network.request.retry",
  NETWORK_RETRY_EXHAUSTED:              "network.request.retry_exhausted",
} as const;

export type LogEventName = typeof LogEvents[keyof typeof LogEvents];
