export function formatSessionScore(
  score: number | null | undefined,
  status?: string,
): string {
  if (status && status !== "scored") return "Not scored";
  if (typeof score !== "number") return "Not scored";
  return String(score);
}
