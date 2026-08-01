/**
 * Multi-agent validation scaffolding for gov exam questions.
 *
 * Pilot: deterministic solver / critic / pattern / similarity / language.
 * LLM generator is behind a flag OFF by default — create-exam-paper stays bank-first.
 */

import {
  validateSingleCorrectMcq,
  type McqCandidate,
} from "@/lib/gov-exam/mcqValidator";
import {
  findNearDuplicatesInSet,
  isNearDuplicate,
  questionFingerprint,
  similarityBreakdown,
} from "@/lib/gov-exam/validators/similarity";
import {
  evalSimpleArithmetic,
  validateQuantTemplate,
  type QuantArithmeticTemplate,
} from "@/lib/gov-exam/validators/quantValidator";
import {
  validateLinearSeatingUniqueness,
  validateSyllogismUniqueness,
  type LinearSeatingPuzzle,
  type SyllogismProblem,
} from "@/lib/gov-exam/validators/reasoningValidator";
import {
  scoreQuestionQuality,
  type QualityScoreResult,
} from "@/lib/gov-exam/validators/qualityScore";
import {
  detectPatternShift,
  type PatternSnapshot,
} from "@/lib/gov-exam/patternShift";

/** Feature flag — never silently enable LLM fill for full papers. */
export const ENABLE_LLM_GENERATOR = false;

export type AgentRole =
  | "generator"
  | "solver"
  | "critic"
  | "source_verifier"
  | "pattern_validator"
  | "similarity"
  | "language";

export type AgentVerdict = "pass" | "fail" | "skip" | "disagree";

export type AgentReport = {
  role: AgentRole;
  verdict: AgentVerdict;
  confidence: number; // 0–1
  codes: string[];
  notes: string[];
  /** Role-specific payload for review queue. */
  details?: Record<string, unknown>;
};

export type AgentDisagreement = {
  roles: AgentRole[];
  topic: string;
  summary: string;
  reports: AgentReport[];
};

export type MultiAgentInput = {
  mcq: McqCandidate;
  peers?: string[];
  quantTemplate?: QuantArithmeticTemplate | null;
  syllogism?: SyllogismProblem | null;
  seating?: LinearSeatingPuzzle | null;
  sourceConfidence?: number;
  sourceClass?: "bank" | "generated" | "previous_year";
  patternPrevious?: PatternSnapshot | null;
  patternCurrent?: PatternSnapshot | null;
  language?: string;
  /** Claimed correct answer from generator (if any) — compared by solver/critic. */
  generatorClaimedIndex?: number | null;
};

export type MultiAgentResult = {
  reports: AgentReport[];
  disagreements: AgentDisagreement[];
  quality: QualityScoreResult;
  /** True when no hard fails and no unresolved disagreements. */
  publishable: boolean;
  llmGeneratorUsed: boolean;
};

function solverAgent(input: MultiAgentInput): AgentReport {
  const codes: string[] = [];
  const notes: string[] = [];
  let confidence = 0.7;
  let verdict: AgentVerdict = "pass";

  if (input.quantTemplate) {
    const r = validateQuantTemplate(input.quantTemplate);
    if (r.ok === false) {
      verdict = "fail";
      codes.push(r.code);
      notes.push(r.message);
      confidence = 0.95;
    } else if (input.quantTemplate.expression) {
      const v = evalSimpleArithmetic(
        input.quantTemplate.expression,
        input.quantTemplate.params,
      );
      notes.push(`Computed arithmetic result: ${v}`);
      confidence = 0.9;
    }
  } else if (input.syllogism) {
    const r = validateSyllogismUniqueness(input.syllogism);
    if (r.ok === false) {
      verdict = "fail";
      codes.push(r.code);
      notes.push(r.message);
      confidence = 0.85;
    } else {
      notes.push("Syllogism structure uniqueness stub passed.");
    }
  } else if (input.seating) {
    const r = validateLinearSeatingUniqueness(input.seating);
    if (r.ok === false) {
      verdict = "fail";
      codes.push(r.code);
      notes.push(r.message);
      confidence = 0.95;
    } else {
      notes.push("Unique seating solution.");
      confidence = 0.95;
    }
  } else {
    // Generic MCQ: solver verifies index range only (no semantic solve)
    const mcq = validateSingleCorrectMcq(input.mcq);
    if (mcq.ok === false) {
      verdict = "fail";
      codes.push(mcq.code);
      notes.push(mcq.message);
    } else {
      notes.push("No subject solver attached; structure check only.");
      confidence = 0.55;
    }
  }

  return { role: "solver", verdict, confidence, codes, notes };
}

