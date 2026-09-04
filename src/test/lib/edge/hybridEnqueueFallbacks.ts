/**
 * Pure mirrors of hybridExecute enqueue / credit / validation flow for Vitest.
 * Keep in sync with `supabase/functions/_shared/hybridExecute.ts`.
 */

export type HybridRouteSource = "database" | "deterministic" | "python" | "ai";

export type RouteFallbackFlags = {
  preferredOrder: HybridRouteSource[];
  pythonFallbackOnAiFailure: boolean;
  aiFallbackOnPythonFailure: boolean;
  canCompleteDeterministically: boolean;
  canCompleteWithDatabase: boolean;
  canUseAI: boolean;
  canUsePython: boolean;
  /** When true, empty-queue failure is AI_PROVIDER_UNAVAILABLE (not PYTHON_*). */
  isAiRequired?: boolean;
};

/** Mirrors `decideRoute` chaos flags (HYBRID_FORCE_* env). */
export type ChaosFlags = {
  forceAiUnavailable?: boolean;
  forcePythonUnavailable?: boolean;
};

export function applyChaosFlags(
  route: RouteFallbackFlags,
  chaos: ChaosFlags = {},
): RouteFallbackFlags {
  return {
    ...route,
    canUseAI: chaos.forceAiUnavailable ? false : route.canUseAI,
    canUsePython: chaos.forcePythonUnavailable ? false : route.canUsePython,
  };
}

export function enqueueFallbacks(
  failed: HybridRouteSource,
  route: RouteFallbackFlags,
  remaining: HybridRouteSource[],
  queued: Set<HybridRouteSource>,
): void {
  const push = (s: HybridRouteSource) => {
    if (!queued.has(s)) {
      remaining.push(s);
      queued.add(s);
    }
  };

  if (failed === "ai" && route.pythonFallbackOnAiFailure) {
    push("python");
    if (route.canCompleteDeterministically) push("deterministic");
    if (route.canCompleteWithDatabase) push("database");
  }

  if (failed === "python") {
    if (route.aiFallbackOnPythonFailure) push("ai");
    if (route.canCompleteDeterministically) push("deterministic");
    if (route.canCompleteWithDatabase) push("database");
  }
}

function buildTriedOrder(route: RouteFallbackFlags): HybridRouteSource[] {
  const seen = new Set<HybridRouteSource>();
  const order: HybridRouteSource[] = [];
  for (const s of route.preferredOrder) {
    if (!seen.has(s)) {
      seen.add(s);
      order.push(s);
    }
  }
  return order;
}

export type HybridSimResult<T> =
  | {
      ok: true;
      data: T;
      source: HybridRouteSource | "fallback";
      deductCount: number;
      refundCount: number;
      fallbackReason?: string;
    }
  | {
      ok: false;
      code: string;
      deductCount: number;
      refundCount: number;
      fallbackReason?: string;
    };

/**
 * Minimal hybrid executor: reserve credits once → walk preferredOrder with
 * enqueueFallbacks → refund once on total failure. Never returns success when
 * validate throws.
 */
export async function simulateHybridExecution<T>(opts: {
  route: RouteFallbackFlags;
  creditCost: number;
  runners: Partial<Record<HybridRouteSource, () => Promise<T | null>>>;
  /** Throw to simulate CONTENT / validation failure for that source. */
  validate?: (data: T, source: HybridRouteSource) => T | Promise<T>;
}): Promise<HybridSimResult<T>> {
  let deductCount = 0;
  let refundCount = 0;
  let creditsReserved = false;
  let creditFinalized = false;

  if (opts.creditCost > 0) {
    deductCount += 1;
    creditsReserved = true;
  }

  const queue = buildTriedOrder(opts.route);
  const queued = new Set<HybridRouteSource>(queue);
  let fallbackReason: string | undefined;
  let lastFailCode = opts.route.isAiRequired
    ? "AI_PROVIDER_UNAVAILABLE"
    : "PYTHON_SERVICE_UNAVAILABLE";
  let attempts = 0;
  const maxAttempts = 8;

  while (queue.length > 0 && attempts < maxAttempts) {
    attempts += 1;
    const source = queue.shift()!;

    if (source === "ai" && !opts.route.canUseAI) continue;
    if (source === "python" && !opts.route.canUsePython) continue;
    if (source === "deterministic" && !opts.route.canCompleteDeterministically) continue;
    if (source === "database" && !opts.route.canCompleteWithDatabase) continue;

    const runner = opts.runners[source];
    if (!runner) continue;

    try {
      const raw = await runner();
      if (raw == null) {
        if (source === "ai") {
          lastFailCode = "AI_INVALID_OUTPUT";
          const before = queue.length;
          enqueueFallbacks(source, opts.route, queue, queued);
          if (queue.length > before) fallbackReason = `${source}_failed:${lastFailCode}`;
        }
        continue;
      }

      let data = raw;
      if (opts.validate) {
        try {
          data = await opts.validate(data, source);
        } catch {
          lastFailCode =
            source === "ai"
              ? "AI_INVALID_OUTPUT"
              : source === "python"
                ? "PYTHON_PROCESSING_FAILED"
                : "AI_INVALID_OUTPUT";
          fallbackReason = `validate_failed:${lastFailCode}`;
          enqueueFallbacks(source, opts.route, queue, queued);
          continue;
        }
      }

      creditFinalized = true;
      return {
        ok: true,
        data,
        source: fallbackReason ? "fallback" : source,
        deductCount,
        refundCount,
        fallbackReason,
      };
    } catch {
      lastFailCode =
        source === "ai"
          ? "AI_PROVIDER_UNAVAILABLE"
          : source === "python"
            ? "PYTHON_SERVICE_UNAVAILABLE"
            : "DATABASE_FAILURE";
      const before = queue.length;
      enqueueFallbacks(source, opts.route, queue, queued);
      if (queue.length > before) fallbackReason = `${source}_failed:${lastFailCode}`;
    }
  }

  if (creditsReserved && !creditFinalized) {
    refundCount += 1;
  }

  if (
    opts.route.isAiRequired &&
    (lastFailCode === "PYTHON_SERVICE_UNAVAILABLE" ||
      lastFailCode === "PYTHON_PROCESSING_FAILED")
  ) {
    lastFailCode = "AI_PROVIDER_UNAVAILABLE";
  }

  return {
    ok: false,
    code: lastFailCode,
    deductCount,
    refundCount,
    fallbackReason,
  };
}
