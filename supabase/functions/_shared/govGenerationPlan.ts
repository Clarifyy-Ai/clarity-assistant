/**
 * Server-authoritative decision for HOW a government exam paper gets built.
 *
 * A short question bank is no longer a dead end: when the caller's plan includes
 * `gov_exam_ai_fill`, the shortfall is generated to the blueprint and the paper is
 * labelled as an AI practice paper. Generation is only blocked when neither the bank
 * nor AI can deliver the requested count.
 */

export type GenerationPlanKind = "bank_only" | "ai_assisted" | "blocked";
export type PaperGenerator = "edge_assembler" | "python_paper_factory";

/** Modes where fresh AI questions are acceptable. Official reproductions are not. */
const AI_ELIGIBLE_MODES = new Set(["generated_mock", "custom_mock", "adaptive"]);

export interface GenerationPlan {
  kind: GenerationPlanKind;
  requested: number;
  available: number;
  bankContribution: number;
  aiContribution: number;
  /** Written into `request_json` so the assembler knows whether it may call AI. */
  skipAiFill: boolean;
  generator: PaperGenerator;
  /** Largest bank-only practice set we can honestly offer as a fallback. */
  maxCustomSetSize: number;
  reasonCode?: "QUESTION_INVENTORY_INSUFFICIENT" | "CAPABILITY_REQUIRED";
  paperClass: "official_previous" | "ai_generated" | "custom_practice";
}

export function decideGenerationPlan(input: {
  requested: number;
  available: number;
  mode: string;
  canUseAi: boolean;
  /** Route heavy generation to the Python worker instead of the Edge assembler. */
  preferPythonFactory?: boolean;
}): GenerationPlan {
  const requested = Math.max(0, Math.floor(input.requested));
  const available = Math.max(0, Math.floor(input.available));
  const aiEligibleMode = AI_ELIGIBLE_MODES.has(input.mode);
  const generator: PaperGenerator = input.preferPythonFactory
    ? "python_paper_factory"
    : "edge_assembler";

  const paperClass: GenerationPlan["paperClass"] = input.mode === "official_previous"
    ? "official_previous"
    : input.mode === "custom_mock" || input.mode === "adaptive"
    ? "custom_practice"
    : "ai_generated";

  // The bank alone satisfies the request.
  if (requested > 0 && available >= requested) {
    return {
      kind: "bank_only",
      requested,
      available,
      bankContribution: requested,
      aiContribution: 0,
      skipAiFill: true,
      generator: "edge_assembler",
      maxCustomSetSize: available,
      paperClass,
    };
  }

  // Shortfall, but the caller may generate the difference.
  if (requested > 0 && aiEligibleMode && input.canUseAi) {
    return {
      kind: "ai_assisted",
      requested,
      available,
      bankContribution: Math.min(available, requested),
      aiContribution: requested - Math.min(available, requested),
      skipAiFill: false,
      generator,
      maxCustomSetSize: available,
      paperClass: "ai_generated",
    };
  }

  return {
    kind: "blocked",
    requested,
    available,
    bankContribution: Math.min(available, requested),
    aiContribution: 0,
    skipAiFill: true,
    generator: "edge_assembler",
    maxCustomSetSize: available,
    reasonCode: aiEligibleMode && !input.canUseAi
      ? "CAPABILITY_REQUIRED"
      : "QUESTION_INVENTORY_INSUFFICIENT",
    paperClass,
  };
}

/** Client-facing payload for a blocked plan. Never leaks internal state. */
export function blockedPlanPayload(plan: GenerationPlan): {
  error: string;
  code: "QUESTION_INVENTORY_INSUFFICIENT" | "CAPABILITY_REQUIRED";
  available: number;
  requested: number;
  required: number;
  maxCustomSetSize: number;
  aiFillAvailable: boolean;
} {
  const code = plan.reasonCode ?? "QUESTION_INVENTORY_INSUFFICIENT";
  const error = code === "CAPABILITY_REQUIRED"
    ? `Only ${plan.available} approved questions are available for this configuration. ` +
      `Generating the remaining ${plan.requested - plan.available} with AI requires a supported plan.`
    : `Only ${plan.available} approved questions are available for this configuration.`;

  return {
    error,
    code,
    available: plan.available,
    requested: plan.requested,
    required: plan.requested,
    maxCustomSetSize: plan.maxCustomSetSize,
    aiFillAvailable: code === "CAPABILITY_REQUIRED",
  };
}

/** Summary attached to successful responses so the UI can label the paper honestly. */
export function planSummary(plan: GenerationPlan): {
  kind: GenerationPlanKind;
  generator: PaperGenerator;
  bankQuestions: number;
  aiQuestions: number;
  requested: number;
  paperClass: string;
} {
  return {
    kind: plan.kind,
    generator: plan.generator,
    bankQuestions: plan.bankContribution,
    aiQuestions: plan.aiContribution,
    requested: plan.requested,
    paperClass: plan.paperClass,
  };
}
