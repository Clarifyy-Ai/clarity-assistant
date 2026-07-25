// Credits manager — covers Billing P0 items (insufficient credits, BYOK bypass)
import { describe, it, expect, vi, beforeEach } from "vitest";
import { CREDIT_COSTS } from "@/lib/billing/creditsManager";

// Mock authStore + supabase so creditsManager doesn't hit the network
vi.mock("@/store/userStore", () => {
  const state: any = {
    profile: {
      id: "u1",
      credits: 50,
      plan: "free",
      plan_id: "free",
      subscription_status: "active",
      byok_gemini: false,
      byok_openai: false,
      byok_anthropic: false,
    },
    user: { id: "u1" },
    updateProfile: vi.fn((patch: any) => Object.assign(state.profile, patch)),
  };
  return {
    useAuthStore: Object.assign(
      () => state,
      { getState: () => state },
    ),
  };
});

vi.mock("@/store/uiStore", () => {
  const ui = { openUpgradeModal: vi.fn() };
  return {
    useUIStore: Object.assign(() => ui, { getState: () => ui }),
  };
});

vi.mock("@/lib/network/fetchEdge", () => ({
  getAuthHeaders: async () => ({ "Content-Type": "application/json" }),
}));

vi.mock("@/lib/supabase/client", () => ({
  supabase: {
    from: () => ({
      select: () => ({
        eq: () => ({
          single: async () => ({ data: null, error: null }),
        }),
      }),
    }),
  },
}));

vi.mock("@/lib/env", () => ({ EDGE_BASE: "https://edge.test" }));

describe("CREDIT_COSTS table", () => {
  it("has positive cost for every action", () => {
    Object.values(CREDIT_COSTS).forEach((cost) => {
      expect(cost).toBeGreaterThan(0);
    });
  });
  it("liveanswerlong > liveanswershort", () => {
    expect(CREDIT_COSTS.liveanswerlong).toBeGreaterThan(
      CREDIT_COSTS.liveanswershort,
    );
  });
});

describe("deductCreditsForAction – pre-flight checks", () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it("returns insufficient when balance < cost", async () => {
    vi.doMock("@/store/userStore", () => {
      const state: any = {
        profile: { id: "u1", credits: 1, plan_id: "free" },
        user: { id: "u1" },
        updateProfile: vi.fn(),
      };
      return {
        useAuthStore: Object.assign(() => state, { getState: () => state }),
      };
    });
    const { deductCreditsForAction } = await import(
      "@/lib/billing/creditsManager"
    );
    const r = await deductCreditsForAction("liveanswerlong");
    expect(r.success).toBe(false);
    expect(r.error).toMatch(/insufficient/i);
  });

  it("BYOK flags do not bypass deduction", async () => {
    vi.doMock("@/store/userStore", () => {
      const state: any = {
        profile: {
          id: "u1",
          credits: 0,
          plan_id: "free",
          byok_gemini: true,
        },
        user: { id: "u1" },
        updateProfile: vi.fn(),
      };
      return {
        useAuthStore: Object.assign(() => state, { getState: () => state }),
      };
    });
    const { deductCreditsForAction } = await import(
      "@/lib/billing/creditsManager"
    );
    const r = await deductCreditsForAction("liveanswerlong");
    expect(r.success).toBe(false);
    expect(r.error).toMatch(/insufficient/i);
  });

  it("Returns auth error when no profile", async () => {
    vi.doMock("@/store/userStore", () => {
      const state: any = { profile: null, user: null, updateProfile: vi.fn() };
      return {
        useAuthStore: Object.assign(() => state, { getState: () => state }),
      };
    });
    const { deductCreditsForAction } = await import(
      "@/lib/billing/creditsManager"
    );
    const r = await deductCreditsForAction("generate_hint");
    expect(r.success).toBe(false);
    expect(r.error).toMatch(/not authenticated/i);
  });
});
