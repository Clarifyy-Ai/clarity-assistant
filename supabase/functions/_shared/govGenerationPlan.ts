/**
 * Server-authoritative decision for HOW a government exam paper gets built.
 *
 * Aligns with MATRIX `gov_exam_assemble` (operationRouter): durable jobs are
 * hybrid-by-plan here — NOT request-scoped `executeHybridOperation`. Callers
 * should gate `canUseAi` / `pythonWorkerEnabled` via `decideRoute('gov_exam_assemble')`.
 *
 * Priority when inventory is short (mock modes only):
 *   1. approved bank
 *   2. Python deterministic practice fill (no AI required)
 *   3. optional AI gap-fill when capability allows
 *
 * Official previous-year mode NEVER fabricates questions.
 */

import {
  parseGeneratorPreference,
  resolvePaperGenerator,
  type GeneratorPreference,
} from "./govGeneratorRouting.ts";

export type GenerationPlanKind =
  | "bank_only"
  | "ai_assisted"
  | "hybrid_deterministic"
  | "blocked";
export type PaperGenerator = "edge_assembler" | "python_paper_factory";

export type { GeneratorPreference };
export { parseGeneratorPreference, resolvePaperGenerator };

/** Modes where fresh AI / deterministic practice questions are acceptable. */
const AI_ELIGIBLE_MODES = new Set(["generated_mock", "custom_mock", "adaptive"]);
const FILL_ELIGIBLE_MODES = AI_ELIGIBLE_MODES;

export interface GenerationPlan {
  kind: GenerationPlanKind;
  requested: number;
  available: number;
  bankContribution: number;
  aiContribution: number;
  /** Deterministic Python practice slots (never labeled official). */
  deterministicContribution: number;
  /** Written into `request_json` so the assembler knows whether it may call AI. */
  skipAiFill: boolean;
  /** Explicit permission for Python template fill. */
  allowDeterministicFill: boolean;
  generator: PaperGenerator;
  /** Largest bank-only practice set we can honestly offer as a fallback. */
  maxCustomSetSize: number;
  reasonCode?:
    | "QUESTION_INVENTORY_INSUFFICIENT"
    | "CONTENT_INSUFFICIENT"
    | "CAPABILITY_REQUIRED"
    | "PLAN_NOT_ALLOWED";
  paperClass:
    | "official_previous"
    | "ai_generated"
    | "custom_practice"
    | "realistic_mock";
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
  /** Supabase secret PAPER_FACTORY_WORKER=1 or GOV_EXAM_PYTHON_URL configured. */
  pythonWorkerEnabled?: boolean;
}): GenerationPlan {
  const requested = Math.max(0, Math.floor(input.requested));
  const available = Math.max(0, Math.floor(input.available));
  const fillEligible = FILL_ELIGIBLE_MODES.has(input.mode);
  const aiEligibleMode = AI_ELIGIBLE_MODES.has(input.mode);
  const preference: GeneratorPreference = input.generatorPreference ??
    (input.preferPythonFactory ? "python" : "auto");
  const pythonWorkerEnabled = input.pythonWorkerEnabled === true;

  const pickGenerator = (
    kind: GenerationPlanKind,
    aiContribution: number,
    skipAiFill: boolean,
    deterministicContribution: number,
  ): PaperGenerator =>
    resolvePaperGenerator({
      kind,
      requested,
      aiContribution,
      skipAiFill,
      preference,
      pythonWorkerEnabled,
      deterministicContribution,
    });

  const paperClassForMode = (): GenerationPlan["paperClass"] => {
    if (input.mode === "official_previous") return "official_previous";
    if (input.mode === "custom_mock" || input.mode === "adaptive") {
      return "custom_practice";
    }
    return "realistic_mock";
  };

  // The bank alone satisfies the request.
  if (requested > 0 && available >= requested) {
    return {
      kind: "bank_only",
      requested,
      available,
      bankContribution: requested,
      aiContribution: 0,
      deterministicContribution: 0,
      skipAiFill: true,
      allowDeterministicFill: false,
      generator: "edge_assembler",
      maxCustomSetSize: available,
      paperClass: input.mode === "official_previous"
        ? "official_previous"
        : paperClassForMode(),
    };
  }

  const shortfall = Math.max(0, requested - Math.min(available, requested));
  const bankContribution = Math.min(available, requested);

  // Hybrid: bank + deterministic Python (AI optional). No Pro required for mock modes.
  if (requested > 0 && fillEligible && pythonWorkerEnabled && shortfall > 0) {
    const useAi = aiEligibleMode && input.canUseAi;
    const aiContribution = useAi ? shortfall : 0;
    const deterministicContribution = useAi ? 0 : shortfall;
    // Prefer AI when available; otherwise deterministic fills 100% of shortfall.
    // When AI is available we still allow deterministic as fallback inside the worker
    // (allowDeterministicFill=true) without a second credit charge.
    return {
      kind: useAi ? "ai_assisted" : "hybrid_deterministic",
      requested,
      available,
      bankContribution,
      aiContribution,
      deterministicContribution: useAi ? 0 : deterministicContribution,
      skipAiFill: !useAi,
      allowDeterministicFill: true,
      generator: pickGenerator(
        useAi ? "ai_assisted" : "hybrid_deterministic",
        aiContribution,
        !useAi,
        useAi ? 0 : deterministicContribution,
      ),
      maxCustomSetSize: available,
      paperClass: useAi ? "ai_generated" : "realistic_mock",
    };
  }

  // Shortfall, AI capability, but Python worker not configured — Edge AI path.
  if (requested > 0 && aiEligibleMode && input.canUseAi) {
    const aiContribution = shortfall;
    return {
      kind: "ai_assisted",
      requested,
      available,
      bankContribution,
      aiContribution,
      deterministicContribution: 0,
      skipAiFill: false,
      allowDeterministicFill: false,
      generator: pickGenerator("ai_assisted", aiContribution, false, 0),
      maxCustomSetSize: available,
      paperClass: "ai_generated",
    };
  }

  return {
    kind: "blocked",
    requested,
    available,
    bankContribution,
    aiContribution: 0,
    deterministicContribution: 0,
    skipAiFill: true,
    allowDeterministicFill: false,
    generator: "edge_assembler",
    maxCustomSetSize: available,
    reasonCode: fillEligible && !input.canUseAi && !pythonWorkerEnabled
      ? "PLAN_NOT_ALLOWED"
      : "CONTENT_INSUFFICIENT",
    paperClass: paperClassForMode(),
  };
}

