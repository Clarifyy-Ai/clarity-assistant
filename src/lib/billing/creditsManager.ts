// src/lib/billing/creditsManager.ts

import { EDGE_BASE } from "@/lib/env";
import { supabase } from "@/lib/supabase/client";
import { useAuthStore } from "@/store/userStore";
import { useUIStore } from "@/store/uiStore";
import type { PreferredAIModel } from "@/types/user.types";
import { getCreditCost } from "@/lib/ai/modelRouter";

// ─────────────────────────────────────────────────────────────────
// Credits Manager
// ─────────────────────────────────────────────────────────────────

export type CreditAction =
  | "liveanswershort"
  | "liveanswerlong"
  | "hintgeneration"
  | "starbuilder"
  | "documentparse"
  | "companyresearch"
  | "rephraser"
  | "projectbuilder"
  | "mocksessionquestion";

export const CREDIT_COSTS: Record<CreditAction, number> = {
  liveanswershort:   5,  // 200 tokens short [file:3]
  liveanswerlong:   12,  // 200 tokens long
  hintgeneration:    8,
  starbuilder:      10,
  documentparse:    15,
  companyresearch:  20,
  rephraser:        6,
  projectbuilder:  10,
  mocksessionquestion: 3,
};

export interface CreditCheckResult {
  canProceed:       boolean;
  creditsRequired:  number;
  creditsAvailable: number;
  isLow:            boolean;
  isBYOKActive:     boolean;
  reason:           string | null;
}

export interface CreditDeductionResult {
  success:          boolean;
  creditsDeducted:  number;
  creditsRemaining: number;
  error:            string | null;
}

const LOW_CREDIT_THRESHOLD = 5;

// ── Check if user can afford a model‑based call (legacy helper) ──
// Guard: deduction is blocked if subscription is not active and no free credits. [file:1][file:3]

export function checkCredits(model: PreferredAIModel): CreditCheckResult {
  const { profile } = useAuthStore.getState();

  if (!profile) {
    return {
      canProceed:       false,
      creditsRequired:  0,
      creditsAvailable: 0,
      isLow:            false,
      isBYOKActive:     false,
      reason:           "Not authenticated",
    };
  }

  // BYOK users bypass credit checks entirely. [file:3]
  const isBYOKActive = !!(
    profile.byok_gemini ||
    profile.byok_openai ||
    profile.byok_anthropic
  );

  if (isBYOKActive) {
    return {
      canProceed:       true,
      creditsRequired:  0,
      creditsAvailable: profile.credits,
      isLow:            false,
      isBYOKActive:     true,
      reason:           null,
    };
  }

  const isPaidPlan = profile.plan && profile.plan !== "free";
  const subStatus  = profile.subscription_status as string | undefined;

  if (isPaidPlan && subStatus && !["active", "trialing"].includes(subStatus)) {
    return {
      canProceed:       false,
      creditsRequired:  getCreditCost(model),
      creditsAvailable: profile.credits,
      isLow:            profile.credits < LOW_CREDIT_THRESHOLD,
      isBYOKActive:     false,
      reason:           `Subscription is ${subStatus}. Complete checkout to use credits.`,
    };
  }

  const required  = getCreditCost(model);
  const available = profile.credits;
  const isLow     = available - required < LOW_CREDIT_THRESHOLD;

  if (available < required) {
    return {
      canProceed:       false,
      creditsRequired:  required,
      creditsAvailable: available,
      isLow:            true,
      isBYOKActive:     false,
      reason:           `Not enough credits. Need ${required}, have ${available}.`,
    };
  }

  return {
    canProceed:       true,
    creditsRequired:  required,
    creditsAvailable: available,
    isLow,
    isBYOKActive:     false,
    reason:           null,
  };
}

// ── Generic deduction by CreditAction (preferred API) ────────────

