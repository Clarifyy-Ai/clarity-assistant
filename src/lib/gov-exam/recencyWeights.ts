/**
 * Configurable recency weights for historical topic frequency.
 * Do not treat older cycles as current truth after a material pattern shift.
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

/** yearsAgo: 0 = latest cycle in the selected set */
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
