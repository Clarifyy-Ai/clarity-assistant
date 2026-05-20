// supabase/functions/_shared/rateLimit.ts
//
// Shared rate limiting utilities limiter works per Edge Function isolate/runtime instance.// Shared rate limiting utilities for Supabase Edge Functions.
// For strict distributed production rate limiting, use a shared store:
// - Supabase Postgres table
// - Redis / Upstash
// - Cloudflare KV / Durable Object
//
// This file is still useful as a baseline guard and can later be upgraded
// without changing every function's rate-limit call sites.

export type RateLimitResult = {
  allowed: boolean;
  limit: number;
  remaining: number;
  resetAt: number;
  retryAfterSeconds: number;
};

export type RateLimitOptions = {
  key: string;
  limit: number;
  windowMs: number;
};

type RateLimitEntry = {
  count: number;
  resetAt: number;
};

const store = new Map<string, RateLimitEntry>();

const DEFAULT_CLEANUP_INTERVAL_MS = 60_000;
let lastCleanupAt = Date.now();

function now(): number {
  return Date.now();
}

function cleanupExpiredEntries(currentTime = now()): void {
  if (currentTime - lastCleanupAt < DEFAULT_CLEANUP_INTERVAL_MS) {
    return;
  }

  for (const [key, entry] of store.entries()) {
    if (entry.resetAt <= currentTime) {
      store.delete(key);
    }
  }

  lastCleanupAt = currentTime;
}

function secondsUntil(timestampMs: number, currentTime = now()): number {
  return Math.max(0, Math.ceil((timestampMs - currentTime) / 1000));
}

/**
 * Creates a safe rate-limit key.
 *
 * Recommended format:
 * functionName:userId
 *
 * Example:
 * createRateLimitKey("generate-answer", user.id)
 */
export function createRateLimitKey(
  functionName: string,
  identifier: string,
  extra?: string
): string {
  const safeFunctionName = functionName.trim().toLowerCase();
  const safeIdentifier = identifier.trim();

  if (extra && extra.trim().length > 0) {
    return `${safeFunctionName}:${safeIdentifier}:${extra.trim()}`;
  }

  return `${safeFunctionName}:${safeIdentifier}`;
}

/**
 * Main rate-limit check.
 *
 * Returns:
 * - allowed = true if request can continue
 * - allowed = false if request must be rejected with 429
 */
export function checkRateLimit(options: RateLimitOptions): RateLimitResult {
  const currentTime = now();

  cleanupExpiredEntries(currentTime);

  const { key, limit, windowMs } = options;

  if (!key || key.trim().length === 0) {
    throw new Error("[rateLimit] key is required.");
  }

  if (!Number.isInteger(limit) || limit <= 0) {
    throw new Error("[rateLimit] limit must be a positive integer.");
  }

  if (!Number.isInteger(windowMs) || windowMs <= 0) {
    throw new Error("[rateLimit] windowMs must be a positive integer.");
  }

  const existingEntry = store.get(key);

  if (!existingEntry || existingEntry.resetAt <= currentTime) {
    const resetAt = currentTime + windowMs;

    store.set(key, {
      count: 1,
      resetAt,
    });

    return {
      allowed: true,
      limit,
      remaining: Math.max(0, limit - 1),
      resetAt,
      retryAfterSeconds: 0,
    };
  }

  if (existingEntry.count >= limit) {
    return {
      allowed: false,
      limit,
      remaining: 0,
      resetAt: existingEntry.resetAt,
      retryAfterSeconds: secondsUntil(existingEntry.resetAt, currentTime),
    };
  }

  existingEntry.count += 1;
  store.set(key, existingEntry);

  return {
    allowed: true,
    limit,
    remaining: Math.max(0, limit - existingEntry.count),
    resetAt: existingEntry.resetAt,
    retryAfterSeconds: 0,
  };
}

/**
 * Returns a standard JSON 429 response.
 */
