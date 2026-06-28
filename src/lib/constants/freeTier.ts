/** Free-plan session cap — applies to mock, live, warmup, rehearsal. */
export const FREE_TIER_MAX_SESSION_MINUTES = 5;
export const FREE_TIER_MAX_SESSION_SECONDS = FREE_TIER_MAX_SESSION_MINUTES * 60;

/** Free plan daily session starts (server-enforced in start-session). */
export const FREE_TIER_DAILY_SESSION_LIMIT = 3;

export function isFreePlan(planId: string | null | undefined): boolean {
  return !planId || planId === "free" || planId === "starter";
}

/** Max session length in minutes for the user's plan. */
export function maxSessionMinutesForPlan(planId: string | null | undefined): number {
  return isFreePlan(planId) ? FREE_TIER_MAX_SESSION_MINUTES : 60;
}

export function maxSessionSecondsForPlan(planId: string | null | undefined): number {
  return maxSessionMinutesForPlan(planId) * 60;
}
