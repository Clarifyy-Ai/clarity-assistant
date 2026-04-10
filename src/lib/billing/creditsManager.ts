import { EDGE_BASE } from "@/lib/env";
import { supabase } from "@/lib/supabase/client";
import { useAuthStore } from "@/store/userStore";
import { useUIStore } from "@/store/uiStore";
import type { PreferredAIModel } from "@/types/user.types";
import { getCreditCost } from "@/lib/ai/modelRouter";

// ─────────────────────────────────────────────────────────────────
// Credits Manager
// ─────────────────────────────────────────────────────────────────

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

// ── Check if user can afford a model call ─────────────────────────
// Guard: deduction is blocked if the user's subscription is not active
// (i.e. Stripe checkout hasn't completed) AND they have no free credits.

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

  // BYOK users bypass credit checks entirely
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

  // Guard: if user is on a paid plan but subscription_status is not active,
  // their Stripe checkout has not completed — block credit use until it does.
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

// ── Deduct credits ────────────────────────────────────────────────
// Always re-checks canProceed immediately before calling the edge function
// so stale in-memory state never bypasses the guard.

export async function deductCredits(
  model: PreferredAIModel,
  sessionId: string,
): Promise<CreditDeductionResult> {

  // Re-validate with fresh in-memory state before any network call
  const check = checkCredits(model);
  if (!check.canProceed) {
    return {
      success:          false,
      creditsDeducted:  0,
      creditsRemaining: check.creditsAvailable,
      error:            check.reason ?? "Credit check failed",
    };
  }

  const cost = getCreditCost(model);

  try {
    const { getAuthHeaders } = await import("@/lib/network/fetchEdge");
    const headers = await getAuthHeaders();

    const response = await fetch(`${EDGE_BASE}/deduct-credits`, {
      method:  "POST",
      headers,
      body:    JSON.stringify({
        model,
        session_id: sessionId,
        credits:    cost,
      }),
    });

    if (!response.ok) {
      // 402 = insufficient credits (race condition — another tab spent them)
      if (response.status === 402) {
        await refreshCredits(); // sync local state
        throw new Error("Insufficient credits. Your balance has been refreshed.");
      }
      throw new Error(`Credit deduction failed: ${response.status}`);
    }

    const data = (await response.json()) as {
      credits_remaining: number;
      credits_deducted:  number;
    };

    // Sync local profile state
    useAuthStore.getState().updateProfile({
      credits: data.credits_remaining,
    });

    if (data.credits_remaining < LOW_CREDIT_THRESHOLD) {
      showLowCreditWarning(data.credits_remaining);
    }

    return {
      success:          true,
      creditsDeducted:  data.credits_deducted ?? cost,
      creditsRemaining: data.credits_remaining,
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

// ── Credit top-up ─────────────────────────────────────────────────

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

// ── Refetch credits from DB ───────────────────────────────────────

export async function refreshCredits(): Promise<number | null> {
  const { user } = useAuthStore.getState();
  if (!user) return null;

  const { data, error } = await supabase
    .from("profiles")
    .select("credits, plan, subscription_status")
    .eq("id", user.id)
    .single();

  if (error || !data) return null;

  useAuthStore.getState().updateProfile({
    credits:             data.credits,
    plan:                data.plan,
    subscription_status: data.subscription_status,
  });

  return data.credits;
}

// ── Credit usage history ──────────────────────────────────────────

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
    .select("id, model, credits, session_id, created_at")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false })
    .limit(limit);

  if (error || !data) return [];
  return data as CreditTransaction[];
}

// ── BYOK check ────────────────────────────────────────────────────

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
