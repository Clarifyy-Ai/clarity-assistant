/**
 * Independent composite quality score — never trusts generator self-score.
 */

import {
  validateSingleCorrectMcq,
  type McqCandidate,
} from "@/lib/gov-exam/mcqValidator";
import {
  conflictsWithSelected,
  questionFingerprint,
  similarityBreakdown,
} from "@/lib/gov-exam/validators/similarity";
import {
  hasDivByZeroParams,
  verifyUniqueMcqAnswer,
  type QuantArithmeticTemplate,
  validateQuantTemplate,
} from "@/lib/gov-exam/validators/quantValidator";
import {
  validateLinearSeatingUniqueness,
  validateSyllogismUniqueness,
  type LinearSeatingPuzzle,
  type SyllogismProblem,
} from "@/lib/gov-exam/validators/reasoningValidator";

export type QualityComponent = {
  id: string;
  weight: number;
  score: number; // 0–1
  passed: boolean;
  detail?: string;
};

export type QualityScoreResult = {
  /** Weighted average 0–100. */
  score: number;
  components: QualityComponent[];
  hardFail: boolean;
  hardFailCodes: string[];
};

export type QualityScoreInput = {
  mcq: McqCandidate;
  /** Other stems already in the paper (for intra-paper similarity). */
  peers?: string[];
  nearDupThreshold?: number;
  quantTemplate?: QuantArithmeticTemplate | null;
  syllogism?: SyllogismProblem | null;
  seating?: LinearSeatingPuzzle | null;
  /** Optional provenance confidence 0–1 from bank metadata (not generator). */
  sourceConfidence?: number;
  hasExplanation?: boolean;
};

function clamp01(n: number): number {
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.min(1, n));
}

/**
 * Score a single question from independent validators / heuristics.
 * Components are weighted; any hard-fail zeroes the published score.
 */
