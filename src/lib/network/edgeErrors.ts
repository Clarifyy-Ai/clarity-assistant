/**
 * Typed Edge / API error classification for UI and retry logic.
 * Mirrors supabase/functions/_shared/domainErrors.ts codes where applicable.
 */

export type EdgeErrorKind =
  | "NETWORK_ERROR"
  | "AUTH_ERROR"
  | "VALIDATION_ERROR"
  | "PERMISSION_ERROR"
  | "CREDIT_ERROR"
  | "PROVIDER_ERROR"
  | "TIMEOUT"
  | "NOT_FOUND"
  | "CONFLICT"
  | "SERVER_ERROR";

export type ProviderErrorCode =
  | "PROVIDER_NOT_CONFIGURED"
  | "PROVIDER_UNAVAILABLE"
  | "AI_PROVIDER_UNAVAILABLE"
  | "MODEL_NOT_AVAILABLE"
  | "RATE_LIMITED"
  | "TIMEOUT"
  | "AI_TIMEOUT"
  | "INSUFFICIENT_CREDITS"
  | "PLAN_NOT_ALLOWED"
  | "CAPABILITY_REQUIRED"
  | "INVALID_REQUEST";

export type ParsedEdgeError = {
  kind: EdgeErrorKind;
  code: string | null;
  message: string;
  retryable: boolean;
  status: number | null;
};

const RETRYABLE_CODES = new Set([
  "PROVIDER_UNAVAILABLE",
  "AI_PROVIDER_UNAVAILABLE",
  "RATE_LIMITED",
  "TIMEOUT",
  "AI_TIMEOUT",
  "DATABASE_FAILURE",
  "PYTHON_SERVICE_UNAVAILABLE",
]);

export function classifyEdgeError(err: unknown): ParsedEdgeError {
  const status =
    typeof err === "object" && err !== null && "status" in err
      ? Number((err as { status?: number }).status)
      : null;
  const code =
    typeof err === "object" && err !== null && "code" in err
      ? String((err as { code?: string }).code ?? "")
      : "";
  const message =
    err instanceof Error
      ? err.message
      : typeof err === "object" && err !== null && "message" in err
        ? String((err as { message?: string }).message ?? "Request failed")
        : "Request failed";

  const normalizedCode = code.trim().toUpperCase();

  if (status === 401 || normalizedCode === "UNAUTHORIZED") {
    return { kind: "AUTH_ERROR", code: normalizedCode || "UNAUTHORIZED", message, retryable: false, status };
  }
  if (status === 402 || normalizedCode === "INSUFFICIENT_CREDITS") {
    return { kind: "CREDIT_ERROR", code: "INSUFFICIENT_CREDITS", message, retryable: false, status };
  }
  if (status === 403 || normalizedCode === "PLAN_NOT_ALLOWED" || normalizedCode === "CAPABILITY_REQUIRED") {
    return { kind: "PERMISSION_ERROR", code: normalizedCode || "FORBIDDEN", message, retryable: false, status };
  }
  if (status === 404 || normalizedCode === "NOT_FOUND") {
    return { kind: "NOT_FOUND", code: normalizedCode || "NOT_FOUND", message, retryable: false, status };
  }
  if (status === 409 || normalizedCode === "CONFLICT") {
    return { kind: "CONFLICT", code: normalizedCode || "CONFLICT", message, retryable: false, status };
  }
  if (status === 422 || normalizedCode === "VALIDATION_ERROR" || normalizedCode === "INVALID_REQUEST") {
    return { kind: "VALIDATION_ERROR", code: normalizedCode || "VALIDATION_ERROR", message, retryable: false, status };
  }
  if (
    normalizedCode.includes("PROVIDER") ||
    normalizedCode.includes("AI_") ||
    normalizedCode === "MODEL_NOT_AVAILABLE" ||
    normalizedCode === "RATE_LIMITED"
  ) {
    return {
      kind: "PROVIDER_ERROR",
      code: normalizedCode || "PROVIDER_UNAVAILABLE",
      message,
      retryable: RETRYABLE_CODES.has(normalizedCode),
      status,
    };
  }
  if (normalizedCode.includes("TIMEOUT") || message.toLowerCase().includes("timeout")) {
    return { kind: "TIMEOUT", code: normalizedCode || "TIMEOUT", message, retryable: true, status };
  }
  if (message.toLowerCase().includes("network") || message.toLowerCase().includes("fetch failed")) {
    return { kind: "NETWORK_ERROR", code: normalizedCode || "NETWORK_ERROR", message, retryable: true, status };
  }
  if (status !== null && status >= 500) {
    return { kind: "SERVER_ERROR", code: normalizedCode || "SERVER_ERROR", message, retryable: true, status };
  }
  return { kind: "SERVER_ERROR", code: normalizedCode || null, message, retryable: false, status };
}

export function userMessageForEdgeError(parsed: ParsedEdgeError): string {
  switch (parsed.kind) {
    case "CREDIT_ERROR":
      return "Insufficient credits for this action.";
    case "PERMISSION_ERROR":
      return "This feature requires a supported plan.";
    case "PROVIDER_ERROR":
      if (parsed.code === "PROVIDER_NOT_CONFIGURED") {
        return "AI is not configured for this environment.";
      }
      if (parsed.code === "RATE_LIMITED") {
        return "Too many requests — wait a moment and retry.";
      }
      return "AI is temporarily unavailable. Please retry.";
    case "TIMEOUT":
      return "The request timed out. Please retry.";
    case "VALIDATION_ERROR":
      return parsed.message || "Invalid request.";
    case "AUTH_ERROR":
      return "Please sign in again.";
    case "NETWORK_ERROR":
      return "Network error. Check your connection and retry.";
    default:
      return parsed.message || "Something went wrong. Please retry.";
  }
}
