import { useAuthStore } from "@/store/authStore";
import { PLAN_MONTHLY_CREDITS, type PlanId } from "@/lib/constants/pricing";

const ABSOLUTE_LOW_CREDIT = 5;

export function useCreditExhaustedState(): { isExhausted: boolean; balance: number } {
  const profile = useAuthStore((s) => s.profile);
  const balance = profile?.credits ?? 0;
  return { isExhausted: balance <= 0, balance };
}

export function useLowCreditState(): { isLow: boolean; balance: number; threshold: number } {
  const profile = useAuthStore((s) => s.profile);
  const planId = (useAuthStore((s) => s.planId) ?? "free") as PlanId;
  const balance = profile?.credits ?? 0;
  const monthly = PLAN_MONTHLY_CREDITS[planId];
  const threshold =
    monthly === null ? Number.POSITIVE_INFINITY : Math.max(1, Math.floor(monthly * 0.2));
  const isLow =
    balance > 0 && (balance <= ABSOLUTE_LOW_CREDIT || (monthly !== null && balance <= threshold));
  return { isLow, balance, threshold };
}
