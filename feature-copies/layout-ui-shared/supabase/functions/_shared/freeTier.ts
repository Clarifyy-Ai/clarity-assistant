export const FREE_TIER_MAX_SESSION_MINUTES = 5;
export const FREE_TIER_DAILY_SESSION_LIMIT = 3;

export function isFreePlan(planId: string | null | undefined): boolean {
  return !planId || planId === "free" || planId === "starter";
}

export function capDurationMinutes(
  planId: string | null | undefined,
  requested: number,
): number {
  const max = isFreePlan(planId) ? FREE_TIER_MAX_SESSION_MINUTES : 60;
  return Math.min(Math.max(requested, 5), max);
}
