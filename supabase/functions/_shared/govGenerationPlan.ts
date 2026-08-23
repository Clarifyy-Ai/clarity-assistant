/**
 * Server-authoritative decision for HOW a government exam paper gets built.
 *
 * A short question bank is no longer a dead end: when the caller's plan includes
 * `gov_exam_ai_fill`, the shortfall is generated to the blueprint and the paper is
 * labelled as an AI practice paper. Generation is only blocked when neither the bank
 * nor AI can deliver the requested count.
 */

import {
  parseGeneratorPreference,
  resolvePaperGenerator,
  type GeneratorPreference,
} from "./govGeneratorRouting.ts";

export type GenerationPlanKind = "bank_only" | "ai_assisted" | "blocked";
export type PaperGenerator = "edge_assembler" | "python_paper_factory";

export type { GeneratorPreference };
export { parseGeneratorPreference, resolvePaperGenerator };

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
  reasonCode?:
    | "QUESTION_INVENTORY_INSUFFICIENT"
    | "CONTENT_INSUFFICIENT"
    | "CAPABILITY_REQUIRED";
  paperClass: "official_previous" | "ai_generated" | "custom_practice";
}

export function decideGenerationPlan(input: {
  requested: number;
  available: number;
  mode: string;
  canUseAi: boolean;
  /** Caller preference: auto | edge | python (from request body). */
  generatorPreference?: GeneratorPreference;
  /** @deprecated use generatorPreference=python */
  preferPythonFactory?: boolean;
  /** Supabase secret PAPER_FACTORY_WORKER=1 — Python worker is deployed. */
  pythonWorkerEnabled?: boolean;
}): GenerationPlan {
  const requested = Math.max(0, Math.floor(input.requested));
  const available = Math.max(0, Math.floor(input.available));
  const aiEligibleMode = AI_ELIGIBLE_MODES.has(input.mode);
  const preference: GeneratorPreference = input.generatorPreference ??
    (input.preferPythonFactory ? "python" : "auto");
  const pythonWorkerEnabled = input.pythonWorkerEnabled === true;

  const pickGenerator = (
    kind: GenerationPlanKind,
    aiContribution: number,
    skipAiFill: boolean,
  ): PaperGenerator =>
    resolvePaperGenerator({
      kind,
      requested,
      aiContribution,
      skipAiFill,
      preference,
      pythonWorkerEnabled,
    });

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
    const aiContribution = requested - Math.min(available, requested);
    return {
      kind: "ai_assisted",
      requested,
      available,
      bankContribution: Math.min(available, requested),
      aiContribution,
      skipAiFill: false,
      generator: pickGenerator("ai_assisted", aiContribution, false),
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
      : "CONTENT_INSUFFICIENT",
    paperClass,
  };
}

/** Client-facing payload for a blocked plan. Never leaks internal state. */
export function blockedPlanPayload(plan: GenerationPlan): {
  error: string;
  code: "CONTENT_INSUFFICIENT" | "QUESTION_INVENTORY_INSUFFICIENT" | "CAPABILITY_REQUIRED";
  available: number;
  requested: number;
  required: number;
  maxCustomSetSize: number;
  aiFillAvailable: boolean;
} {
  const raw = plan.reasonCode ?? "CONTENT_INSUFFICIENT";
  // Inventory shortfalls surface as CONTENT_INSUFFICIENT; keep legacy alias for clients.
  const code = raw === "QUESTION_INVENTORY_INSUFFICIENT" ? "CONTENT_INSUFFICIENT" : raw;
  const error = code === "CAPABILITY_REQUIRED"
    ? `Only ${plan.available} approved questions are available for this configuration. ` +
      `Generating the remaining ${plan.requested - plan.available} requires a supported plan.`
    : `Not enough approved questions for this configuration ` +
      `(available ${plan.available}, requested ${plan.requested}). ` +
      `Try a smaller custom practice set (up to ${plan.maxCustomSetSize}).`;

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
