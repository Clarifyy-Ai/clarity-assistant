/**
 * Authoritative question quality score (gov_question_quality_v2).
 * Mirrors shared/algorithm-catalog.json. Does not use generator self-score.
 */

import {
  QUALITY_ALGORITHM_VERSION,
  QUALITY_EXPLANATION_MISSING,
  QUALITY_SIM_SOFT_FLOOR,
  QUALITY_SIM_SOFT_PENALTY,
  QUALITY_SOURCE_DEFAULT,
  QUALITY_SOURCE_PASS,
  QUALITY_STEM,
  QUALITY_WEIGHTS,
  MIN_BANK_QUESTION_QUALITY,
  DEDUP_POLICY,
} from "./algorithmCatalog.ts";
import {
  conflictsWithSelected,
  questionFingerprint,
  similarityBreakdown,
  validateSingleCorrectMcq,
} from "./govMcqValidator.ts";

export { MIN_BANK_QUESTION_QUALITY, QUALITY_ALGORITHM_VERSION };

export type QualityComponent = {
  id: string;
  weight: number;
  score: number;
  passed: boolean;
  detail?: string;
};

export type QualityScoreResult = {
  score: number;
  components: QualityComponent[];
  hardFail: boolean;
  hardFailCodes: string[];
  algorithm_version: string;
};

export type BankMcqInput = {
  question_text: string;
  options: string[];
  correct_index: number;
  explanation?: string | null;
  peers?: string[];
  nearDupThreshold?: number;
  sourceConfidence?: number;
};

function clamp01(n: number): number {
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.min(1, n));
}

function verifyUniqueAnswer(options: string[], correctIndex: number): boolean {
  if (!Number.isInteger(correctIndex) || correctIndex < 0 || correctIndex >= options.length) {
    return false;
  }
  const normalized = options.map((o) => String(o ?? "").trim().toLowerCase()).filter(Boolean);
  return new Set(normalized).size === normalized.length && normalized.length === options.length;
}

export function scoreQuestionQuality(input: BankMcqInput): QualityScoreResult {
  const components: QualityComponent[] = [];
  const hardFailCodes: string[] = [];

  const mcq = validateSingleCorrectMcq(input);
  components.push({
    id: "mcq_structure",
    weight: QUALITY_WEIGHTS.mcq_structure,
    score: mcq.ok ? 1 : 0,
    passed: mcq.ok,
    detail: mcq.ok ? undefined : mcq.message,
  });
  if (!mcq.ok) hardFailCodes.push(mcq.code);

  const uniq = verifyUniqueAnswer(input.options, input.correct_index);
  components.push({
    id: "answer_uniqueness",
    weight: QUALITY_WEIGHTS.answer_uniqueness,
    score: uniq ? 1 : 0,
    passed: uniq,
    detail: uniq ? undefined : "Options are not uniquely distinguishable.",
  });
  if (!uniq) hardFailCodes.push("ANSWER_VERIFICATION_FAILED");

  const peers = input.peers ?? [];
  const thresh = input.nearDupThreshold ?? DEDUP_POLICY.stem_only_conflict;
  let simScore = 1;
  let simPassed = true;
  let simDetail: string | undefined;
  if (peers.length) {
    if (conflictsWithSelected(input.question_text, peers, thresh)) {
      simScore = 0;
      simPassed = false;
      simDetail = "Near-duplicate of another question in the paper.";
      hardFailCodes.push("NEAR_DUPLICATE");
    } else {
      let maxPeer = 0;
      for (const p of peers) {
        maxPeer = Math.max(maxPeer, similarityBreakdown(input.question_text, p).score);
      }
      simScore = clamp01(1 - Math.max(0, maxPeer - QUALITY_SIM_SOFT_FLOOR) * QUALITY_SIM_SOFT_PENALTY);
    }
  }
  components.push({
    id: "similarity",
    weight: QUALITY_WEIGHTS.similarity,
    score: simScore,
    passed: simPassed,
    detail: simDetail,
  });

  const stemLen = (input.question_text ?? "").trim().length;
  const lengthScore =
    stemLen < QUALITY_STEM.too_short
      ? QUALITY_STEM.score_too_short
      : stemLen < QUALITY_STEM.short
        ? QUALITY_STEM.score_short
        : stemLen > QUALITY_STEM.too_long
          ? QUALITY_STEM.score_too_long
          : QUALITY_STEM.score_ok;
  components.push({
    id: "stem_length",
    weight: QUALITY_WEIGHTS.stem_length,
    score: lengthScore,
    passed: stemLen >= QUALITY_STEM.too_short,
  });
  if (stemLen < QUALITY_STEM.too_short) hardFailCodes.push("QUESTION_VALIDATION_FAILED");

  const expl = Boolean(String(input.explanation ?? "").trim());
  components.push({
    id: "explanation_present",
    weight: QUALITY_WEIGHTS.explanation_present,
    score: expl ? 1 : QUALITY_EXPLANATION_MISSING,
    passed: true,
  });

  const src = clamp01(input.sourceConfidence ?? QUALITY_SOURCE_DEFAULT);
  components.push({
    id: "source_confidence",
    weight: QUALITY_WEIGHTS.source_confidence,
    score: src,
    passed: src >= QUALITY_SOURCE_PASS,
  });

  const fp = questionFingerprint(input.question_text, input.options);
  components.push({
    id: "fingerprint",
    weight: QUALITY_WEIGHTS.fingerprint,
    score: fp.length > 4 ? 1 : 0,
    passed: fp.length > 4,
  });

  const weightSum = components.reduce((a, c) => a + c.weight, 0) || 1;
  const weighted =
    components.reduce((a, c) => a + c.score * c.weight, 0) / weightSum;
  const hardFail = hardFailCodes.length > 0;
  const score = hardFail ? 0 : Math.round(weighted * 1000) / 10;

  return {
    score,
    components,
    hardFail,
    hardFailCodes: [...new Set(hardFailCodes)],
    algorithm_version: QUALITY_ALGORITHM_VERSION,
  };
}

export function scorePaperQuality(questions: BankMcqInput[]): {
  score: number;
  perQuestion: QualityScoreResult[];
  hardFailCount: number;
  algorithm_version: string;
} {
  const perQuestion = questions.map((q) => scoreQuestionQuality(q));
  const hardFailCount = perQuestion.filter((r) => r.hardFail).length;
  const score =
    perQuestion.length === 0
      ? 0
      : Math.round(
        (perQuestion.reduce((a, r) => a + r.score, 0) / perQuestion.length) * 10,
      ) / 10;
  return { score, perQuestion, hardFailCount, algorithm_version: QUALITY_ALGORITHM_VERSION };
}
