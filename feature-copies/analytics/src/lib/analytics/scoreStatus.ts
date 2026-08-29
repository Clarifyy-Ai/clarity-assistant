export type ScorecardUiStatus =
  | "loading"
  | "pending"
  | "not_scored"
  | "failed"
  | "scored";

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

export function scorecardStatusLabel(status: ScorecardUiStatus): string {
  switch (status) {
    case "loading":
      return "Loading scorecard";
    case "pending":
      return "Score pending";
    case "not_scored":
      return "Not scored";
    case "failed":
      return "Scoring failed";
    case "scored":
      return "Scored";
  }
}

/** Client-invented Gemini scores are never authoritative. */
export function isAuthoritativeScorecard(status: ScorecardUiStatus): boolean {
  return status === "scored";
}
