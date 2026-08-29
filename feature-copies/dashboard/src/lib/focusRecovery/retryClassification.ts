export type ClassifiedErrorKind =
  | "network"
  | "infrastructure"
  | "authentication"
  | "authorization"
  | "validation"
  | "not_found"
  | "rate_limited"
  | "cancelled"
  | "unknown";

export interface ClassifiedError {
  kind: ClassifiedErrorKind;
  retryable: boolean;
  maxRetries: number;
}

function messageOf(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (typeof error === "string") return error;
  if (error && typeof error === "object" && "message" in error) {
    const msg = (error as { message?: unknown }).message;
    if (typeof msg === "string") return msg;
  }
  return "";
}

function statusOf(error: unknown): number | null {
  if (!error || typeof error !== "object") return null;
  const rec = error as {
    status?: unknown;
    statusCode?: unknown;
    httpStatus?: unknown;
    code?: unknown;
  };
  for (const value of [rec.status, rec.statusCode, rec.httpStatus]) {
    if (typeof value === "number" && Number.isFinite(value)) return value;
  }
  if (typeof rec.code === "number") return rec.code;
  return null;
}

export function isAbortLikeError(error: unknown): boolean {
  if (!error) return false;
  if (typeof error === "object" && (error as { name?: string }).name === "AbortError") {
    return true;
  }
  const msg = messageOf(error).toLowerCase();
  return (
    msg.includes("abort") ||
    msg.includes("aborted") ||
    msg.includes("the operation was aborted") ||
    msg.includes("request cancelled") ||
    msg.includes("canceled")
  );
}

export function classifyRequestError(error: unknown): ClassifiedError {
  if (isAbortLikeError(error)) {
    return { kind: "cancelled", retryable: false, maxRetries: 0 };
  }

  const status = statusOf(error);
  const msg = messageOf(error).toLowerCase();

  if (
    status === 401 ||
    msg.includes("jwt expired") ||
    msg.includes("invalid refresh token") ||
    msg.includes("refresh token not found") ||
    msg.includes("invalid_grant") ||
    msg.includes("not authenticated")
  ) {
    return { kind: "authentication", retryable: false, maxRetries: 0 };
  }

  if (
    status === 403 ||
    msg.includes("permission denied") ||
    msg.includes("row-level security") ||
    msg.includes("rls") ||
    msg.includes("not authorized")
  ) {
    return { kind: "authorization", retryable: false, maxRetries: 0 };
  }

  if (status === 404 || msg.includes("not found") || msg.includes("pgrst116")) {
    return { kind: "not_found", retryable: false, maxRetries: 0 };
  }

  if (
    status === 400 ||
    status === 409 ||
    status === 422 ||
    msg.includes("invalid input") ||
    msg.includes("validation")
  ) {
    return { kind: "validation", retryable: false, maxRetries: 0 };
  }

  if (status === 429 || msg.includes("rate limit") || msg.includes("too many requests")) {
    return { kind: "rate_limited", retryable: true, maxRetries: 1 };
  }

  if (
    status === 500 ||
    status === 502 ||
    status === 503 ||
    status === 504 ||
    msg.includes("internal server") ||
    msg.includes("bad gateway") ||
    msg.includes("service unavailable")
  ) {
    return { kind: "infrastructure", retryable: true, maxRetries: 1 };
  }

  if (
    msg.includes("failed to fetch") ||
    msg.includes("network") ||
    msg.includes("timed out") ||
    msg.includes("timeout") ||
    msg.includes("load failed") ||
    msg.includes("offline")
  ) {
    return { kind: "network", retryable: true, maxRetries: 1 };
  }

  return { kind: "unknown", retryable: false, maxRetries: 0 };
}

export function shouldRetryRequest(
  error: unknown,
  attempt: number,
): boolean {
  const classified = classifyRequestError(error);
  return classified.retryable && attempt < classified.maxRetries;
}
