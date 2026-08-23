/**
 * Plan attempt limits for Government Exam / mock-test creation.
 * Independent of credit balance.
 */
import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";
import { launchPlanRank, normalizePlanId } from "./billingCatalog.ts";

export type AttemptLimitResult = {
  allowed: boolean;
  code?: "MAX_ATTEMPTS_REACHED";
  current: number;
  limit: number;
  resetAt: string;
  planId: string;
};

const FREE_MONTHLY_MOCK_LIMIT = 3;

function startOfUtcMonth(now = new Date()): Date {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1, 0, 0, 0, 0));
}

function startOfNextUtcMonth(now = new Date()): Date {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1, 0, 0, 0, 0));
}

export function monthlyMockLimitForPlan(planId: string | null | undefined): number {
  const id = normalizePlanId(planId) ?? "free";
  // Pro / Max (elite) / enterprise: no product monthly attempt cap.
  if (launchPlanRank(id) >= 2) return Number.POSITIVE_INFINITY;
  return FREE_MONTHLY_MOCK_LIMIT;
}

export async function checkGovExamAttemptLimit(
  db: SupabaseClient,
  userId: string,
  planId: string | null | undefined,
): Promise<AttemptLimitResult> {
  const normalized = normalizePlanId(planId) ?? "free";
  const limit = monthlyMockLimitForPlan(normalized);
  const resetAt = startOfNextUtcMonth().toISOString();

  if (!Number.isFinite(limit)) {
    return {
      allowed: true,
      current: 0,
      limit: 0,
      resetAt,
      planId: normalized,
    };
  }

  const { count, error } = await db
    .from("mock_tests")
    .select("id", { count: "exact", head: true })
    .eq("user_id", userId)
    .gte("created_at", startOfUtcMonth().toISOString());

  if (error) {
    throw new Error(error.message);
  }

  const current = count ?? 0;
  if (current >= limit) {
    return {
      allowed: false,
      code: "MAX_ATTEMPTS_REACHED",
      current,
      limit,
      resetAt,
      planId: normalized,
    };
  }

  return {
    allowed: true,
    current,
    limit,
    resetAt,
    planId: normalized,
  };
}

export function attemptLimitPayload(result: AttemptLimitResult): {
  error: string;
  code: "MAX_ATTEMPTS_REACHED";
  current: number;
  limit: number;
  resetAt: string;
} {
  return {
    error: `You have reached this plan's attempt limit (${result.current}/${result.limit}). Try again after ${result.resetAt}.`,
    code: "MAX_ATTEMPTS_REACHED",
    current: result.current,
    limit: result.limit,
    resetAt: result.resetAt,
  };
}
