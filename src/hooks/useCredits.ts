// @ts-nocheck
import { useCallback } from "react";
import { supabase } from "@/lib/supabase/client";
import { useAuthStore } from "@/store/userStore";

// ─────────────────────────────────────────────────────────────────
// useCredits
// Read credits balance, deduct credits, gate features.
// All deductions go through the RPC to prevent client-side fraud.
// ─────────────────────────────────────────────────────────────────

export const CREDIT_COSTS = {
  live_hint:          1,
  mock_question:      1,
  mock_full_answer:   2,
  scorecard_generate: 2,
  gap_analysis:       3,
  star_generate:      1,
  star_analyse:       1,
  company_brief:      3,
  debrief_analyse:    2,
  screenshot_analyse: 2,
} as const;

export type CreditAction = keyof typeof CREDIT_COSTS;

export function useCredits() {
  const authStore = useAuthStore();
  const profile   = authStore.profile;

  const balance   = profile?.credits ?? 0;
  const isLow     = balance <= 2;
  const isEmpty   = balance === 0;

  // ── Check if user can afford an action ───────────────────────

  const canAfford = useCallback((action: CreditAction): boolean => {
    return balance >= CREDIT_COSTS[action];
  }, [balance]);

  // ── Deduct credits via Supabase RPC ──────────────────────────

  const deduct = useCallback(async (
    action: CreditAction,
    sessionId?: string
  ): Promise<{ success: boolean; newBalance: number; error: string | null }> => {
    const cost = CREDIT_COSTS[action];

    if (balance < cost) {
      return {
        success:    false,
        newBalance: balance,
        error:      `Not enough credits. Need ${cost}, have ${balance}.`,
      };
    }

    const { data, error } = await supabase.rpc("deduct_credits", {
      p_action:     action,
      p_cost:       cost,
      p_session_id: sessionId ?? null,
    });

    if (error) {
      return { success: false, newBalance: balance, error: error.message };
    }

    const newBalance = data?.new_balance ?? balance - cost;
    authStore.updateProfile({ credits: newBalance });

    return { success: true, newBalance, error: null };
  }, [balance, authStore]);

  // ── Refund credits (e.g. if AI call failed) ───────────────────

  const refund = useCallback(async (
    action: CreditAction
  ): Promise<void> => {
    const cost = CREDIT_COSTS[action];
    const { error } = await supabase.rpc("refund_credits", {
      p_cost: cost,
    });
    if (!error) {
      authStore.updateProfile({ credits: balance + cost });
    }
  }, [balance, authStore]);

  // ── Refresh balance from DB ───────────────────────────────────

  const refresh = useCallback(async (): Promise<void> => {
    const { user } = authStore;
    if (!user) return;
    const { data } = await supabase
      .from("profiles")
      .select("credits")
      .eq("id", user.id)
      .single();
    if (data) {
      authStore.updateProfile({ credits: data.credits });
    }
  }, [authStore]);

  return {
    balance,
    isLow,
    isEmpty,
    canAfford,
    deduct,
    refund,
    refresh,
    costs: CREDIT_COSTS,
  };
}
