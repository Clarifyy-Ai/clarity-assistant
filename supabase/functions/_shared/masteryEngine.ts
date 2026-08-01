/**
 * Deno mirror of src/lib/gov-exam/masteryEngine.ts — keep formulas in sync.
 */

export type MasteryState =
  | "not_assessed"
  | "foundation_needed"
  | "developing"
  | "practicing"
  | "strong"
  | "exam_ready";

export type DifficultyBand = "easy" | "medium" | "hard" | "unknown";

export type MasteryConfig = {
  learningRate: number;
  clampMin: number;
  clampMax: number;
  minEvidenceForState: Record<Exclude<MasteryState, "not_assessed">, number>;
  scoreThresholds: Record<Exclude<MasteryState, "not_assessed">, number>;
  difficultyFactors: Record<DifficultyBand, number>;
};

export const DEFAULT_MASTERY_CONFIG: MasteryConfig = {
  learningRate: 0.18,
  clampMin: 0,
  clampMax: 1,
  minEvidenceForState: {
    foundation_needed: 1,
    developing: 3,
    practicing: 6,
    strong: 10,
    exam_ready: 15,
  },
  scoreThresholds: {
    foundation_needed: 0,
    developing: 0.35,
    practicing: 0.55,
    strong: 0.75,
    exam_ready: 0.88,
  },
  difficultyFactors: {
    easy: 0.75,
    medium: 1.0,
    hard: 1.25,
    unknown: 1.0,
  },
};

export const MASTERY_ALGORITHM_VERSION = "mastery_v1";

export type TopicMasteryRow = {
  topic: string;
  mastery_score: number;
  state: MasteryState;
  evidence_count: number;
};

export type AttemptSignal = {
  correct: boolean;
  attempted: boolean;
  difficulty?: DifficultyBand | string | null;
  daysAgo?: number;
  quality?: number;
};

function clamp(n: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, n));
}

export function normalizeDifficulty(raw: unknown): DifficultyBand {
  const v = String(raw ?? "").trim().toLowerCase();
  if (v === "easy" || v === "e") return "easy";
  if (v === "hard" || v === "h" || v === "difficult") return "hard";
  if (v === "medium" || v === "med" || v === "m" || v === "moderate") return "medium";
  return "unknown";
}

export function recencyFactor(daysAgo = 0): number {
  const d = Math.max(0, daysAgo);
  if (d <= 0) return 1;
  if (d <= 7) return 0.95;
  if (d <= 30) return 0.85;
  if (d <= 90) return 0.7;
  return 0.55;
}

export function performanceSignal(
  attempt: Pick<AttemptSignal, "correct" | "attempted">,
): number {
  if (!attempt.attempted) return 0;
  return attempt.correct ? 1 : -1;
}

export function resolveMasteryState(
  masteryScore: number,
  evidenceCount: number,
  config: MasteryConfig = DEFAULT_MASTERY_CONFIG,
): MasteryState {
  if (evidenceCount < config.minEvidenceForState.foundation_needed) {
    return "not_assessed";
  }
  const score = clamp(masteryScore, config.clampMin, config.clampMax);
  const order: Exclude<MasteryState, "not_assessed">[] = [
    "exam_ready",
    "strong",
    "practicing",
    "developing",
    "foundation_needed",
  ];
  for (const state of order) {
    if (
      evidenceCount >= config.minEvidenceForState[state] &&
      score >= config.scoreThresholds[state]
    ) {
      return state;
    }
  }
  return "foundation_needed";
}

export function updateMasteryScore(
  prior: number,
  signal: AttemptSignal,
  config: MasteryConfig = DEFAULT_MASTERY_CONFIG,
): number {
  const quality = clamp(signal.quality ?? 1, 0.2, 1);
  const difficulty = config.difficultyFactors[normalizeDifficulty(signal.difficulty)];
  const perf = performanceSignal(signal);
  const recency = recencyFactor(signal.daysAgo ?? 0);
  const delta = config.learningRate * quality * difficulty * perf * recency;
  return clamp(prior + delta, config.clampMin, config.clampMax);
}

export function applyAttemptToMastery(
  prior: TopicMasteryRow | null | undefined,
  signal: AttemptSignal,
  config: MasteryConfig = DEFAULT_MASTERY_CONFIG,
): TopicMasteryRow {
  const topic = prior?.topic ?? "";
  const evidenceBump = signal.attempted ? 1 : 0;
  const evidence_count = (prior?.evidence_count ?? 0) + evidenceBump;
  const priorScore =
    prior && prior.evidence_count > 0 ? prior.mastery_score : 0.45;
  const mastery_score = signal.attempted
    ? updateMasteryScore(priorScore, signal, config)
    : clamp(prior?.mastery_score ?? 0, config.clampMin, config.clampMax);
  const state = resolveMasteryState(mastery_score, evidence_count, config);
  return { topic, mastery_score, state, evidence_count };
}