function criticAgent(input: MultiAgentInput, solver: AgentReport): AgentReport {
  const codes: string[] = [];
  const notes: string[] = [];
  let verdict: AgentVerdict = "pass";
  let confidence = 0.7;

  const mcq = validateSingleCorrectMcq(input.mcq);
  if (mcq.ok === false) {
    return {
      role: "critic",
      verdict: "fail",
      confidence: 0.95,
      codes: [mcq.code],
      notes: [mcq.message],
    };
  }

  if (
    input.generatorClaimedIndex != null &&
    input.generatorClaimedIndex !== input.mcq.correct_index
  ) {
    verdict = "disagree";
    codes.push("GENERATOR_SOLVER_INDEX_MISMATCH");
    notes.push(
      `Generator claimed ${input.generatorClaimedIndex}, bank/solver index ${input.mcq.correct_index}.`,
    );
    confidence = 0.9;
  }

  if (solver.verdict === "fail") {
    if (verdict === "pass") {
      notes.push("Critic agrees with solver failure.");
      verdict = "fail";
      codes.push(...solver.codes);
    }
    confidence = Math.max(confidence, solver.confidence);
  }

  // Option length balance heuristic
  const lens = input.mcq.options.map((o) => o.trim().length);
  const max = Math.max(...lens);
  const min = Math.min(...lens);
  if (max > 0 && min / max < 0.15 && max > 40) {
    notes.push("Option length imbalance — possible giveaway.");
    codes.push("CRITIC_OPTION_IMBALANCE");
    confidence = Math.min(confidence, 0.6);
  }

  return { role: "critic", verdict, confidence, codes, notes };
}

function sourceVerifierAgent(input: MultiAgentInput): AgentReport {
  const src = input.sourceClass ?? "bank";
  const conf = input.sourceConfidence ?? (src === "bank" ? 0.8 : 0.4);
  if (src === "generated" && conf < 0.6) {
    return {
      role: "source_verifier",
      verdict: "fail",
      confidence: 0.8,
      codes: ["SOURCE_LOW_CONFIDENCE"],
      notes: ["Generated item below source confidence gate."],
      details: { sourceClass: src, sourceConfidence: conf },
    };
  }
  return {
    role: "source_verifier",
    verdict: "pass",
    confidence: conf,
    codes: [],
    notes: [`Source class ${src}.`],
    details: { sourceClass: src, sourceConfidence: conf },
  };
}

function patternValidatorAgent(input: MultiAgentInput): AgentReport {
  if (!input.patternPrevious || !input.patternCurrent) {
    return {
      role: "pattern_validator",
      verdict: "skip",
      confidence: 0.5,
      codes: [],
      notes: ["No pattern snapshots provided."],
    };
  }
  const shift = detectPatternShift(input.patternPrevious, input.patternCurrent);
  return {
    role: "pattern_validator",
    verdict: "pass",
    confidence: 0.85,
    codes: shift.material ? ["PATTERN_SHIFT"] : [],
    notes: shift.material
      ? [`Material pattern shift: ${shift.changes.join(", ")}`]
      : ["Pattern aligned with previous snapshot."],
    details: { ...shift },
  };
}

function similarityAgent(input: MultiAgentInput): AgentReport {
  const peers = input.peers ?? [];
  for (const p of peers) {
    if (isNearDuplicate(input.mcq.question_text, p)) {
      const d = similarityBreakdown(input.mcq.question_text, p);
      return {
        role: "similarity",
        verdict: "fail",
        confidence: 0.95,
        codes: ["NEAR_DUPLICATE"],
        notes: [`Near-duplicate score ${d.score.toFixed(3)}`],
        details: d,
      };
    }
  }
  return {
    role: "similarity",
    verdict: "pass",
    confidence: 0.85,
    codes: [],
    notes: [
      peers.length ? "No near-duplicates vs peers." : "No peers to compare.",
    ],
  };
}

function languageAgent(input: MultiAgentInput): AgentReport {
  const lang = (input.language ?? "en").toLowerCase();
  const text = input.mcq.question_text ?? "";
  const codes: string[] = [];
  const notes: string[] = [];
  let verdict: AgentVerdict = "pass";

  if (text.trim().length < 8) {
    verdict = "fail";
    codes.push("LANGUAGE_TOO_SHORT");
    notes.push("Stem too short.");
  }
  // Very light script check for hi vs en (pilot)
  const hasDevanagari = /[\u0900-\u097F]/.test(text);
  if (lang === "en" && hasDevanagari) {
    codes.push("LANGUAGE_SCRIPT_MISMATCH");
    notes.push("Devanagari characters in en-tagged question.");
    verdict = "disagree";
  }
  if (lang === "hi" && !hasDevanagari && /[a-zA-Z]{20,}/.test(text)) {
    codes.push("LANGUAGE_SCRIPT_MISMATCH");
    notes.push("Mostly Latin script for hi-tagged question.");
    verdict = "disagree";
  }

  return {
    role: "language",
    verdict,
    confidence: verdict === "pass" ? 0.7 : 0.8,
    codes,
    notes,
  };
}