export function rateLimitResponse(result: RateLimitResult): Response {
  return new Response(
    JSON.stringify({
      error: "Rate limit exceeded.",
      code: "RATE_LIMITED",
      retryAfterSeconds: result.retryAfterSeconds,
    }),
    {
      status: 429,
      headers: {
        "Content-Type": "application/json",
        "Retry-After": String(result.retryAfterSeconds),
        "X-RateLimit-Limit": String(result.limit),
        "X-RateLimit-Remaining": String(result.remaining),
        "X-RateLimit-Reset": String(Math.ceil(result.resetAt / 1000)),
      },
    }
  );
}

/**
 * Convenience helper:
 * Checks the rate limit and directly returns a Response if blocked.
 *
 * Usage:
 * const blocked = enforceRateLimit({
 *   key: createRateLimitKey("generate-answer", userId),
 *   limit: 5,
 *   windowMs: 60_000,
 * });
 *
 * if (blocked) return blocked;
 */
export function enforceRateLimit(options: RateLimitOptions): Response | null {
  const result = checkRateLimit(options);

  if (!result.allowed) {
    return rateLimitResponse(result);
  }

  return null;
}

/**
 * Useful default limits for common function types.
 */
export const RATE_LIMIT_PRESETS = {
  AI_GENERATION: {
    limit: 5,
    windowMs: 60_000,
  },

  AI_GENERATION_STRICT: {
    limit: 3,
    windowMs: 60_000,
  },

  SESSION_ACTION: {
    limit: 20,
    windowMs: 60_000,
  },

  AUTH_SENSITIVE: {
    limit: 5,
    windowMs: 60_000,
  },

  PAYMENT_ACTION: {
    limit: 3,
    windowMs: 60_000,
  },

  ACCOUNT_DELETION: {
    limit: 1,
    windowMs: 24 * 60 * 60 * 1000,
  },

  DATA_EXPORT: {
    limit: 2,
    windowMs: 60 * 60 * 1000,
  },
} as const;

/**
 * Helper for AI generation endpoints.
 */
export function enforceAiRateLimit(
  functionName: string,
  userId: string
): Response | null {
  return enforceRateLimit({
    key: createRateLimitKey(functionName, userId),
    ...RATE_LIMIT_PRESETS.AI_GENERATION,
  });
}

/**
 * Helper for strict AI endpoints like generate-answer / generate-debrief.
 */
export function enforceStrictAiRateLimit(
  functionName: string,
  userId: string
): Response | null {
  return enforceRateLimit({
    key: createRateLimitKey(functionName, userId),
    ...RATE_LIMIT_PRESETS.AI_GENERATION_STRICT,
  });
}

/**
 * Helper for session endpoints like start-session / end-session.
 */
export function enforceSessionRateLimit(
  functionName: string,
  userId: string
): Response | null {
  return enforceRateLimit({
    key: createRateLimitKey(functionName, userId),
    ...RATE_LIMIT_PRESETS.SESSION_ACTION,
  });
}

/**
 * Helper for payment endpoints like checkout / deduct-credits.
 */
export function enforcePaymentRateLimit(
  functionName: string,
  userId: string
): Response | null {
  return enforceRateLimit({
    key: createRateLimitKey(functionName, userId),
    ...RATE_LIMIT_PRESETS.PAYMENT_ACTION,
  });
}

/**
 * Helper for account deletion.
 */
export function enforceAccountDeletionRateLimit(userId: string): Response | null {
  return enforceRateLimit({
    key: createRateLimitKey("delete-account", userId),
    ...RATE_LIMIT_PRESETS.ACCOUNT_DELETION,
  });
}

/**
 * Helper for data export.
 */
export function enforceDataExportRateLimit(userId: string): Response | null {
  return enforceRateLimit({
    key: createRateLimitKey("export-user-data", userId),
    ...RATE_LIMIT_PRESETS.DATA_EXPORT,
  });
}

/**
 * Testing/debug helper.
 * Do not call this from production request handlers.
 */
export function clearRateLimitStore(): void {
  store.clear();
}
//
// SECURITY PURPOSE:
// - Protect expensive AI/payment/session endpoints from abuse
// - Reduce brute-force attempts
// - Reduce API cost spikes
// - Return consistent 429 responses
//
// IMPORTANT PRODUCTION NOTE:
