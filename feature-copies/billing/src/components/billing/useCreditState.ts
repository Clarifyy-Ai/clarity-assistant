import { useAuthStore } from "@/store/authStore";
import { PLAN_MONTHLY_CREDITS, type PlanId } from "@/lib/constants/pricing";
import { resolveCreditBalance } from "@/lib/billing/resolveCreditBalance";

const ABSOLUTE_LOW_CREDIT = 5;

export function useCreditBalance(): { balance: number; known: boolean } {
  const profile = useAuthStore((s) => s.profile);
  const storeCredits = useAuthStore((s) => s.credits);
  const isProfileLoaded = useAuthStore((s) => s.isProfileLoaded);
  return resolveCreditBalance({
    isProfileLoaded,
    profileCredits: profile?.credits,
    storeCredits,
  });
}

export function useCreditExhaustedState(): {
  isExhausted: boolean;
  balance: number;
  known: boolean;
} {
  const { balance, known } = useCreditBalance();
  return { isExhausted: known && balance <= 0, balance, known };
}

export function useLowCreditState(): { isLow: boolean; balance: number; threshold: number } {
  const { balance, known } = useCreditBalance();
  const planId = (useAuthStore((s) => s.planId) ?? "free") as PlanId;
  const monthly = PLAN_MONTHLY_CREDITS[planId];
  const threshold =
    monthly === null ? Number.POSITIVE_INFINITY : Math.max(1, Math.floor(monthly * 0.2));
  const isLow =
    known &&
    balance > 0 &&
    (balance <= ABSOLUTE_LOW_CREDIT || (monthly !== null && balance <= threshold));
  return { isLow, balance, threshold };
}