/**
 * Optional LLM generator role — stubbed OFF. Never invents paper content here.
 */
function generatorAgent(_input: MultiAgentInput): AgentReport {
  if (!ENABLE_LLM_GENERATOR) {
    return {
      role: "generator",
      verdict: "skip",
      confidence: 1,
      codes: ["LLM_GENERATOR_DISABLED"],
      notes: [
        "LLM generator flag OFF — bank-first assembly only. No silent fill.",
      ],
    };
  }
  return {
    role: "generator",
    verdict: "skip",
    confidence: 0,
    codes: ["LLM_GENERATOR_NOT_IMPLEMENTED"],
    notes: ["Flag on but generator not implemented for pilot."],
  };
}

function collectDisagreements(reports: AgentReport[]): AgentDisagreement[] {
  const disagreements: AgentDisagreement[] = [];

  const byRole = Object.fromEntries(reports.map((r) => [r.role, r])) as Record<
    AgentRole,
    AgentReport
  >;

  const solver = byRole.solver;
  const critic = byRole.critic;
  if (
    solver &&
    critic &&
    ((solver.verdict === "fail" && critic.verdict === "pass") ||
      critic.verdict === "disagree" ||
      (solver.verdict === "pass" && critic.verdict === "fail"))
  ) {
    disagreements.push({
      roles: ["solver", "critic"],
      topic: "answer_correctness",
      summary: "Solver and critic disagree on correctness.",
      reports: [solver, critic],
    });
  }

  const language = byRole.language;
  if (language?.verdict === "disagree") {
    disagreements.push({
      roles: ["language"],
      topic: "language_script",
      summary: language.notes.join(" ") || "Language agent disagreement.",
      reports: [language],
    });
  }

  const gen = byRole.generator;
  if (gen && gen.verdict !== "skip" && solver && gen.verdict !== solver.verdict) {
    disagreements.push({
      roles: ["generator", "solver"],
      topic: "generation_vs_solve",
      summary: "Generator and solver disagree.",
      reports: [gen, solver],
    });
  }

  return disagreements;
}

/**
 * Run the multi-agent validation pipeline (deterministic pilot).
 */
export function runMultiAgentValidation(input: MultiAgentInput): MultiAgentResult {
  const generator = generatorAgent(input);
  const solver = solverAgent(input);
  const critic = criticAgent(input, solver);
  const source = sourceVerifierAgent(input);
  const pattern = patternValidatorAgent(input);
  const similarity = similarityAgent(input);
  const language = languageAgent(input);

  const reports = [generator, solver, critic, source, pattern, similarity, language];
  const disagreements = collectDisagreements(reports);
  const quality = scoreQuestionQuality({
    mcq: input.mcq,
    peers: input.peers,
    quantTemplate: input.quantTemplate,
    syllogism: input.syllogism,
    seating: input.seating,
    sourceConfidence: input.sourceConfidence,
    hasExplanation: Boolean(input.mcq.explanation?.trim()),
  });

  const hardFail =
    quality.hardFail ||
    reports.some((r) => r.verdict === "fail") ||
    disagreements.length > 0;

  return {
    reports,
    disagreements,
    quality,
    publishable: !hardFail,
    llmGeneratorUsed: ENABLE_LLM_GENERATOR && generator.verdict !== "skip",
  };
}

/** Paper-level similarity pass after selection. */
export function validatePaperSimilarity(
  stems: string[],
  threshold = 0.88,
): { ok: boolean; pairs: ReturnType<typeof findNearDuplicatesInSet> } {
  const pairs = findNearDuplicatesInSet(stems, threshold);
  return { ok: pairs.length === 0, pairs };
}

/** Structure for durable review queue rows (caller persists). */
export type ReviewQueueItem = {
  questionFingerprint: string;
  disagreements: AgentDisagreement[];
  reports: AgentReport[];
  qualityScore: number;
  createdAt: string;
};

export function toReviewQueueItem(
  input: MultiAgentInput,
  result: MultiAgentResult,
): ReviewQueueItem | null {
  if (result.disagreements.length === 0 && result.publishable) return null;
  return {
    questionFingerprint: questionFingerprint(
      input.mcq.question_text,
      input.mcq.options,
    ),
    disagreements: result.disagreements,
    reports: result.reports,
    qualityScore: result.quality.score,
    createdAt: new Date().toISOString(),
  };
}
