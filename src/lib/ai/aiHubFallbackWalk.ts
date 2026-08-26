/**
 * Pure AI Hub fallback-chain walk.
 *
 * Mirrors `supabase/functions/ai-hub-router/index.ts` (~452–534):
 * primary model first, then `fallbackChain` excluding the primary, stop on first
 * success; when every attempt fails return a structured error (never silent success).
 *
 * Keep the Edge router loop in sync with this algorithm when changing either side.
 */

export type HubModelSelection = {
  model: string;
  provider?: string;
};

export type HubGenerateAttempt = {
  success: boolean;
  model: string;
  provider?: string;
  errorCode?: string | null;
  errorMessage?: string | null;
  responseText?: string;
};

export type HubFallbackWalkResult = {
  result: HubGenerateAttempt;
  usedModel: string;
  tried: string[];
  exhausted: boolean;
  wasFallback: boolean;
};

/**
 * Build the ordered candidate list: primary, then unique fallbacks.
 */
export function buildHubTryModels(
  primary: HubModelSelection,
  fallbackChain: string[],
): HubModelSelection[] {
  const seen = new Set<string>([primary.model]);
  const out: HubModelSelection[] = [primary];
  for (const id of fallbackChain) {
    if (!id || seen.has(id)) continue;
    seen.add(id);
    out.push({ model: id });
  }
  return out;
}

/**
 * Walk the fallback chain synchronously (testable / reusable).
 * `attempt` should return success:false on provider failure — never throw for
 * "try next" cases unless you want the walk to abort early.
 */
export function walkHubFallbackChain(opts: {
  primary: HubModelSelection;
  fallbackChain: string[];
  attempt: (sel: HubModelSelection) => HubGenerateAttempt;
  /** Return false to skip a candidate (e.g. over budget). */
  isEligible?: (sel: HubModelSelection) => boolean;
}): HubFallbackWalkResult {
  const tryModels = buildHubTryModels(opts.primary, opts.fallbackChain);
  const tried: string[] = [];
  let lastFail: HubGenerateAttempt | null = null;

  for (const candidate of tryModels) {
    if (opts.isEligible && !opts.isEligible(candidate)) continue;
    tried.push(candidate.model);
    const attempt = opts.attempt(candidate);
    if (attempt.success) {
      return {
        result: attempt,
        usedModel: candidate.model,
        tried,
        exhausted: false,
        wasFallback: candidate.model !== opts.primary.model,
      };
    }
    lastFail = attempt;
  }

  if (lastFail) {
    return {
      result: lastFail,
      usedModel: lastFail.model,
      tried,
      exhausted: true,
      wasFallback: lastFail.model !== opts.primary.model,
    };
  }

  // No eligible candidates — structured ROUTING_EXHAUSTED (matches Edge).
  return {
    result: {
      success: false,
      model: opts.primary.model,
      provider: opts.primary.provider,
      responseText: "",
      errorCode: "ROUTING_EXHAUSTED",
      errorMessage: "No eligible model could complete this request within budget.",
    },
    usedModel: opts.primary.model,
    tried,
    exhausted: true,
    wasFallback: false,
  };
}
