/**
 * Non-hook credit precheck helpers — preferred over creditsManager for new call sites.
 * Server authority remains Edge RPC + Postgres ledger.
 */

import { AI_CREDIT_COSTS, LIVE_ANSWER_LONG_CREDITS } from "@/lib/constants/creditEconomics";
import { isPaidPlan as isPaidPlanId } from "@/lib/billing/planIds";
import { useAuthStore } from "@/store/authStore";

/** Server-aligned live copilot precheck costs. */
export const SERVER_AI_CREDIT_COSTS = {
  hint: AI_CREDIT_COSTS.live_hint,
  fullAnswer: AI_CREDIT_COSTS.live_answer,
  longAnswer: LIVE_ANSWER_LONG_CREDITS,
  screenshotAnswer: AI_CREDIT_COSTS.screenshot_answer,
  coachMessage: AI_CREDIT_COSTS.ai_coach_message,
} as const;

export type LiveCreditPrecheckAction = keyof typeof SERVER_AI_CREDIT_COSTS;

export type CreditPrecheckResult = {
  canProceed: boolean;
  creditsRequired: number;
  creditsAvailable: number;
  isLow: boolean;
  isBYOKActive: boolean;
  reason: string | null;
};

const LOW_CREDIT_THRESHOLD = 2;

export function checkCreditsForAction(
  action: LiveCreditPrecheckAction,
): CreditPrecheckResult {
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

  const planKey =
    (profile as { plan_id?: string; plan?: string }).plan_id ?? profile.plan;
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

/** Refresh wallet balance from authoritative profile row. */
export async function refreshCreditsFromStore(): Promise<void> {
  await useAuthStore.getState().refreshCredits();
}