export function applyBatchToMastery(
  prior: TopicMasteryRow | null | undefined,
  attempts: AttemptSignal[],
  config: MasteryConfig = DEFAULT_MASTERY_CONFIG,
): TopicMasteryRow {
  let current: TopicMasteryRow = {
    topic: prior?.topic ?? "",
    mastery_score: prior?.mastery_score ?? 0,
    state: prior?.state ?? "not_assessed",
    evidence_count: prior?.evidence_count ?? 0,
  };
  for (const attempt of attempts) {
    current = applyAttemptToMastery(current, attempt, config);
  }
  return current;
}

export function listWeakTopics(
  rows: TopicMasteryRow[],
  limit = 5,
): Array<{
  topic: string;
  mastery_score: number;
  state: MasteryState;
  evidence_count: number;
}> {
  return [...rows]
    .filter(
      (r) =>
        r.evidence_count > 0 &&
        (r.state === "foundation_needed" ||
          r.state === "developing" ||
          r.state === "practicing" ||
          r.mastery_score < 0.65),
    )
    .sort((a, b) => a.mastery_score - b.mastery_score)
    .slice(0, limit)
    .map((r) => ({
      topic: r.topic,
      mastery_score: r.mastery_score,
      state: r.state,
      evidence_count: r.evidence_count,
    }));
}

export type ReadinessBreakdown = {
  topic_count: number;
  assessed_count: number;
  mean_mastery: number | null;
  weak_count: number;
  strong_count: number;
  exam_ready_count: number;
  coverage: number;
  weak_topics: string[];
  recommended_action: string;
  algorithm_version: string;
};

export function computeExamReadiness(
  rows: TopicMasteryRow[],
  syllabusTopicCount?: number | null,
): { score: number; breakdown: ReadinessBreakdown } {
  const assessed = rows.filter((r) => r.evidence_count > 0);
  const topic_count = rows.length;
  const assessed_count = assessed.length;

  if (assessed_count === 0) {
    return {
      score: 0,
      breakdown: {
        topic_count,
        assessed_count: 0,
        mean_mastery: null,
        weak_count: 0,
        strong_count: 0,
        exam_ready_count: 0,
        coverage: 0,
        weak_topics: [],
        recommended_action:
          "Complete a practice paper to start measuring topic mastery. No readiness estimate yet.",
        algorithm_version: MASTERY_ALGORITHM_VERSION,
      },
    };
  }

  const mean_mastery =
    assessed.reduce((s, r) => s + r.mastery_score, 0) / assessed_count;
  const weak = listWeakTopics(assessed, 5);
  const strong_count = assessed.filter(
    (r) => r.state === "strong" || r.state === "exam_ready",
  ).length;
  const exam_ready_count = assessed.filter((r) => r.state === "exam_ready").length;
  const denom =
    syllabusTopicCount && syllabusTopicCount > 0
      ? syllabusTopicCount
      : Math.max(topic_count, assessed_count);
  const coverage = clamp(assessed_count / denom, 0, 1);
  const score = Math.round(100 * mean_mastery * (0.55 + 0.45 * coverage));

  let recommended_action: string;
  if (coverage < 0.35) {
    recommended_action =
      "Broaden coverage with a mixed practice set — too few topics assessed for a stable readiness signal.";
  } else if (weak.length > 0) {
    recommended_action = `Focus next on ${weak
      .slice(0, 2)
      .map((w) => w.topic)
      .join(" and ")} — lowest mastery among assessed topics.`;
  } else if (mean_mastery >= 0.8) {
    recommended_action =
      "Run a full-pattern simulation to stress-test timing under exam conditions.";
  } else {
    recommended_action =
      "Keep practicing medium-difficulty mixed sets to push developing topics toward strong.";
  }

  return {
    score,
    breakdown: {
      topic_count,
      assessed_count,
      mean_mastery: Math.round(mean_mastery * 1000) / 1000,
      weak_count: weak.length,
      strong_count,
      exam_ready_count,
      coverage: Math.round(coverage * 1000) / 1000,
      weak_topics: weak.map((w) => w.topic),
      recommended_action,
      algorithm_version: MASTERY_ALGORITHM_VERSION,
    },
  };
}

export function buildPreparationPlan(
  rows: TopicMasteryRow[],
  readiness: { score: number; breakdown: ReadinessBreakdown },
): Record<string, unknown> {
  const weak = listWeakTopics(rows, 8);
  return {
    version: MASTERY_ALGORITHM_VERSION,
    updated_hint: "Derived from topic_mastery after practice attempts.",
    readiness_score: readiness.score,
    focus_topics: weak.map((w) => ({
      topic: w.topic,
      mastery_score: w.mastery_score,
      state: w.state,
    })),
    next_action: readiness.breakdown.recommended_action,
    empty: rows.every((r) => r.evidence_count === 0),
  };
}

export function adaptiveSoftPriority(
  topic: string | null | undefined,
  masteryByTopic: Record<string, number>,
  seededRank01: number,
  weaknessWeight = 0.65,
): number {
  const key = String(topic ?? "").trim();
  const mastery =
    key && key in masteryByTopic ? clamp(masteryByTopic[key], 0, 1) : 0.5;
  const weakness = 1 - mastery;
  const noise = clamp(seededRank01, 0, 1);
  return weaknessWeight * weakness + (1 - weaknessWeight) * noise;
}
