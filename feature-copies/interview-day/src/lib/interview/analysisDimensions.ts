/**
 * Explainable post-session analysis dimensions.
 * Scores must cite transcript evidence — never random percentages.
 */

export const ANALYSIS_DIMENSION_IDS = [
  "relevance",
  "clarity",
  "structure",
  "completeness",
  "evidence",
  "star_structure",
  "conciseness",
  "filler_words",
  "speaking_pace",
  "repetition",
  "competency_coverage",
  "technical_correctness",
] as const;

export type AnalysisDimensionId = (typeof ANALYSIS_DIMENSION_IDS)[number];

export type AnalysisDimensionResult = {
  id: AnalysisDimensionId;
  label: string;
  score_definition: string;
  score: number | null;
  transcript_evidence: string;
  scoring_reason: string;
  confidence: number;
  recommendation: string;
  improved_example: string;
  user_correction: string | null;
};

export const DIMENSION_DEFINITIONS: Record<
  AnalysisDimensionId,
  { label: string; score_definition: string }
> = {
  relevance: {
    label: "Relevance",
    score_definition: "Share of the answer that addresses the asked question (0–100).",
  },
  clarity: {
    label: "Clarity",
    score_definition: "How easily a listener can follow the answer without re-reading (0–100).",
  },
  structure: {
    label: "Structure",
    score_definition: "Presence of a beginning, middle, and close that match the question type (0–100).",
  },
  completeness: {
    label: "Completeness",
    score_definition: "Coverage of the parts the question required (0–100).",
  },
  evidence: {
    label: "Evidence",
    score_definition: "Use of specific facts, metrics, or named examples from the transcript (0–100).",
  },
  star_structure: {
    label: "STAR structure",
    score_definition: "Situation, Task, Action, and Result each present when the question is behavioral (0–100).",
  },
  conciseness: {
    label: "Conciseness",
    score_definition: "Absence of unused detours relative to answer length (0–100).",
  },
  filler_words: {
    label: "Filler words",
    score_definition: "Filler rate vs a 3 per 100 words practice target (higher is better).",
  },
  speaking_pace: {
    label: "Speaking pace",
    score_definition: "Words per minute vs a 130–160 WPM practice band (higher is closer).",
  },
  repetition: {
    label: "Repetition",
    score_definition: "Repeated phrases that do not add information (higher is less repetition).",
  },
  competency_coverage: {
    label: "Competency coverage",
    score_definition: "Share of target competencies evidenced in the transcript (0–100).",
  },
  technical_correctness: {
    label: "Technical correctness",
    score_definition: "Only scored when the claim is verifiable from the transcript or problem statement.",
  },
};

export function emptyDimension(id: AnalysisDimensionId): AnalysisDimensionResult {
  const def = DIMENSION_DEFINITIONS[id];
  return {
    id,
    label: def.label,
    score_definition: def.score_definition,
    score: null,
    transcript_evidence: "",
    scoring_reason: "Insufficient transcript evidence to score this dimension.",
    confidence: 0,
    recommendation: "Record a complete answer, then re-run analysis.",
    improved_example: "",
    user_correction: null,
  };
}

export function normalizeDimension(
  raw: unknown,
  id: AnalysisDimensionId,
): AnalysisDimensionResult {
  const base = emptyDimension(id);
  if (!raw || typeof raw !== "object") return base;
  const row = raw as Record<string, unknown>;
  const score =
    typeof row.score === "number" && Number.isFinite(row.score)
      ? Math.min(100, Math.max(0, row.score))
      : null;
  const confidence =
    typeof row.confidence === "number" && Number.isFinite(row.confidence)
      ? Math.min(1, Math.max(0, row.confidence))
      : 0;
  return {
    ...base,
    score,
    transcript_evidence: String(row.transcript_evidence ?? "").slice(0, 2_000),
    scoring_reason: String(row.scoring_reason ?? base.scoring_reason).slice(0, 2_000),
    confidence,
    recommendation: String(row.recommendation ?? base.recommendation).slice(0, 2_000),
    improved_example: String(row.improved_example ?? "").slice(0, 4_000),
    user_correction:
      row.user_correction == null ? null : String(row.user_correction).slice(0, 4_000),
  };
}

export function normalizeAnalysisDimensions(raw: unknown): AnalysisDimensionResult[] {
  const map = new Map<string, unknown>();
  if (Array.isArray(raw)) {
    for (const item of raw) {
      if (item && typeof item === "object" && "id" in item) {
        map.set(String((item as { id: unknown }).id), item);
      }
    }
  } else if (raw && typeof raw === "object") {
    for (const [key, value] of Object.entries(raw as Record<string, unknown>)) {
      map.set(key, value);
    }
  }
  return ANALYSIS_DIMENSION_IDS.map((id) => normalizeDimension(map.get(id), id));
}

export function analysisIsExplainable(dimensions: AnalysisDimensionResult[]): boolean {
  return dimensions.every(
    (d) =>
      d.score_definition.length > 0 &&
      d.scoring_reason.length > 0 &&
      typeof d.confidence === "number",
  );
}
