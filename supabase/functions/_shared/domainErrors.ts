/**
 * Stable domain error codes for the hybrid Edge → Python → AI backend.
 *
 * IMPORTANT:
 * - AI failures must NEVER map to PAYMENT_REQUIRED / INSUFFICIENT_CREDITS.
 * - Credit denials stay on creditAuthority.ts; this module covers execution failures.
 */

export type DomainErrorCode =
  | "AI_PROVIDER_UNAVAILABLE"
  | "AI_TIMEOUT"
  | "AI_INVALID_OUTPUT"
  | "PYTHON_SERVICE_UNAVAILABLE"
  | "PYTHON_PROCESSING_FAILED"
  | "DATABASE_FAILURE"
  | "INSUFFICIENT_CREDITS"
  | "CAPABILITY_REQUIRED";

export class DomainError extends Error {
  readonly code: DomainErrorCode;
  readonly retryable: boolean;
  readonly status: number;
  readonly cause?: unknown;

  constructor(
    code: DomainErrorCode,
    message?: string,
    options?: { cause?: unknown; retryable?: boolean },
  ) {
    super(message ?? defaultMessage(code));
    this.name = "DomainError";
    this.code = code;
    this.retryable = options?.retryable ?? isRetryable(code);
    this.status = httpStatusForDomainCode(code);
    this.cause = options?.cause;
  }
}

export function defaultMessage(code: DomainErrorCode): string {
  switch (code) {
    case "AI_PROVIDER_UNAVAILABLE":
      return "The AI provider is temporarily unavailable. Please try again.";
    case "AI_TIMEOUT":
      return "The AI request timed out. Please try again.";
    case "AI_INVALID_OUTPUT":
      return "The AI response could not be used. Please try again.";
    case "PYTHON_SERVICE_UNAVAILABLE":
      return "The processing service is temporarily unavailable. Please try again.";
    case "PYTHON_PROCESSING_FAILED":
      return "Processing failed. Please try again.";
    case "DATABASE_FAILURE":
      return "A database error occurred. Please try again.";
    case "INSUFFICIENT_CREDITS":
      return "Insufficient credits.";
    case "CAPABILITY_REQUIRED":
      return "This feature requires a supported plan.";
    default:
      return "Something went wrong. Please try again.";
  }
}

export function httpStatusForDomainCode(code: DomainErrorCode | string): number {
  switch (code) {
    case "INSUFFICIENT_CREDITS":
      return 402;
    case "CAPABILITY_REQUIRED":
      return 403;
    case "AI_INVALID_OUTPUT":
    case "PYTHON_PROCESSING_FAILED":
      return 422;
    case "AI_TIMEOUT":
    case "AI_PROVIDER_UNAVAILABLE":
    case "PYTHON_SERVICE_UNAVAILABLE":
    case "DATABASE_FAILURE":
      return 503;
    default:
      return 500;
  }
}

export function isRetryable(code: DomainErrorCode | string): boolean {
  switch (code) {
    case "AI_TIMEOUT":
    case "AI_PROVIDER_UNAVAILABLE":
    case "PYTHON_SERVICE_UNAVAILABLE":
    case "DATABASE_FAILURE":
      return true;
    case "AI_INVALID_OUTPUT":
    case "PYTHON_PROCESSING_FAILED":
    case "INSUFFICIENT_CREDITS":
    case "CAPABILITY_REQUIRED":
      return false;
    default:
      return false;
  }
}

function messageOf(err: unknown): string {
  if (err instanceof DomainError) return err.message;
  if (err instanceof Error) return err.message;
  return String(err ?? "");
}

function nameOf(err: unknown): string {
  if (err instanceof Error) return err.name;
  return "";
}

/**
 * Classify AI-layer failures.
 * Never returns INSUFFICIENT_CREDITS / CAPABILITY_REQUIRED / PAYMENT_REQUIRED.
 */
export function classifyAiFailure(err: unknown): DomainErrorCode {
  if (err instanceof DomainError) {
    if (
      err.code === "AI_TIMEOUT" ||
      err.code === "AI_INVALID_OUTPUT" ||
      err.code === "AI_PROVIDER_UNAVAILABLE"
    ) {
      return err.code;
    }
  }

  const name = nameOf(err).toLowerCase();
  const msg = messageOf(err).toLowerCase();

  if (
    name === "aborterror" ||
    msg.includes("timeout") ||
    msg.includes("timed out") ||
    msg.includes("deadline exceeded") ||
    msg.includes("etimedout")
  ) {
    return "AI_TIMEOUT";
  }

  if (
    msg.includes("invalid output") ||
    msg.includes("invalid json") ||
    msg.includes("parse") ||
    msg.includes("schema") ||
    msg.includes("empty response") ||
    msg.includes("malformed") ||
    msg.includes("validation failed")
  ) {
    return "AI_INVALID_OUTPUT";
  }

  // Explicitly do not treat credit/payment wording as AI failures of that type.
  // Provider outages, rate limits, 5xx, network → AI_PROVIDER_UNAVAILABLE.
  return "AI_PROVIDER_UNAVAILABLE";
}

/**
 * Classify Python service failures from thrown errors and/or HTTP status.
 */
export function classifyPythonFailure(
  errOrStatus?: unknown,
  status?: number,
): DomainErrorCode {
  if (errOrStatus instanceof DomainError) {
    if (
      errOrStatus.code === "PYTHON_SERVICE_UNAVAILABLE" ||
      errOrStatus.code === "PYTHON_PROCESSING_FAILED"
    ) {
      return errOrStatus.code;
    }
  }

  const httpStatus =
    typeof status === "number" && Number.isFinite(status)
      ? status
      : typeof errOrStatus === "number" && Number.isFinite(errOrStatus)
      ? errOrStatus
      : undefined;

  const msg = messageOf(errOrStatus).toLowerCase();
  const name = nameOf(errOrStatus).toLowerCase();

  if (
    httpStatus === undefined ||
    httpStatus === 0 ||
    httpStatus === 408 ||
    httpStatus === 429 ||
    httpStatus >= 500 ||
    name === "aborterror" ||
    msg.includes("timeout") ||
    msg.includes("timed out") ||
    msg.includes("network") ||
    msg.includes("fetch failed") ||
    msg.includes("econnrefused") ||
    msg.includes("econnreset") ||
    msg.includes("unavailable") ||
    msg.includes("not configured")
  ) {
    return "PYTHON_SERVICE_UNAVAILABLE";
  }

  return "PYTHON_PROCESSING_FAILED";
}

export function toDomainError(err: unknown, fallback: DomainErrorCode = "DATABASE_FAILURE"): DomainError {
  if (err instanceof DomainError) return err;
  const code =
    fallback === "AI_PROVIDER_UNAVAILABLE" ||
    fallback === "AI_TIMEOUT" ||
    fallback === "AI_INVALID_OUTPUT"
      ? classifyAiFailure(err)
      : fallback === "PYTHON_SERVICE_UNAVAILABLE" ||
        fallback === "PYTHON_PROCESSING_FAILED"
      ? classifyPythonFailure(err)
      : fallback;
  return new DomainError(code, defaultMessage(code), { cause: err });
}
