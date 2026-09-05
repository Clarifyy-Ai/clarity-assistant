/**
 * Government Exam route-resolution state machine.
 * Pages stay on the same URL while auth/entity resolution is in flight.
 * Temporary backend failures never redirect to Dashboard or hub.
 */
import { ApiClientError } from "@/lib/api/apiClient";

export type GovExamRoutePhase =
  | "AUTH_INITIALIZING"
  | "UNAUTHENTICATED"
  | "EMAIL_VERIFICATION_REQUIRED"
  | "ONBOARDING_REQUIRED"
  | "AUTHENTICATED_AND_AUTHORIZED"
  | "VALID_EXAM"
  | "VALID_CONFIGURATION"
  | "VALID_GENERATION_JOB"
  | "VALID_READY_PAPER"
  | "VALID_ACTIVE_ATTEMPT"
  | "VALID_SUBMITTED_ATTEMPT"
  | "INVALID_IDENTIFIER"
  | "UNSUPPORTED_EXAM"
  | "PLAN_RESTRICTED"
  | "TEMPORARY_BACKEND_FAILURE"
  | "FORBIDDEN_RESOURCE";

export type GovExamRouteResolution =
  | { phase: "AUTH_INITIALIZING" }
  | { phase: "UNAUTHENTICATED"; returnTo: string }
  | { phase: "EMAIL_VERIFICATION_REQUIRED"; returnTo: string }
  | { phase: "ONBOARDING_REQUIRED"; returnTo: string }
  | { phase: "AUTHENTICATED_AND_AUTHORIZED" }
  | { phase: "VALID_EXAM" }
  | { phase: "VALID_CONFIGURATION" }
  | { phase: "VALID_GENERATION_JOB" }
  | { phase: "VALID_READY_PAPER" }
  | { phase: "VALID_ACTIVE_ATTEMPT" }
  | { phase: "VALID_SUBMITTED_ATTEMPT" }
  | { phase: "INVALID_IDENTIFIER"; message: string }
  | { phase: "UNSUPPORTED_EXAM"; message: string; retryable: boolean }
  | { phase: "PLAN_RESTRICTED"; message: string }
  | {
      phase: "TEMPORARY_BACKEND_FAILURE";
      message: string;
      retryable: true;
      correlationId?: string;
    }
  | { phase: "FORBIDDEN_RESOURCE"; message: string };

export type GovExamAuthContext = {
  status: "idle" | "loading" | "authenticated" | "unauthenticated" | "error";
  hasUser: boolean;
  emailVerified: boolean;
  onboardingComplete: boolean;
  profileLoaded: boolean;
  mfaBlocked: boolean;
  returnTo: string;
};

const TEMPORARY_HTTP = new Set([408, 429, 500, 502, 503, 504]);

const TEMPORARY_CODES = new Set([
  "AUTH_TIMEOUT",
  "PROFILE_LOOKUP_TIMEOUT",
  "TEMPORARY_BACKEND_FAILURE",
  "SERVICE_UNAVAILABLE",
  "WORKER_UNAVAILABLE",
  "RATE_LIMITED",
  "GENERATION_STILL_RUNNING",
  "RESULT_PROCESSING",
]);

export function isTemporaryGovExamError(err: unknown): boolean {
  if (err instanceof ApiClientError) {
    if (err.status != null && TEMPORARY_HTTP.has(err.status)) return true;
    if (err.code && TEMPORARY_CODES.has(err.code)) return true;
  }
  const rec =
    err && typeof err === "object"
      ? (err as { code?: string; status?: number })
      : null;
  if (rec?.status != null && TEMPORARY_HTTP.has(rec.status)) return true;
  if (rec?.code && TEMPORARY_CODES.has(rec.code)) return true;
  return false;
}

export function classifyGovExamLoadError(err: unknown): GovExamRouteResolution {
  if (isTemporaryGovExamError(err)) {
    const message =
      err instanceof ApiClientError
        ? err.message
        : err instanceof Error
          ? err.message
          : "Temporary backend failure. Retry on this page.";
    const correlationId =
      err instanceof ApiClientError ? err.errorId : undefined;
    return {
      phase: "TEMPORARY_BACKEND_FAILURE",
      message,
      retryable: true,
      correlationId,
    };
  }

  if (err instanceof ApiClientError) {
    if (err.status === 404 || err.code === "EXAM_NOT_FOUND" || err.code === "ATTEMPT_NOT_FOUND") {
      return {
        phase: "INVALID_IDENTIFIER",
        message: err.message || "Resource not found.",
      };
    }
    if (err.status === 403 || err.code === "FORBIDDEN_RESOURCE") {
      return {
        phase: "FORBIDDEN_RESOURCE",
        message: err.message || "You do not have access to this resource.",
      };
    }
    if (err.code === "FEATURE_NOT_AVAILABLE_FOR_PLAN" || err.code === "PLAN_NOT_ALLOWED") {
      return {
        phase: "PLAN_RESTRICTED",
        message: err.message || "This feature is not available on your plan.",
      };
    }
    if (err.code === "EXAM_NOT_AVAILABLE" || err.code === "PATTERN_NOT_AVAILABLE") {
      return {
        phase: "UNSUPPORTED_EXAM",
        message: err.message || "This exam is currently unavailable.",
        retryable: true,
      };
    }
  }

  return {
    phase: "TEMPORARY_BACKEND_FAILURE",
    message:
      err instanceof Error ? err.message : "Failed to load. Please retry.",
    retryable: true,
  };
}

/** Auth gate resolution for gov-exam deep links — never bounce to Dashboard while loading. */
export function resolveGovExamAuthPhase(input: GovExamAuthContext): GovExamRouteResolution {
  if (input.status === "idle" || input.status === "loading") {
    return { phase: "AUTH_INITIALIZING" };
  }
  if (!input.hasUser || input.status === "unauthenticated") {
    return { phase: "UNAUTHENTICATED", returnTo: input.returnTo };
  }
  if (input.mfaBlocked) {
    return { phase: "UNAUTHENTICATED", returnTo: input.returnTo };
  }
  if (!input.emailVerified) {
    return { phase: "EMAIL_VERIFICATION_REQUIRED", returnTo: input.returnTo };
  }
  if (input.profileLoaded && !input.onboardingComplete) {
    return { phase: "ONBOARDING_REQUIRED", returnTo: input.returnTo };
  }
  return { phase: "AUTHENTICATED_AND_AUTHORIZED" };
}

export function govExamPhaseLabel(phase: GovExamRoutePhase): string {
  switch (phase) {
    case "AUTH_INITIALIZING":
      return "Initializing…";
    case "TEMPORARY_BACKEND_FAILURE":
      return "Temporary failure";
    case "INVALID_IDENTIFIER":
      return "Not found";
    case "FORBIDDEN_RESOURCE":
      return "Access denied";
    case "UNSUPPORTED_EXAM":
      return "Exam unavailable";
    case "PLAN_RESTRICTED":
      return "Plan restriction";
    default:
      return "";
  }
}
