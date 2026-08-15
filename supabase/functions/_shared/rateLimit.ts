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
  /** True when the distributed rate-limit backend failed (not a normal 429). */
  backendFailure?: boolean;
};

/** Endpoint classification for rate-limit outage strategy. */
export type RateLimitClass = "strict_fail_closed" | "controlled_degradation_candidate";

export const RATE_LIMIT_CLASS: Record<string, RateLimitClass> = {
  "create-checkout": "strict_fail_closed",
  "stripe-webhook": "strict_fail_closed",
  "razorpay-create-order": "strict_fail_closed",
  "razorpay-verify-payment": "strict_fail_closed",
  "razorpay-webhook": "strict_fail_closed",
  "deduct-credits": "strict_fail_closed",
  "generate-answer": "strict_fail_closed",
  "generate-hint": "strict_fail_closed",
  "prep-tool": "strict_fail_closed",
  "collect-exam-papers": "strict_fail_closed",
  "ingest-source-document": "strict_fail_closed",
  "bulk-import-questions": "strict_fail_closed",
  "ai-hub-router": "strict_fail_closed",
  "support-chat": "controlled_degradation_candidate",
  "analytics-dashboard": "controlled_degradation_candidate",
  ping: "controlled_degradation_candidate",
};

const RATE_LIMIT_RPC_TIMEOUT_MS = 2_000;

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
 * Returns a standard JSON 429 (quota) or 503 (backend outage) response.
 * Sensitive endpoints remain fail-closed — never bypass.
 */