export function scoreQuestionQuality(input: QualityScoreInput): QualityScoreResult {
  const components: QualityComponent[] = [];
  const hardFailCodes: string[] = [];

  const mcq = validateSingleCorrectMcq(input.mcq);
  components.push({
    id: "mcq_structure",
    weight: 0.25,
    score: mcq.ok ? 1 : 0,
    passed: mcq.ok,
    detail: mcq.ok === false ? mcq.message : undefined,
  });
  if (mcq.ok === false) hardFailCodes.push(mcq.code);

  const uniq = verifyUniqueMcqAnswer({
    options: input.mcq.options,
    correct_index: input.mcq.correct_index,
  });
  components.push({
    id: "answer_uniqueness",
    weight: 0.2,
    score: uniq.ok ? 1 : 0,
    passed: uniq.ok,
    detail: uniq.ok === false ? uniq.message : undefined,
  });
  if (uniq.ok === false) hardFailCodes.push(uniq.code);

  // Intra-paper similarity: 1 if no peer conflict
  const peers = input.peers ?? [];
  const thresh = input.nearDupThreshold ?? 0.88;
  let simScore = 1;
  let simPassed = true;
  let simDetail: string | undefined;
  if (peers.length) {
    if (conflictsWithSelected(input.mcq.question_text, peers, thresh)) {
      simScore = 0;
      simPassed = false;
      simDetail = "Near-duplicate of another question in the paper.";
      hardFailCodes.push("NEAR_DUPLICATE");
    } else {
      // Soft penalty from max peer similarity below threshold
      let maxPeer = 0;
      for (const p of peers) {
        maxPeer = Math.max(maxPeer, similarityBreakdown(input.mcq.question_text, p).score);
      }
      simScore = clamp01(1 - Math.max(0, maxPeer - 0.5) * 0.5);
    }
  }
  components.push({
    id: "similarity",
    weight: 0.2,
    score: simScore,
    passed: simPassed,
    detail: simDetail,
  });

  // Stem length / readability heuristic (independent of generator)
  const stemLen = (input.mcq.question_text ?? "").trim().length;
  const lengthScore =
    stemLen < 8 ? 0 : stemLen < 20 ? 0.5 : stemLen > 1200 ? 0.6 : 1;
  components.push({
    id: "stem_length",
    weight: 0.1,
    score: lengthScore,
    passed: stemLen >= 8,
    detail: stemLen < 8 ? "Stem too short." : undefined,
  });
  if (stemLen < 8) hardFailCodes.push("QUESTION_VALIDATION_FAILED");

  const expl = Boolean(input.hasExplanation ?? input.mcq.explanation?.trim());
  components.push({
    id: "explanation_present",
    weight: 0.05,
    score: expl ? 1 : 0.4,
    passed: true,
  });

  const src = clamp01(input.sourceConfidence ?? 0.7);
  components.push({
    id: "source_confidence",
    weight: 0.1,
    score: src,
    passed: src >= 0.4,
    detail: src < 0.4 ? "Low source confidence." : undefined,
  });

  // Optional subject validators
  if (input.quantTemplate) {
    const q = validateQuantTemplate(input.quantTemplate);
    components.push({
      id: "quant_template",
      weight: 0.1,
      score: q.ok ? 1 : 0,
      passed: q.ok,
      detail: q.ok === false ? q.message : undefined,
    });
    if (q.ok === false) hardFailCodes.push(q.code);
  } else if (input.mcq.question_text && /divid|\/|ratio/i.test(input.mcq.question_text)) {
    // Soft: no params available — don't hard-fail
    components.push({
      id: "quant_template",
      weight: 0.05,
      score: hasDivByZeroParams({}) ? 0 : 0.85,
      passed: true,
    });
  }

  if (input.syllogism) {
    const s = validateSyllogismUniqueness(input.syllogism);
    components.push({
      id: "reasoning_syllogism",
      weight: 0.1,
      score: s.ok ? 1 : 0,
      passed: s.ok,
      detail: s.ok === false ? s.message : undefined,
    });
    if (s.ok === false) hardFailCodes.push(s.code);
  }

  if (input.seating) {
    const s = validateLinearSeatingUniqueness(input.seating);
    components.push({
      id: "reasoning_seating",
      weight: 0.1,
      score: s.ok ? 1 : 0,
      passed: s.ok,
      detail: s.ok === false ? s.message : undefined,
    });
    if (s.ok === false) hardFailCodes.push(s.code);
  }

  // Fingerprint stability (always defined for MCQ)
  const fp = questionFingerprint(input.mcq.question_text, input.mcq.options);
  components.push({
    id: "fingerprint",
    weight: 0.05,
    score: fp.length > 4 ? 1 : 0,
    passed: fp.length > 4,
  });

  const weightSum = components.reduce((a, c) => a + c.weight, 0) || 1;
  const weighted =
    components.reduce((a, c) => a + c.score * c.weight, 0) / weightSum;
  const hardFail = hardFailCodes.length > 0;
  const score = hardFail ? 0 : Math.round(weighted * 1000) / 10; // 0–100 one decimal

  return { score, components, hardFail, hardFailCodes: [...new Set(hardFailCodes)] };
}

/** Mean of per-question scores; hard-failed questions count as 0. */
export function scorePaperQuality(
  questions: QualityScoreInput[],
): { score: number; perQuestion: QualityScoreResult[]; hardFailCount: number } {
  const perQuestion = questions.map((q) => scoreQuestionQuality(q));
  const hardFailCount = perQuestion.filter((r) => r.hardFail).length;
  const score =
    perQuestion.length === 0
      ? 0
      : Math.round(
          (perQuestion.reduce((a, r) => a + r.score, 0) / perQuestion.length) * 10,
        ) / 10;
  return { score, perQuestion, hardFailCount };
}

/** Minimum quality to accept a bank item into a paper during assembly. */
export const MIN_BANK_QUESTION_QUALITY = 40;
