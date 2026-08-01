/**
 * Pure helpers for previous-year paper topic trend analysis (algorithm recency_v1).
 */

import {
  ALGORITHM_VERSION,
  DEFAULT_RECENCY_WEIGHTS,
  recencyWeight,
  type RecencyWeightTable,
} from "@/lib/gov-exam/recencyWeights";
import {
  detectPatternShift,
  type PatternShift,
  type PatternSnapshot,
} from "@/lib/gov-exam/patternShift";

export { ALGORITHM_VERSION };

/** Total recency-weighted mass (sum of count × weight) for ranking topics. */
export function weightedTopicMass(
  occurrencesByYear: Array<{ year: number; count: number; sourceConfidence?: number }>,
  latestYear: number,
  table: RecencyWeightTable = DEFAULT_RECENCY_WEIGHTS,
): number {
  let mass = 0;
  for (const row of occurrencesByYear) {
    const yearsAgo = Math.max(0, latestYear - row.year);
    const w = recencyWeight(yearsAgo, table);
    const conf = row.sourceConfidence ?? 1;
    mass += row.count * w * conf;
  }
  return mass;
}

export type TopicYearOccurrence = {
  topic: string;
  year: number;
  count: number;
  sourceConfidence?: number;
};

export type TopicTrendRow = {
  topic: string;
  rawCount: number;
  weightedFrequency: number;
  years: number[];
};

export type TrendAnalysisResult = {
  algorithmVersion: string;
  empty: boolean;
  message?: string;
  topics: TopicTrendRow[];
  sourceYearsUsed: number[];
  questionCount: number;
  patternShift: PatternShift | null;
};

/** Aggregate raw topic×year counts into weighted rankings. */
export function buildTopicTrends(
  occurrences: TopicYearOccurrence[],
  sourceYears: number[],
  table: RecencyWeightTable = DEFAULT_RECENCY_WEIGHTS,
): Omit<TrendAnalysisResult, "patternShift" | "message"> & { message?: string } {
  const years =
    sourceYears.length > 0
      ? [...new Set(sourceYears.filter((y) => Number.isFinite(y)))].sort((a, b) => b - a)
      : [...new Set(occurrences.map((o) => o.year))].sort((a, b) => b - a);

  const latestYear = years[0] ?? Math.max(0, ...occurrences.map((o) => o.year));
  const yearSet = years.length > 0 ? new Set(years) : null;

  const byTopic = new Map<string, Array<{ year: number; count: number; sourceConfidence?: number }>>();
  let questionCount = 0;

  for (const row of occurrences) {
    const topic = String(row.topic ?? "").trim() || "Unknown";
    if (yearSet && !yearSet.has(row.year)) continue;
    questionCount += row.count;
    const list = byTopic.get(topic) ?? [];
    list.push({
      year: row.year,
      count: row.count,
      sourceConfidence: row.sourceConfidence,
    });
    byTopic.set(topic, list);
  }

  if (byTopic.size === 0) {
    return {
      algorithmVersion: ALGORITHM_VERSION,
      empty: true,
      message:
        "No previous-year question topic data is available for the selected years. " +
        "Trends cannot be computed until approved PYQ links exist in the registry.",
      topics: [],
      sourceYearsUsed: years,
      questionCount: 0,
    };
  }

  const topics: TopicTrendRow[] = [];
  for (const [topic, rows] of byTopic) {
    const rawCount = rows.reduce((s, r) => s + r.count, 0);
    const weightedFrequency = weightedTopicMass(rows, latestYear, table);
    topics.push({
      topic,
      rawCount,
      weightedFrequency,
      years: [...new Set(rows.map((r) => r.year))].sort((a, b) => b - a),
    });
  }

  topics.sort((a, b) => b.weightedFrequency - a.weightedFrequency || b.rawCount - a.rawCount);

  return {
    algorithmVersion: ALGORITHM_VERSION,
    empty: false,
    topics,
    sourceYearsUsed: years,
    questionCount,
  };
}

/** Collapse topic strings from question rows into year-bucketed occurrences. */
export function occurrencesFromQuestionRows(
  rows: Array<{ topic: string | null; year: number | null }>,
): TopicYearOccurrence[] {
  const map = new Map<string, number>();
  for (const row of rows) {
    const year = Number(row.year);
    if (!Number.isFinite(year) || year < 1990) continue;
    const topic = String(row.topic ?? "").trim() || "Unknown";
    const key = `${topic}::${year}`;
    map.set(key, (map.get(key) ?? 0) + 1);
  }
  const out: TopicYearOccurrence[] = [];
  for (const [key, count] of map) {
    const [topic, yearStr] = key.split("::");
    out.push({ topic, year: Number(yearStr), count });
  }
  return out;
}

export function analyzePatternVersions(
  versions: PatternSnapshot[],
): PatternShift | null {
  if (versions.length < 2) return null;
  // Compare most recent (index 0) vs previous (index 1)
  return detectPatternShift(versions[1], versions[0]);
}

/** Weight factor after detecting a material pattern shift. */
export function applyShiftToWeightTable(
  table: RecencyWeightTable,
  shift: PatternShift | null,
): RecencyWeightTable {
  if (!shift?.material) return table;
  const f = shift.historicalWeightFactor;
  return {
    latest: table.latest,
    oneOlder: table.oneOlder * f,
    twoOlder: table.twoOlder * f,
    threeOlder: table.threeOlder * f,
    older: table.older * f,
  };
}

export function recencyWeightForYear(
  year: number,
  latestYear: number,
  table: RecencyWeightTable = DEFAULT_RECENCY_WEIGHTS,
): number {
  return recencyWeight(Math.max(0, latestYear - year), table);
}
