/**
 * Pure helpers for previous-year paper topic trend analysis (algorithm recency_v1).
 * Mirrors src/lib/gov-exam/trendAnalysis.ts + recencyWeights + patternShift.
 */

export type RecencyWeightTable = {
  latest: number;
  oneOlder: number;
  twoOlder: number;
  threeOlder: number;
  older: number;
};

export const DEFAULT_RECENCY_WEIGHTS: RecencyWeightTable = {
  latest: 1.0,
  oneOlder: 0.85,
  twoOlder: 0.7,
  threeOlder: 0.55,
  older: 0.35,
};

export const ALGORITHM_VERSION = "recency_v1";

export function recencyWeight(
  yearsAgo: number,
  table: RecencyWeightTable = DEFAULT_RECENCY_WEIGHTS,
): number {
  if (yearsAgo <= 0) return table.latest;
  if (yearsAgo === 1) return table.oneOlder;
  if (yearsAgo === 2) return table.twoOlder;
  if (yearsAgo === 3) return table.threeOlder;
  return table.older;
}

export function weightedTopicFrequency(
  occurrencesByYear: Array<{ year: number; count: number; sourceConfidence?: number }>,
  latestYear: number,
  table: RecencyWeightTable = DEFAULT_RECENCY_WEIGHTS,
): number {
  let num = 0;
  let den = 0;
  for (const row of occurrencesByYear) {
    const yearsAgo = Math.max(0, latestYear - row.year);
    const w = recencyWeight(yearsAgo, table);
    const conf = row.sourceConfidence ?? 1;
    num += row.count * w * conf;
    den += w * conf;
  }
  return den > 0 ? num / den : 0;
}

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

export type PatternSnapshot = {
  total_questions: number;
  total_marks: number;
  duration_minutes: number;
  negative_mark: number;
  section_codes: string[];
};

export type PatternShift = {
  material: boolean;
  changes: string[];
  historicalWeightFactor: number;
};

export function detectPatternShift(
  previous: PatternSnapshot,
  current: PatternSnapshot,
): PatternShift {
  const changes: string[] = [];
  if (previous.total_questions !== current.total_questions) {
    changes.push("question_count");
  }
  if (previous.total_marks !== current.total_marks) {
    changes.push("total_marks");
  }
  if (previous.duration_minutes !== current.duration_minutes) {
    changes.push("duration");
  }
  if (previous.negative_mark !== current.negative_mark) {
    changes.push("negative_marking");
  }
  const prevSecs = new Set(previous.section_codes);
  const currSecs = new Set(current.section_codes);
  for (const s of currSecs) {
    if (!prevSecs.has(s)) changes.push(`section_added:${s}`);
  }
  for (const s of prevSecs) {
    if (!currSecs.has(s)) changes.push(`section_removed:${s}`);
  }

  const material = changes.length > 0;
  return {
    material,
    changes,
    historicalWeightFactor: material ? 0.35 : 1,
  };
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

  const byTopic = new Map<
    string,
    Array<{ year: number; count: number; sourceConfidence?: number }>
  >();
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
  return detectPatternShift(versions[1], versions[0]);
}

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
