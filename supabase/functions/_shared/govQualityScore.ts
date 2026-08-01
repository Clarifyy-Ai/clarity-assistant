/**
 * Independent quality score for bank assembly (mirrors src validators/qualityScore).
 * Does not use generator self-score.
 */

import {
  conflictsWithSelected,
  questionFingerprint,
  similarityBreakdown,
  validateSingleCorrectMcq,
} from "./govMcqValidator.ts";

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

export const MIN_BANK_QUESTION_QUALITY = 40;

export function scoreQuestionQuality(input: BankMcqInput): QualityScoreResult {
  const components: QualityComponent[] = [];
  const hardFailCodes: string[] = [];

  const mcq = validateSingleCorrectMcq(input);
  components.push({
    id: "mcq_structure",
    weight: 0.3,
    score: mcq.ok ? 1 : 0,
    passed: mcq.ok,
    detail: mcq.ok ? undefined : mcq.message,
  });
  if (!mcq.ok) hardFailCodes.push(mcq.code);

  const peers = input.peers ?? [];
  const thresh = input.nearDupThreshold ?? 0.88;
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
      simScore = clamp01(1 - Math.max(0, maxPeer - 0.5) * 0.5);
    }
  }
  components.push({
    id: "similarity",
    weight: 0.25,
    score: simScore,
    passed: simPassed,
    detail: simDetail,
  });

  const stemLen = (input.question_text ?? "").trim().length;
  const lengthScore =
    stemLen < 8 ? 0 : stemLen < 20 ? 0.5 : stemLen > 1200 ? 0.6 : 1;
  components.push({
    id: "stem_length",
    weight: 0.15,
    score: lengthScore,
    passed: stemLen >= 8,
  });
  if (stemLen < 8) hardFailCodes.push("QUESTION_VALIDATION_FAILED");

  const expl = Boolean(String(input.explanation ?? "").trim());
  components.push({
    id: "explanation_present",
    weight: 0.1,
    score: expl ? 1 : 0.4,
    passed: true,
  });

  const src = clamp01(input.sourceConfidence ?? 0.75);
  components.push({
    id: "source_confidence",
    weight: 0.1,
    score: src,
    passed: src >= 0.4,
  });

  const fp = questionFingerprint(input.question_text, input.options);
  components.push({
    id: "fingerprint",
    weight: 0.1,
    score: fp.length > 4 ? 1 : 0,
    passed: fp.length > 4,
  });

  const weightSum = components.reduce((a, c) => a + c.weight, 0) || 1;
  const weighted =
    components.reduce((a, c) => a + c.score * c.weight, 0) / weightSum;
  const hardFail = hardFailCodes.length > 0;
  const score = hardFail ? 0 : Math.round(weighted * 1000) / 10;

  return { score, components, hardFail, hardFailCodes: [...new Set(hardFailCodes)] };
}

export function scorePaperQuality(questions: BankMcqInput[]): {
  score: number;
  perQuestion: QualityScoreResult[];
  hardFailCount: number;
} {
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