/** Client-facing payload for a blocked plan. Never leaks internal state. */
export function blockedPlanPayload(plan: GenerationPlan): {
  error: string;
  code: "CONTENT_INSUFFICIENT" | "QUESTION_INVENTORY_INSUFFICIENT" | "CAPABILITY_REQUIRED" | "PLAN_NOT_ALLOWED";
  available: number;
  requested: number;
  required: number;
  maxCustomSetSize: number;
  aiFillAvailable: boolean;
} {
  const raw = plan.reasonCode ?? "CONTENT_INSUFFICIENT";
  const code =
    raw === "QUESTION_INVENTORY_INSUFFICIENT"
      ? "CONTENT_INSUFFICIENT"
      : raw === "CAPABILITY_REQUIRED"
        ? "PLAN_NOT_ALLOWED"
        : raw;
  const planBlocked = code === "PLAN_NOT_ALLOWED" || code === "CAPABILITY_REQUIRED";
  const error = planBlocked
    ? `Only ${plan.available} approved questions are available for this configuration. ` +
      `Generating the remaining ${plan.requested - plan.available} requires a supported plan ` +
      `or the practice generation service.`
    : `Not enough approved questions for this configuration ` +
      `(available ${plan.available}, requested ${plan.requested}). ` +
      `Try a smaller custom practice set (up to ${plan.maxCustomSetSize}), ` +
      `or switch to Realistic Mock mode when practice fill is available.`;

  return {
    error,
    code,
    available: plan.available,
    requested: plan.requested,
    required: plan.requested,
    maxCustomSetSize: plan.maxCustomSetSize,
    aiFillAvailable: planBlocked,
  };
}

/** Summary attached to successful responses so the UI can label the paper honestly. */
export function planSummary(plan: GenerationPlan): {
  kind: GenerationPlanKind;
  generator: PaperGenerator;
  bankQuestions: number;
  aiQuestions: number;
  deterministicQuestions: number;
  requested: number;
  paperClass: string;
} {
  return {
    kind: plan.kind,
    generator: plan.generator,
    bankQuestions: plan.bankContribution,
    aiQuestions: plan.aiContribution,
    deterministicQuestions: plan.deterministicContribution,
    requested: plan.requested,
    paperClass: plan.paperClass,
  };
}
