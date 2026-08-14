export function formatSessionScore(
  score: number | null | undefined,
  status?: string,
): string {
  if (status && status !== "scored") return "Not scored";
  if (typeof score !== "number") return "Not scored";
  return String(score);
}

/** Aggregates must not coerce a missing average into 0. */
export function formatAggregateScore(score: number | null | undefined): string {
  if (typeof score !== "number" || !Number.isFinite(score)) return "—";
  return String(Math.round(score));
}
