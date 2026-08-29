import type { BillingInterval } from "@/lib/billing/subscriptionManager";

export const PENDING_PLAN_STORAGE_KEY = "clarify_pending_plan";
export const PENDING_INTERVAL_STORAGE_KEY = "clarify_pending_interval";

/** Paid plans that may be requested from marketing CTAs. */
export const PAID_SIGNUP_PLANS = ["starter", "pro", "enterprise"] as const;
export type PaidSignupPlan = (typeof PAID_SIGNUP_PLANS)[number];

export function isPaidSignupPlan(value: string | null | undefined): value is PaidSignupPlan {
  return typeof value === "string" && (PAID_SIGNUP_PLANS as readonly string[]).includes(value);
}

export function isBillingInterval(value: string | null | undefined): value is BillingInterval {
  return value === "monthly" || value === "yearly";
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

export function setPendingPlan(
  plan: string | null | undefined,
  interval?: string | null
): void {
  if (!isPaidSignupPlan(plan)) return;
  safeSet(PENDING_PLAN_STORAGE_KEY, plan);
  if (isBillingInterval(interval)) {
    safeSet(PENDING_INTERVAL_STORAGE_KEY, interval);
  }
}

export function getPendingPlan(): PaidSignupPlan | null {
  const raw = safeGet(PENDING_PLAN_STORAGE_KEY);
  return isPaidSignupPlan(raw) ? raw : null;
}

export function getPendingInterval(): BillingInterval {
  const raw = safeGet(PENDING_INTERVAL_STORAGE_KEY);
  return isBillingInterval(raw) ? raw : "monthly";
}

export function clearPendingPlan(): void {
  safeRemove(PENDING_PLAN_STORAGE_KEY);
  safeRemove(PENDING_INTERVAL_STORAGE_KEY);
}

/** Post-auth destination when a paid plan was selected on pricing/signup. */
export function billingReturnPathForPlan(
  plan: PaidSignupPlan,
  interval: BillingInterval = "monthly"
): string {
  const params = new URLSearchParams({ upgrade: plan });
  if (interval === "yearly") {
    params.set("interval", "yearly");
  }
  return `/app/settings/billing?${params.toString()}`;
}
