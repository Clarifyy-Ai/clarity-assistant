/**
 * Explicit Continue/Generate readiness for /app/mock-test/generate.
 * Never depends on interview session startTime or timer state.
 */

export type GeneratorUiPhase = "INITIALIZING" | "INVALID" | "READY";

export type GeneratorReadinessInput = {
  examId: string;
  stageId: string;
  /** Wizard step 0–3 */
  step: number;
  creditsKnown: boolean;
  creditAllowed: boolean;
  creditInsufficient: boolean;
  busy: boolean;
  /** True when a paper job exists and is not terminal */
  jobInFlight: boolean;
  inventoryCanGenerate: boolean;
  customPracticeMax: number;
  deepLinkHydrating: boolean;
  /** Profile + spendable balance still loading past soft timeout */
  creditsTimedOut?: boolean;
};

export type GeneratorReadiness = {
  phase: GeneratorUiPhase;
  /** Continue (steps 0–2) — exam selected; never gated on credits/startTime */
  continueEnabled: boolean;
  /** Primary Generate / Custom Practice Generate */
  generateDisabled: boolean;
  reason:
    | "ok"
    | "no_exam"
    | "no_stage"
    | "hydrating"
    | "credits_unknown"
    | "credits_insufficient"
    | "credits_timeout"
    | "busy"
    | "job_in_flight"
    | "inventory_blocked";
  generateLabelHint:
    | "generate"
    | "checking_credits"
    | "top_up"
    | "retry_credits"
    | "busy";
};

function hasExamId(examId: string): boolean {
  return String(examId ?? "").trim().length > 0;
}

function hasStageId(stageId: string): boolean {
  return String(stageId ?? "").trim().length > 0;
}

/**
 * Shared readiness for Continue + Generate buttons.
 * Availability preflight should use the same examId/stageId as Generate.
 */
export function resolveGeneratorReadiness(
  input: GeneratorReadinessInput,
): GeneratorReadiness {
  const examOk = hasExamId(input.examId);
  const stageOk = hasStageId(input.stageId);

  // Continue: only needs a selected exam (step 0–2). Credits/hydrate never block Continue
  // when examId is already known (including deep-link query before details settle).
  const continueEnabled = examOk;

  if (input.deepLinkHydrating) {
    return {
      phase: "INITIALIZING",
      continueEnabled,
      generateDisabled: true,
      reason: "hydrating",
      generateLabelHint: "checking_credits",
    };
  }

  if (!examOk) {
    return {
      phase: "INVALID",
      continueEnabled: false,
      generateDisabled: true,
      reason: "no_exam",
      generateLabelHint: "generate",
    };
  }

  // Steps 0–2: Continue only; Generate not shown yet.
  if (input.step < 3) {
    return {
      phase: stageOk || input.step < 1 ? "READY" : "INVALID",
      continueEnabled,
      generateDisabled: true,
      reason: stageOk || input.step < 1 ? "ok" : "no_stage",
      generateLabelHint: "generate",
    };
  }

  // Step 3 — Generate
  if (!stageOk) {
    return {
      phase: "INVALID",
      continueEnabled: true,
      generateDisabled: true,
      reason: "no_stage",
      generateLabelHint: "generate",
    };
  }

  if (input.busy) {
    return {
      phase: "READY",
      continueEnabled: true,
      generateDisabled: true,
      reason: "busy",
      generateLabelHint: "busy",
    };
  }

  if (input.jobInFlight) {
    return {
      phase: "READY",
      continueEnabled: true,
      generateDisabled: true,
      reason: "job_in_flight",
      generateLabelHint: "busy",
    };
  }

  if (!input.creditsKnown) {
    if (input.creditsTimedOut) {
      return {
        phase: "INITIALIZING",
        continueEnabled: true,
        generateDisabled: true,
        reason: "credits_timeout",
        generateLabelHint: "retry_credits",
      };
    }
    return {
      phase: "INITIALIZING",
      continueEnabled: true,
      generateDisabled: true,
      reason: "credits_unknown",
      generateLabelHint: "checking_credits",
    };
  }

  if (input.creditInsufficient || !input.creditAllowed) {
    return {
      phase: "READY",
      continueEnabled: true,
      generateDisabled: true,
      reason: "credits_insufficient",
      generateLabelHint: "top_up",
    };
  }

  // Inventory: full generate path vs custom practice floor
  if (!input.inventoryCanGenerate && input.customPracticeMax < 5) {
    return {
      phase: "READY",
      continueEnabled: true,
      generateDisabled: true,
      reason: "inventory_blocked",
      generateLabelHint: "generate",
    };
  }

  return {
    phase: "READY",
    continueEnabled: true,
    generateDisabled: false,
    reason: "ok",
    generateLabelHint: "generate",
  };
}

/** Custom Practice Set button: needs readiness OK + max >= 5 when inventory blocks full generate. */
export function isCustomPracticeGenerateDisabled(
  readiness: GeneratorReadiness,
  customPracticeMax: number,
): boolean {
  if (customPracticeMax < 5) return true;
  if (readiness.reason === "inventory_blocked") {
    // Full path blocked but custom may still run if max >= 5 — only credit/busy gates apply.
    return (
      readiness.generateLabelHint === "checking_credits" ||
      readiness.generateLabelHint === "top_up" ||
      readiness.generateLabelHint === "retry_credits" ||
      readiness.generateLabelHint === "busy" ||
      readiness.reason === "no_stage" ||
      readiness.reason === "no_exam" ||
      readiness.reason === "hydrating"
    );
  }
  return readiness.generateDisabled;
}
