/**
 * Honest rank / percentile publication.
 * Never derive a cohort percentile from a single-attempt score percentage.
 */

export const RANK_UNAVAILABLE_COPY = "Ranking data is not yet available.";

export const RANK_STATUSES = ["unavailable", "provisional", "final"] as const;
export type RankStatus = (typeof RANK_STATUSES)[number];

export const DEFAULT_MIN_COHORT_SIZE = 50;

export type RankPublication = {
  rank_status: RankStatus;
  cohort_size: number;
  min_cohort_size: number;
  percentile: number | null;
  rank: number | null;
  message: string | null;
};

export function isRankStatus(value: unknown): value is RankStatus {
  return typeof value === "string" && (RANK_STATUSES as readonly string[]).includes(value);
}

/**
 * Score-band mapping is NOT a percentile. Callers must not label it as rank.
 */
export function scoreBandLabel(scorePercent: number): string {
  const pct = Math.min(100, Math.max(0, scorePercent));
  if (pct >= 90) return "High score band";
  if (pct >= 75) return "Upper score band";
  if (pct >= 50) return "Mid score band";
  return "Developing score band";
}

export function resolveRankPublication(input: {
  cohortSize?: number | null;
  minCohortSize?: number | null;
  percentile?: number | null;
  rank?: number | null;
  status?: string | null;
}): RankPublication {
  const min = Math.max(1, Number(input.minCohortSize ?? DEFAULT_MIN_COHORT_SIZE));
  const size = Math.max(0, Number(input.cohortSize ?? 0));
  const requested = isRankStatus(input.status) ? input.status : "unavailable";

  if (size < min || requested === "unavailable") {
    return {
      rank_status: "unavailable",
      cohort_size: size,
      min_cohort_size: min,
      percentile: null,
      rank: null,
      message: RANK_UNAVAILABLE_COPY,
    };
  }

  const percentile =
    typeof input.percentile === "number" && Number.isFinite(input.percentile)
      ? Math.min(100, Math.max(0, input.percentile))
      : null;
  const rank =
    typeof input.rank === "number" && Number.isFinite(input.rank) && input.rank >= 1
      ? Math.floor(input.rank)
      : null;

  if (percentile == null || rank == null) {
    return {
      rank_status: "unavailable",
      cohort_size: size,
      min_cohort_size: min,
      percentile: null,
      rank: null,
      message: RANK_UNAVAILABLE_COPY,
    };
  }

  return {
    rank_status: requested,
    cohort_size: size,
    min_cohort_size: min,
    percentile,
    rank,
    message: requested === "provisional" ? "Provisional ranking — subject to recalculation." : null,
  };
}

/** Percentile formula when a real cohort exists: percent of scores strictly below, ties share rank. */
export function percentileFromCohort(score: number, cohortScores: number[]): number | null {
  if (cohortScores.length < DEFAULT_MIN_COHORT_SIZE) return null;
  const below = cohortScores.filter((s) => s < score).length;
  return Math.round((below / cohortScores.length) * 10000) / 100;
}