export async function deductCreditsForAction(
  action: CreditAction,
  sessionId?: string,
): Promise<CreditDeductionResult> {
  const { profile } = useAuthStore.getState();
  if (!profile) {
    return {
      success:          false,
      creditsDeducted:  0,
      creditsRemaining: 0,
      error:            "Not authenticated",
    };
  }

  // BYOK: skip deduction entirely. [file:3]
  if (profile.byok_gemini || profile.byok_openai || profile.byok_anthropic) {
    return {
      success:          true,
      creditsDeducted:  0,
      creditsRemaining: profile.credits,
      error:            null,
    };
  }

  const cost = CREDIT_COSTS[action] ?? 0;
  if (!cost) {
    return {
      success:          false,
      creditsDeducted:  0,
      creditsRemaining: profile.credits,
      error:            `Unknown or zero-cost action: ${action}`,
    };
  }

  // Simple pre‑flight check to avoid obvious failures.
  if ((profile.credits ?? 0) < cost) {
    return {
      success:          false,
      creditsDeducted:  0,
      creditsRemaining: profile.credits,
      error:            `Insufficient credits. Need ${cost}, have ${profile.credits}.`,
    };
  }

  try {
    const { getAuthHeaders } = await import("@/lib/network/fetchEdge");
    const headers = await getAuthHeaders();

    const response = await fetch(`${EDGE_BASE}/deduct-credits`, {
      method: "POST",
      headers,
      body: JSON.stringify({
        action,
        cost,
        session_id: sessionId ?? null,
      }),
    });

    if (!response.ok) {
      if (response.status === 402) {
        // Race condition: another tab used credits. [file:1]
        await refreshCredits();
        const errBody = await response.json().catch(() => null);
        const msg = errBody?.error ?? "Insufficient credits";
        return {
          success:          false,
          creditsDeducted:  0,
          creditsRemaining: useAuthStore.getState().profile?.credits ?? 0,
          error:            msg,
        };
      }

      throw new Error(`Credit deduction failed: ${response.status}`);
    }

    const data = (await response.json()) as {
      credits_remaining: number;
    };

    const remaining = data.credits_remaining ?? 0;

    useAuthStore.getState().updateProfile({ credits: remaining });

    if (remaining < LOW_CREDIT_THRESHOLD) {
      showLowCreditWarning(remaining);
    }

    return {
      success:          true,
      creditsDeducted:  cost,
      creditsRemaining: remaining,
      error:            null,
    };
  } catch (err) {
    return {
      success:          false,
      creditsDeducted:  0,
      creditsRemaining: useAuthStore.getState().profile?.credits ?? 0,
      error:            err instanceof Error ? err.message : "Unknown error",
    };
  }
}

// ── Legacy model-based deduction wrapper (optional) ──────────────
// Useful where you already call by model only; internally maps to an action.

export async function deductCredits(
  model: PreferredAIModel,
  sessionId: string,
): Promise<CreditDeductionResult> {
  // Map model → default action (short vs long answers). [file:3]
  // You can refine this mapping based on token estimates.
  const action: CreditAction =
    model === "gpt-4o" || model === "claude"
      ? "liveanswerlong"
      : "liveanswershort";

  return deductCreditsForAction(action, sessionId);
}

// ── Credit top-up / modal helpers ────────────────────────────────

export function openUpgradeFlow(trigger = "out_of_credits"): void {
  useUIStore.getState().openUpgradeModal(trigger);
}

export function showLowCreditWarning(creditsRemaining: number): void {
  if (creditsRemaining === 0) {
    openUpgradeFlow("out_of_credits");
  } else if (creditsRemaining < LOW_CREDIT_THRESHOLD) {
    openUpgradeFlow("low_credits");
  }
}

// ── Refetch credits from DB ──────────────────────────────────────

export async function refreshCredits(): Promise<number | null> {
  const { user } = useAuthStore.getState();
  if (!user) return null;

  const { data, error } = await supabase
    .from("profiles")
    .select("credits, plan_id, subscription_status")
    .eq("id", user.id)
    .single();

  if (error || !data) return null;

  useAuthStore.getState().updateProfile({
    credits:             data.credits,
    plan:                data.plan_id as any,
    subscription_status: data.subscription_status,
  });

  return data.credits;
}

// ── Credit usage history ─────────────────────────────────────────

export interface CreditTransaction {
  id:         string;
  model:      string;
  credits:    number;
  session_id: string | null;
  created_at: string;
}

export async function fetchCreditHistory(
  limit = 50,
): Promise<CreditTransaction[]> {
  const { user } = useAuthStore.getState();
  if (!user) return [];

  const { data, error } = await supabase
    .from("credit_transactions")
    .select("id, action, amount, session_id, created_at, description")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false })
    .limit(limit);

  if (error || !data) return [];
  return data.map((row) => ({
    id:         row.id,
    model:      row.action ?? "unknown",
    credits:    row.amount,
    session_id: row.session_id,
    created_at: row.created_at,
  })) as CreditTransaction[];
}

// ── BYOK check ───────────────────────────────────────────────────

export function isBYOKConfigured(
  model:   PreferredAIModel,
  profile: ReturnType<typeof useAuthStore.getState>["profile"],
): boolean {
  if (!profile) return false;

  switch (model) {
    case "gemini-flash":
    case "gemini-pro":
      return !!profile.byok_gemini;
    case "gpt-4o":
      return !!profile.byok_openai;
    case "claude":
      return !!profile.byok_anthropic;
    default:
      return false;
  }
}
