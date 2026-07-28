import { describe, expect, it } from "vitest";

/**
 * Mirrors supabase/functions/_shared/requireCapability.ts CAPABILITY_MIN_RANK
 * and billingCatalog PLAN_RANK for unit tests (Deno edge code is not imported
 * into Vitest).
 */
const PLAN_RANK: Record<string, number> = {
  free: 0,
  starter: 0,
  pro: 2,
  elite: 2,
  enterprise: 4,
};

const CAPABILITY_MIN_RANK: Record<string, number> = {
  live_rehearsal: 0,
  advanced_hints: 0,
  mock_interview: 0,
  mock_test: 0,
  prep_star: 0,
  prep_coding: 0,
  detailed_debrief: 0,
  public_share: 0,
  desktop_overlay: 2,
  analytics: 2,
  company_research: 2,
  calendar_sync: 2,
  priority_models: 4,
};

function hasCapability(planId: string, capability: string): boolean {
  const rank = PLAN_RANK[planId] ?? -1;
  const need = CAPABILITY_MIN_RANK[capability] ?? 999;
  return rank >= need;
}

function requirePlanMin(planId: string, minimum: string): boolean {
  return (PLAN_RANK[planId] ?? -1) >= (PLAN_RANK[minimum] ?? 999);
}

describe("P0-3 server plan gating matrix", () => {
  it("rejects free for Pro-gated capabilities", () => {
    for (const cap of [
      "desktop_overlay",
      "analytics",
      "company_research",
      "calendar_sync",
    ] as const) {
      expect(hasCapability("free", cap)).toBe(false);
      expect(hasCapability("pro", cap)).toBe(true);
    }
  });

  it("allows free for limited free-tier capabilities", () => {
    for (const cap of [
      "live_rehearsal",
      "mock_interview",
      "prep_star",
      "mock_test",
    ] as const) {
      expect(hasCapability("free", cap)).toBe(true);
    }
  });

  it("requirePlan('pro') rejects free and starter (same rank as free)", () => {
    expect(requirePlanMin("free", "pro")).toBe(false);
    expect(requirePlanMin("starter", "pro")).toBe(false);
    expect(requirePlanMin("pro", "pro")).toBe(true);
    expect(requirePlanMin("enterprise", "pro")).toBe(true);
  });

  it("priority_models is Max/enterprise only", () => {
    expect(hasCapability("pro", "priority_models")).toBe(false);
    expect(hasCapability("enterprise", "priority_models")).toBe(true);
  });

  it("starter is never used as a minimum gate (pro is the sold unlock)", () => {
    // Documented decision: remapped requirePlan('starter') → 'pro'
    expect(PLAN_RANK.starter).toBe(PLAN_RANK.free);
    expect(requirePlanMin("free", "starter")).toBe(true); // why starter was a no-op
    expect(requirePlanMin("free", "pro")).toBe(false); // correct gate
  });
});
