export const PENDING_PLAN_STORAGE_KEY = "clarify_pending_plan";

/** Paid plans that may be requested from marketing CTAs. */
export const PAID_SIGNUP_PLANS = ["starter", "pro", "enterprise"] as const;
export type PaidSignupPlan = (typeof PAID_SIGNUP_PLANS)[number];

export function isPaidSignupPlan(value: string | null | undefined): value is PaidSignupPlan {
  return typeof value === "string" && (PAID_SIGNUP_PLANS as readonly string[]).includes(value);
}

function safeGet(key: string): string | null {
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

function safeSet(key: string, value: string): void {
  try {
    window.localStorage.setItem(key, value);
  } catch {
    // Ignore storage failures (private mode / quota).
  }
}

function safeRemove(key: string): void {
  try {
    window.localStorage.removeItem(key);
  } catch {
    // Ignore storage failures.
  }
}

export function setPendingPlan(plan: string | null | undefined): void {
  if (!isPaidSignupPlan(plan)) return;
  safeSet(PENDING_PLAN_STORAGE_KEY, plan);
}

export function getPendingPlan(): PaidSignupPlan | null {
  const raw = safeGet(PENDING_PLAN_STORAGE_KEY);
  return isPaidSignupPlan(raw) ? raw : null;
}

export function clearPendingPlan(): void {
  safeRemove(PENDING_PLAN_STORAGE_KEY);
}

/** Post-auth destination when a paid plan was selected on pricing/signup. */
export function billingReturnPathForPlan(plan: PaidSignupPlan): string {
  return `/app/settings/billing?upgrade=${encodeURIComponent(plan)}`;
}
