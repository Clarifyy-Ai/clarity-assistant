import { AI_CREDIT_COSTS } from "@/lib/constants/creditEconomics";
import { creditsDB } from "@/lib/supabase/database";
import { supabase } from "@/lib/supabase/client";
import { useAuthStore } from "@/store/userStore";
import { useUIStore } from "@/store/uiStore";
import type { PreferredAIModel } from "@/types/user.types";
import { isPaidPlan as isPaidPlanId } from "@/lib/billing/planIds";

/** Server-aligned credit costs (see supabase/functions/_shared/creditEconomics.ts). */
export const SERVER_AI_CREDIT_COSTS = {
  hint: AI_CREDIT_COSTS.live_hint,
  fullAnswer: AI_CREDIT_COSTS.live_answer,
  screenshotAnswer: AI_CREDIT_COSTS.screenshot_answer,
} as const;

/**
 * Legacy model-based precheck defaults to live_answer cost (not hint).
 * Prefer checkCreditsForAction / CREDIT_COSTS for accurate gating.
 */
function getCreditCost(_model: PreferredAIModel): number {
  return SERVER_AI_CREDIT_COSTS.fullAnswer;
}

export function checkCreditsForAction(
  action: keyof typeof SERVER_AI_CREDIT_COSTS,
): CreditCheckResult {
  const { profile } = useAuthStore.getState();
  const required = SERVER_AI_CREDIT_COSTS[action];

  if (!profile) {
    return {
      canProceed: false,
      creditsRequired: required,
      creditsAvailable: 0,
      isLow: false,
      isBYOKActive: false,
      reason: "Not authenticated",
    };
  }

  const planKey = (profile as { plan_id?: string; plan?: string }).plan_id ?? profile.plan;
  const paid = isPaidPlanId(planKey);
  const subStatus = profile.subscription_status as string | undefined;

  if (paid && subStatus && !["active", "trialing"].includes(subStatus)) {
    return {
      canProceed: false,
      creditsRequired: required,
      creditsAvailable: profile.credits,
      isLow: profile.credits < LOW_CREDIT_THRESHOLD,
      isBYOKActive: false,
      reason: `Subscription is ${subStatus}. Complete checkout to use credits.`,
    };
  }

  const available = profile.credits;
  const isLow = available - required < LOW_CREDIT_THRESHOLD;

  if (available < required) {
    return {
      canProceed: false,
      creditsRequired: required,
      creditsAvailable: available,
      isLow: true,
      isBYOKActive: false,
      reason: `Not enough credits. Need ${required}, have ${available}.`,
    };
  }

  return {
    canProceed: true,
    creditsRequired: required,
    creditsAvailable: available,
    isLow,
    isBYOKActive: false,
    reason: null,
  };
}

// ─────────────────────────────────────────────────────────────────
// Credits Manager
// ─────────────────────────────────────────────────────────────────

export type CreditAction =
  | "liveanswershort"
  | "liveanswerlong"
  | "generate_hint"
  | "starbuilder"
  | "documentparse"
  | "companyresearch"
  | "rephraser"
  | "projectbuilder"
  | "mocksessionquestion";

export const CREDIT_COSTS: Record<CreditAction, number> = {
  liveanswershort:   AI_CREDIT_COSTS.live_answer,
  liveanswerlong:    AI_CREDIT_COSTS.live_answer + 4,
  generate_hint:     AI_CREDIT_COSTS.live_hint,
  starbuilder:       AI_CREDIT_COSTS.star_builder,
  documentparse:     AI_CREDIT_COSTS.parse_question_pdf,
  companyresearch:   AI_CREDIT_COSTS.company_research,
  rephraser:         AI_CREDIT_COSTS.rephraser,
  projectbuilder:    AI_CREDIT_COSTS.project_builder,
  mocksessionquestion: AI_CREDIT_COSTS.generate_questions,
};

export interface CreditCheckResult {
  canProceed:       boolean;
  creditsRequired:  number;
  creditsAvailable: number;
  isLow:            boolean;
  /** Always false — BYOK product disabled; retained for call-site compatibility. */
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

  const planKey = (profile as { plan_id?: string; plan?: string }).plan_id ?? profile.plan;
  const paid = isPaidPlanId(planKey);
  const subStatus  = profile.subscription_status as string | undefined;

  if (paid && subStatus && !["active", "trialing"].includes(subStatus)) {
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

  const cost = CREDIT_COSTS[action] ?? 0;
  if (!cost) {
    return {
      success:          false,
      creditsDeducted:  0,
      creditsRemaining: profile.credits,
      error:            `Unknown or zero-cost action: ${action}`,
    };
  }

  if ((profile.credits ?? 0) < cost) {
    return {
      success:          false,
      creditsDeducted:  0,
      creditsRemaining: profile.credits,
      error:            `Insufficient credits. Need ${cost}, have ${profile.credits}.`,
    };
  }

  try {
    const { fetchEdge } = await import("@/lib/network/fetchEdge");
    const idempotencyKey = `dc-${(crypto as any)?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`}`;

    const response = await fetchEdge(
      "deduct-credits",
      { action, cost, session_id: sessionId ?? null },
      { headers: { "Idempotency-Key": idempotencyKey } },
    );

    if (!response.ok) {
      if (response.status === 402) {
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

export async function deductCredits(
  model: PreferredAIModel,
  sessionId: string,
): Promise<CreditDeductionResult> {
  const action: CreditAction =
    model === "gpt-4o" || model === "claude"
      ? "liveanswerlong"
      : "liveanswershort";

  return deductCreditsForAction(action, sessionId);
}

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

export async function refreshCredits(): Promise<number | null> {
  const { user } = useAuthStore.getState();
  if (!user) return null;

  const { data, error } = await supabase
    .from("profiles")
    .select("credits, plan_id, subscription_status")
    .eq("id", user.id)
    .maybeSingle();

  if (error || !data) return null;

  useAuthStore.getState().updateProfile({
    credits:             data.credits,
    plan_id:             data.plan_id as any,
    plan:                data.plan_id as any,
    subscription_status: data.subscription_status,
  });

  return data.credits;
}

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

  let data;
  try {
    data = await creditsDB.listByUserId(user.id, limit);
  } catch {
    return [];
  }
  return data.map((row) => ({
    id:         row.id,
    model:      row.action ?? "unknown",
    credits:    row.amount,
    session_id: row.session_id,
    created_at: row.created_at,
  })) as CreditTransaction[];
}

/** Legacy BYOK flags may exist on profiles; they do not grant free credits. */
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
