/**
 * Bounded exponential backoff for live practice transient failures.
 * Reuses the same idempotency key across attempts so Edge credit deduction
 * cannot double-charge on retry.
 */

import { ApiClientError } from "@/lib/api/apiClient";
import { fetchEdge } from "@/lib/network/fetchEdge";

export const LIVE_RETRY_DELAYS_MS = [300, 800, 1600] as const;

const RETRYABLE_STATUS = new Set([408, 425, 429, 500, 502, 503, 504]);

const RETRYABLE_CODES = new Set([
  "AI_TIMEOUT",
  "AI_PROVIDER_UNAVAILABLE",
  "PROVIDER_UNAVAILABLE",
  "PYTHON_SERVICE_UNAVAILABLE",
  "DATABASE_FAILURE",
  "DEPENDENCY_UNAVAILABLE",
  "SERVICE_UNAVAILABLE",
  "BAD_GATEWAY",
  "COACH_AI_UNAVAILABLE",
]);

export function isTransientLiveFailure(err: unknown): boolean {
  if (!(err instanceof ApiClientError)) {
    if (err instanceof TypeError) return true;
    if (err instanceof Error) {
      const msg = err.message.toLowerCase();
      if (msg.includes("aborted") || msg.includes("aborterror")) return false;
      return (
        msg.includes("failed to fetch") ||
        msg.includes("network") ||
        msg.includes("timeout") ||
        msg.includes("unavailable")
      );
    }
    return false;
  }
  if (RETRYABLE_STATUS.has(err.status)) return true;
  const code = String(err.code ?? "").toUpperCase();
  if (RETRYABLE_CODES.has(code)) return true;
  const details = err.details as { retryable?: boolean } | undefined;
  if (details?.retryable === true) return true;
  return false;
}

export function isPracticeSessionExpiredError(err: unknown): boolean {
  if (!(err instanceof ApiClientError)) return false;
  const code = String(err.code ?? "").toUpperCase();
  return (
    code === "SESSION_EXPIRED" ||
    (err.status === 409 && /session.?expired/i.test(err.message))
  );
}

function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(new DOMException("The operation was aborted.", "AbortError"));
      return;
    }
    const t = setTimeout(resolve, ms);
    const onAbort = () => {
      clearTimeout(t);
      reject(new DOMException("The operation was aborted.", "AbortError"));
    };
    signal?.addEventListener("abort", onAbort, { once: true });
  });
}

function delayWithJitter(baseMs: number): number {
  const jitter = Math.floor(Math.random() * Math.min(120, baseMs * 0.25));
  return baseMs + jitter;
}

/**
 * Run `fn` with bounded retries on transient failures.
 * Does not retry practice SESSION_EXPIRED or other non-retryable errors.
 */
export async function withLiveTransientRetry<T>(
  fn: (attempt: number) => Promise<T>,
  options?: {
    delaysMs?: readonly number[];
    signal?: AbortSignal;
    shouldRetry?: (err: unknown, attempt: number) => boolean;
  },
): Promise<T> {
  const delays = options?.delaysMs ?? LIVE_RETRY_DELAYS_MS;
  const maxAttempts = delays.length + 1;
  let lastErr: unknown;

  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    if (options?.signal?.aborted) {
      throw new DOMException("The operation was aborted.", "AbortError");
    }
    try {
      return await fn(attempt);
    } catch (err) {
      lastErr = err;
      if (isPracticeSessionExpiredError(err)) throw err;
      const allow =
        options?.shouldRetry?.(err, attempt) ?? isTransientLiveFailure(err);
      if (!allow || attempt >= delays.length) throw err;
      await sleep(delayWithJitter(delays[attempt]!), options?.signal);
    }
  }

  throw lastErr;
}

type FetchEdgeOptions = NonNullable<Parameters<typeof fetchEdge>[2]>;

/**
 * fetchEdge for live AI with bounded retry on HTTP 5xx/429 before the body
 * is consumed. Callers must keep the same Idempotency-Key across attempts.
 */
export async function fetchLiveEdgeWithRetry(
  fnName: string,
  body: unknown,
  options?: FetchEdgeOptions,
): Promise<Response> {
  return withLiveTransientRetry(
    async () => {
      const response = await fetchEdge(fnName, body as Record<string, unknown>, options);
      if (response.ok) return response;

      const errText = await response.text().catch(() => `HTTP ${response.status}`);
      let parsed: {
        error?: string;
        code?: string;
        message?: string;
        retryable?: boolean;
      } | null = null;
      try {
        parsed = JSON.parse(errText) as {
          error?: string;
          code?: string;
          message?: string;
          retryable?: boolean;
        };
      } catch {
        parsed = null;
      }
      throw new ApiClientError({
        message:
          parsed?.error ||
          parsed?.message ||
          `Request failed (HTTP ${response.status}).`,
        status: response.status,
        code: parsed?.code ?? "API_ERROR",
        details:
          parsed?.retryable != null ? { retryable: parsed.retryable } : undefined,
      });
    },
    { signal: options?.signal },
  );
}