export function rateLimitResponse(result: RateLimitResult): Response {
  if (result.backendFailure) {
    return new Response(
      JSON.stringify({
        error: "Temporary service unavailability. Please try again shortly.",
        code: "RATE_LIMIT_BACKEND_UNAVAILABLE",
        retryAfterSeconds: result.retryAfterSeconds || 5,
      }),
      {
        status: 503,
        headers: {
          "Content-Type": "application/json",
          "Retry-After": String(result.retryAfterSeconds || 5),
        },
      },
    );
  }

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

  /** Checkout / order creation — 10/min (P4-1). */
  PAYMENT_ACTION: {
    limit: 10,
    windowMs: 60_000,
  },

  /** Transactional email send — 10/min (P4-1). */
  EMAIL_ACTION: {
    limit: 10,
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

  /** Scraper ingest — generous for batch papers, still abuse-resistant. */
  BULK_INGEST: {
    limit: 30,
    windowMs: 60_000,
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

export async function enforceSessionRateLimitAsync(
  adminClient: {
    rpc: (
      fn: string,
      args: Record<string, unknown>
    ) => Promise<{ data: unknown; error: { message: string } | null }>;
  },
  functionName: string,
  userId: string
): Promise<Response | null> {
  return enforceRateLimitAsync(adminClient, {
    key: createRateLimitKey(functionName, userId),
    ...RATE_LIMIT_PRESETS.SESSION_ACTION,
  });
}

export async function enforceAccountDeletionRateLimitAsync(
  adminClient: {
    rpc: (
      fn: string,
      args: Record<string, unknown>
    ) => Promise<{ data: unknown; error: { message: string } | null }>;
  },
  userId: string
): Promise<Response | null> {
  return enforceRateLimitAsync(adminClient, {
    key: createRateLimitKey("delete-account", userId),
    ...RATE_LIMIT_PRESETS.ACCOUNT_DELETION,
  });
}

export async function enforceDataExportRateLimitAsync(
  adminClient: {
    rpc: (
      fn: string,
      args: Record<string, unknown>
    ) => Promise<{ data: unknown; error: { message: string } | null }>;
  },
  userId: string
): Promise<Response | null> {
  return enforceRateLimitAsync(adminClient, {
    key: createRateLimitKey("export-user-data", userId),
    ...RATE_LIMIT_PRESETS.DATA_EXPORT,
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
 * Async distributed rate limit via Postgres RPC.
 * Fail-closed on RPC errors (deny request) to resist multi-isolate abuse.
 */
export async function checkRateLimitAsync(
  adminClient: {
    rpc: (
      fn: string,
      args: Record<string, unknown>
    ) => Promise<{ data: unknown; error: { message: string } | null }>;
  },
  options: RateLimitOptions
): Promise<RateLimitResult> {
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

  const deny: RateLimitResult = {
    allowed: false,
    limit,
    remaining: 0,
    resetAt: Date.now() + windowMs,
    retryAfterSeconds: Math.ceil(windowMs / 1000),
    backendFailure: true,
  };

  try {
    const rpcPromise = adminClient.rpc("check_rate_limit", {
      p_key: key,
      p_limit: limit,
      p_window_ms: windowMs,
    });

    const timeoutPromise = new Promise<{ data: null; error: { message: string } }>((resolve) => {
      setTimeout(
        () => resolve({ data: null, error: { message: "rate_limit_rpc_timeout" } }),
        RATE_LIMIT_RPC_TIMEOUT_MS,
      );
    });

    const { data, error } = await Promise.race([rpcPromise, timeoutPromise]);

    if (error) {
      // Fail closed: do not fall open to per-isolate memory under RPC outage.
      console.error("[rateLimit] RPC failed — denying request:", error.message);
      return deny;
    }

    const row = Array.isArray(data) ? data[0] : data;
    if (!row || typeof row !== "object") {
      console.error("[rateLimit] RPC returned empty row — denying request");
      return deny;
    }

    const r = row as {
      allowed?: boolean;
      remaining?: number;
      reset_at_ms?: number;
      retry_after_seconds?: number;
    };

    return {
      allowed: Boolean(r.allowed),
      limit,
      remaining: Number(r.remaining ?? 0),
      resetAt: Number(r.reset_at_ms ?? Date.now() + windowMs),
      retryAfterSeconds: Number(r.retry_after_seconds ?? 0),
      backendFailure: false,
    };
  } catch (err) {
    console.error(
      "[rateLimit] RPC exception — denying request:",
      err instanceof Error ? err.message : err
    );
    return deny;
  }
}

export async function enforceRateLimitAsync(
  adminClient: {
    rpc: (
      fn: string,
      args: Record<string, unknown>
    ) => Promise<{ data: unknown; error: { message: string } | null }>;
  },
  options: RateLimitOptions
): Promise<Response | null> {
  const result = await checkRateLimitAsync(adminClient, options);
  if (!result.allowed) {
    return rateLimitResponse(result);
  }
  return null;
}

export async function enforceAiRateLimitAsync(
  adminClient: {
    rpc: (
      fn: string,
      args: Record<string, unknown>
    ) => Promise<{ data: unknown; error: { message: string } | null }>;
  },
  functionName: string,
  userId: string
): Promise<Response | null> {
  return enforceRateLimitAsync(adminClient, {
    key: createRateLimitKey(functionName, userId),
    ...RATE_LIMIT_PRESETS.AI_GENERATION,
  });
}

export async function enforceStrictAiRateLimitAsync(
  adminClient: {
    rpc: (
      fn: string,
      args: Record<string, unknown>
    ) => Promise<{ data: unknown; error: { message: string } | null }>;
  },
  functionName: string,
  userId: string
): Promise<Response | null> {
  return enforceRateLimitAsync(adminClient, {
    key: createRateLimitKey(functionName, userId),
    ...RATE_LIMIT_PRESETS.AI_GENERATION_STRICT,
  });
}

export async function enforcePaymentRateLimitAsync(
  adminClient: {
    rpc: (
      fn: string,
      args: Record<string, unknown>
    ) => Promise<{ data: unknown; error: { message: string } | null }>;
  },
  functionName: string,
  userId: string
): Promise<Response | null> {
  return enforceRateLimitAsync(adminClient, {
    key: createRateLimitKey(functionName, userId),
    ...RATE_LIMIT_PRESETS.PAYMENT_ACTION,
  });
}

export async function enforceEmailRateLimitAsync(
  adminClient: {
    rpc: (
      fn: string,
      args: Record<string, unknown>
    ) => Promise<{ data: unknown; error: { message: string } | null }>;
  },
  functionName: string,
  userId: string
): Promise<Response | null> {
  return enforceRateLimitAsync(adminClient, {
    key: createRateLimitKey(functionName, userId),
    ...RATE_LIMIT_PRESETS.EMAIL_ACTION,
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
