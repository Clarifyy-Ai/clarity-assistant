// src/hooks/useCredits.ts
//
// Credit balance and credit-gating helper.
//
// SECURITY PURPOSE:
// only for generic/manual credit actions that are not already// - Read credit balance from authStore/profile
// deducted by the target Edge Function.

import { useCallback, useEffect, useMemo, useRef } from "react";
import { toast } from "sonner";

import { deductCredits as deductCreditsApi } from "@/lib/api/billing";
import { useAuthStore } from "@/store/authStore";

export const CREDIT_COSTS = {
  // Live / AI
  live_answer: 2,
  live_hint: 1,
  live_feedback: 2,

  // AI generation
  generate_questions: 3,
  generate_hint: 1,
  generate_debrief: 10,
  ai_coach_message: 1,

  // Mock / scorecard
  mock_question: 1,
  mock_full_answer: 2,
  mock_session: 10,
  scorecard_generate: 2,
  gap_analysis: 3,

  // Prep tools
  star_generate: 2,
  star_analyse: 1,
  company_brief: 5,
  screenshot_analyse: 1,
  coding_hint: 2,
  coding_solution: 2,
  system_design: 5,
  rephrase: 1,
  project_build: 2,

  // Documents
  resume_analysis: 5,
} as const;

export type CreditAction = keyof typeof CREDIT_COSTS;

export type DeductCreditsResult = {
  success: boolean;
  newBalance: number;
  error: string | null;
  transactionId?: string | null;
};

export type RefundCreditsResult = {
  success: boolean;
  newBalance: number;
  error: string | null;
};

function getCreditCost(action: CreditAction): number {
  return CREDIT_COSTS[action];
}

function createCreditIdempotencyKey(action: CreditAction): string {
  try {
    return `credit:${action}:${crypto.randomUUID()}`;
  } catch {
    return `credit:${action}:${Date.now()}:${Math.random()
      .toString(36)
      .slice(2)}`;
  }
}

export function useCredits() {
  const user = useAuthStore((state) => state.user);
  const profile = useAuthStore((state) => state.profile);
  const storeCredits = useAuthStore((state) => state.credits);
  const refreshCredits = useAuthStore((state) => state.refreshCredits);
  const setProfile = useAuthStore((state) => state.setProfile);

  const balance =
    typeof storeCredits === "number"
      ? storeCredits
      : typeof profile?.credits === "number"
        ? profile.credits
        : 0;

  const isLow = balance > 0 && balance <= 2;
  const isEmpty = balance <= 0;

  // One-shot low-credit toasts per session at 20 and 5 thresholds.
  const warnedRef = useRef<{ low: boolean; critical: boolean }>({
    low: false,
    critical: false,
  });

  useEffect(() => {
    if (balance <= 0) return;
    if (balance <= 5 && !warnedRef.current.critical) {
      warnedRef.current.critical = true;
      warnedRef.current.low = true;
      toast.error(`Only ${balance} credits left — top up to keep practising.`, {
        id: "credits-critical",
        duration: 8000,
      });
    } else if (balance <= 20 && !warnedRef.current.low) {
      warnedRef.current.low = true;
      toast.warning(`Low credits: ${balance} remaining.`, {
        id: "credits-low",
        duration: 6000,
      });
    } else if (balance > 20) {
      // Reset guards once user tops up.
      warnedRef.current = { low: false, critical: false };
    }
  }, [balance]);

  const costs = useMemo(() => CREDIT_COSTS, []);

  const canAfford = useCallback(
    (action: CreditAction): boolean => {
      return balance >= getCreditCost(action);
    },
    [balance]
  );

  const getCost = useCallback((action: CreditAction): number => {
    return getCreditCost(action);
  }, []);

  const refresh = useCallback(async (): Promise<void> => {
    await refreshCredits();
  }, [refreshCredits]);

  const deduct = useCallback(
    async (
      action: CreditAction,
      sessionId?: string | null,
      options?: {
        idempotencyKey?: string;
        referenceId?: string | null;
      }
    ): Promise<DeductCreditsResult> => {
      if (!user?.id) {
        return {
          success: false,
          newBalance: balance,
          error: "Not authenticated.",
        };
      }

      const cost = getCreditCost(action);

      if (balance < cost) {
        return {
          success: false,
          newBalance: balance,
          error: `Not enough credits. Need ${cost}, have ${balance}.`,
        };
      }

      try {
        const response = await deductCreditsApi(
          {
            action,
            cost,
            session_id: sessionId ?? null,
            reference_id: options?.referenceId ?? null,
          },
          {
            idempotencyKey:
              options?.idempotencyKey ?? createCreditIdempotencyKey(action),
          }
        );

        const newBalance = response.credits_remaining;

        if (profile) {
          setProfile({
            ...profile,
            credits: newBalance,
          });
        }

        await refreshCredits();

        return {
          success: true,
          newBalance,
          error: null,
          transactionId: response.transaction_id ?? null,
        };
      } catch (error) {
        const message =
          error instanceof Error
            ? error.message
            : "Credit deduction failed.";

        await refreshCredits();

        return {
          success: false,
          newBalance: balance,
          error: message,
        };
      }
    },
    [balance, profile, refreshCredits, setProfile, user?.id]
  );

  /**
   * Compatibility method.
   *
   * Frontend should NOT refund credits directly.
   * Refunds are handled by backend Edge Functions when AI/provider/DB failures occur.
   *
   * This function only refreshes the latest balance and returns current state.
   */
  const refund = useCallback(
    async (_action: CreditAction): Promise<RefundCreditsResult> => {
      await refreshCredits();

      return {
        success: true,
        newBalance: useAuthStore.getState().credits,
        error: null,
      };
    },
    [refreshCredits]
  );

  return {
    balance,
    isLow,
    isEmpty,
    costs,
    canAfford,
    getCost,
    deduct,
    refund,
    refresh,
  };
}

export default useCredits;

// - Gate frontend UI based on available credits
// - Route credit deduction through hardened Edge Function
// - Avoid direct client-side credit mutation/refund RPCs
// - Refresh balance from DB after credit-changing actions
//
// IMPORTANT:
// Most AI Edge Functions now deduct credits themselves.
