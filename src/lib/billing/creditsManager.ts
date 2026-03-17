import { supabase } from "@/lib/supabase/client";
import { useAuthStore } from "@/store/userStore";
import { useUIStore } from "@/store/uiStore";
import type { PreferredAIModel } from "@/types/user.types";
import { getCreditCost } from "@/lib/ai/modelRouter";

// ─────────────────────────────────────────────────────────────────
// Credits Manager
// All credit operations go through this module.
// Server-side Edge Functions handle the actual deduction —
// client-side only optimistically updates UI and shows warnings.
// ─────────────────────────────────────────────────────────────────

export interface CreditCheckResult {
  canProceed:        boolean;
  creditsRequired:   number;
  creditsAvailable:  number;
  isLow:             boolean;     // < 5 credits remaining
  isBYOKActive:      boolean;
  reason:            string | null;
}

export interface CreditDeductionResult {
  success:           boolean;
  creditsDeducted:   number;
  creditsRemaining:  number;
  error:             string | null;
}

// Low credit warning threshold
const LOW_CREDIT_THRESHOLD = 5;

// ─────────────────────────────────────────────────────────────────
// Check if user can afford a model call
// ─────────────────────────────────────────────────────────────────

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

  const isBYOKActive = !!(
    profile.byok_gemini_key ||
    profile.byok_openai_key ||
    profile.byok_anthropic_key
  );

  // BYOK users bypass credit system
  if (isBYOKActive) {
    return {
      canProceed:       true,
      creditsRequired:  0,
      creditsAvailable: profile.credits_remaining,
      isLow:            false,
      isBYOKActive:     true,
      reason:           null,
    };
  }

  const required  = getCreditCost(model);
  const available = profile.credits_remaining;
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

// ─────────────────────────────────────────────────────────────────
// Deduct credits — calls Edge Function which handles DB write
// Client-side optimistic update only; server is source of truth
// ─────────────────────────────────────────────────────────────────

export async function deductCredits(
  model: PreferredAIModel,
  sessionId: string
): Promise<CreditDeductionResult> {
  const EDGE_BASE = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1`;
  const cost      = getCreditCost(model);

  try {
    const response = await fetch(`${EDGE_BASE}/deduct-credits`, {
      method: "POST",
      headers: {
        "Content-Type":  "application/json",
        "Authorization": `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}`,
      },
      body: JSON.stringify({
        model,
        session_id: sessionId,
        credits:    cost,
      }),
    });

    if (!response.ok) {
      throw new Error(`Credit deduction failed: ${response.status}`);
    }

    const data = await response.json();

    // Optimistically update profile in store
    useAuthStore.getState().updateProfile({
      credits_remaining: data.credits_remaining,
    });

    // Show upgrade modal if now critically low
    if (data.credits_remaining < LOW_CREDIT_THRESHOLD) {
      showLowCreditWarning(data.credits_remaining);
    }

    return {
      success:          true,
      creditsDeducted:  cost,
      creditsRemaining: data.credits_remaining,
      error:            null,
    };

  } catch (err) {
    return {
      success:          false,
      creditsDeducted:  0,
      creditsRemaining: useAuthStore.getState().profile?.credits_remaining ?? 0,
      error:            err instanceof Error ? err.message : "Unknown error",
    };
  }
}

// ─────────────────────────────────────────────────────────────────
// Credit top-up — redirect to billing or open upgrade modal
// ─────────────────────────────────────────────────────────────────

export function openUpgradeFlow(trigger = "out_of_credits"): void {
  useUIStore.getState().openUpgradeModal(trigger);
}

export function showLowCreditWarning(creditsRemaining: number): void {
  if (creditsRemaining === 0) {
    openUpgradeFlow("out_of_credits");
  } else if (creditsRemaining < LOW_CREDIT_THRESHOLD) {
    // Non-blocking toast is handled by notification system
    // Just open modal if < 2 left
    if (creditsRemaining < 2) {
      openUpgradeFlow("low_credits");
    }
  }
}

// ─────────────────────────────────────────────────────────────────
// Refetch credits from DB (after purchase / plan change)
// ─────────────────────────────────────────────────────────────────

export async function refreshCredits(): Promise<number | null> {
  const { user } = useAuthStore.getState();
  if (!user) return null;

  const { data, error } = await supabase
    .from("profiles")
    .select("credits_remaining, plan")
    .eq("id", user.id)
    .single();

  if (error || !data) return null;

  useAuthStore.getState().updateProfile({
    credits_remaining: data.credits_remaining,
    plan:              data.plan,
  });

  return data.credits_remaining;
}

// ─────────────────────────────────────────────────────────────────
// Credit usage history — for billing page
// ─────────────────────────────────────────────────────────────────

export async function fetchCreditHistory(limit = 50): Promise<Array<{
  id:         string;
  model:      string;
  credits:    number;
  session_id: string | null;
  created_at: string;
}>> {
  const { user } = useAuthStore.getState();
  if (!user) return [];

  const { data, error } = await supabase
    .from("credit_transactions")
    .select("id, model, credits, session_id, created_at")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false })
    .limit(limit);

  if (error || !data) return [];
  return data;
}

// ─────────────────────────────────────────────────────────────────
// Check if BYOK is configured for a specific provider
// ─────────────────────────────────────────────────────────────────

export function isBYOKConfigured(
  model: PreferredAIModel,
  profile: ReturnType<typeof useAuthStore.getState>["profile"]
): boolean {
  if (!profile) return false;

  switch (model) {
    case "gemini-flash":
    case "gemini-pro":
      return !!profile.byok_gemini_key;
    case "gpt-4o":
      return !!profile.byok_openai_key;
    case "claude":
      return !!profile.byok_anthropic_key;
    default:
      return false;
  }
}
