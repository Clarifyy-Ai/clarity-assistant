// creditsManager — gaps not covered by creditsManager.test.ts:
//   - deductCreditsForAction: 402 (insufficient) race triggers refreshCredits + surfaces server error
//   - deductCreditsForAction: generic RPC/HTTP failure is caught and reported
//   - deductCreditsForAction: success path syncs profile balance + fires low-credit warning
//   - refreshCredits: success sync, no-user short-circuit, and DB-error fallback
import { describe, it, expect, vi, beforeEach } from "vitest";

function makeAuthState(overrides: any = {}) {
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
    updateProfile: vi.fn(),
    setProfile: vi.fn((next: any) => {
      state.profile = next;
    }),
    ...overrides,
  };
  return state;
}

let authState = makeAuthState();
const mockOpenUpgradeModal = vi.fn();
const mockFetchEdge = vi.fn();
let supabaseResult: { data: any; error: any } = { data: null, error: null };

vi.mock("@/store/userStore", () => ({
  useAuthStore: Object.assign(() => authState, { getState: () => authState }),
}));

vi.mock("@/store/uiStore", () => {
  const ui = { openUpgradeModal: mockOpenUpgradeModal };
  return { useUIStore: Object.assign(() => ui, { getState: () => ui }) };
});

vi.mock("@/lib/network/fetchEdge", () => ({
  fetchEdge: (...args: unknown[]) => mockFetchEdge(...args),
}));

vi.mock("@/lib/supabase/client", () => ({
  supabase: {
    from: () => ({
      select: () => ({
        eq: () => ({
          maybeSingle: async () => supabaseResult,
        }),
      }),
    }),
  },
}));

beforeEach(() => {
  vi.clearAllMocks();
  authState = makeAuthState();
  supabaseResult = { data: null, error: null };
});

describe("deductCreditsForAction — 402 refund/race handling", () => {
  it("refreshes credits and surfaces the server error when edge returns 402", async () => {
    supabaseResult = { data: { credits: 3, plan_id: "free", subscription_status: "active" }, error: null };
    mockFetchEdge.mockResolvedValueOnce({
      ok: false,
      status: 402,
      json: async () => ({ error: "Insufficient credits (server-verified)" }),
    });

    const { deductCreditsForAction } = await import("@/lib/billing/creditsManager");
    const result = await deductCreditsForAction("liveanswershort");

    expect(result.success).toBe(false);
    expect(result.error).toBe("Insufficient credits (server-verified)");
    // refreshCredits() was invoked internally and synced the store from the DB row.
    expect(result.creditsRemaining).toBe(3);
    expect(authState.setProfile).toHaveBeenCalledWith(
      expect.objectContaining({ credits: 3 }),
    );
    expect(authState.updateProfile).not.toHaveBeenCalled();
  });

  it("falls back to a generic insufficient-credits message when body has no error", async () => {
    supabaseResult = { data: { credits: 0, plan_id: "free", subscription_status: "active" }, error: null };
    mockFetchEdge.mockResolvedValueOnce({
      ok: false,
      status: 402,
      json: async () => null,
    });

    const { deductCreditsForAction } = await import("@/lib/billing/creditsManager");
    const result = await deductCreditsForAction("liveanswershort");

    expect(result.success).toBe(false);
    expect(result.error).toBe("Insufficient credits");
  });
});

describe("deductCreditsForAction — RPC/edge failure handling", () => {
  it("catches non-402 HTTP failures and reports a descriptive error without mutating balance", async () => {
    mockFetchEdge.mockResolvedValueOnce({
      ok: false,
      status: 500,
      json: async () => ({ error: "deduct_credits RPC failed" }),
    });

    const { deductCreditsForAction } = await import("@/lib/billing/creditsManager");
    const result = await deductCreditsForAction("liveanswershort");

    expect(result.success).toBe(false);
    expect(result.error).toMatch(/credit deduction failed: 500/i);
    expect(result.creditsRemaining).toBe(50);
    expect(authState.updateProfile).not.toHaveBeenCalled();
  });

  it("catches thrown/network errors from fetchEdge", async () => {
    mockFetchEdge.mockRejectedValueOnce(new Error("network unreachable"));

    const { deductCreditsForAction } = await import("@/lib/billing/creditsManager");
    const result = await deductCreditsForAction("liveanswershort");

    expect(result.success).toBe(false);
    expect(result.error).toBe("network unreachable");
    expect(result.creditsRemaining).toBe(50);
  });
});

describe("deductCreditsForAction — success path balance sync", () => {
  it("syncs the store balance from the edge response on success", async () => {
    mockFetchEdge.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ credits_remaining: 44 }),
    });

    const { deductCreditsForAction } = await import("@/lib/billing/creditsManager");
    const result = await deductCreditsForAction("liveanswershort");

    expect(result.success).toBe(true);
    expect(result.creditsRemaining).toBe(44);
    expect(authState.setProfile).toHaveBeenCalledWith(
      expect.objectContaining({ credits: 44 }),
    );
    expect(authState.updateProfile).not.toHaveBeenCalled();
    expect(mockOpenUpgradeModal).not.toHaveBeenCalled();
  });

  it("fires the low-credit upgrade warning when remaining balance drops below the threshold", async () => {
    mockFetchEdge.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ credits_remaining: 2 }),
    });

    const { deductCreditsForAction } = await import("@/lib/billing/creditsManager");
    const result = await deductCreditsForAction("liveanswershort");

    expect(result.success).toBe(true);
    expect(mockOpenUpgradeModal).toHaveBeenCalledWith("low_credits");
  });

  it("fires the out-of-credits warning when remaining balance is zero", async () => {
    mockFetchEdge.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ credits_remaining: 0 }),
    });

    const { deductCreditsForAction } = await import("@/lib/billing/creditsManager");
    await deductCreditsForAction("liveanswershort");

    expect(mockOpenUpgradeModal).toHaveBeenCalledWith("out_of_credits");
  });
});

describe("refreshCredits — balance sync from DB", () => {
  it("returns null and does not touch the store when there is no authenticated user", async () => {
    authState = makeAuthState({ user: null });
    const { refreshCredits } = await import("@/lib/billing/creditsManager");

    const result = await refreshCredits();

    expect(result).toBeNull();
    expect(authState.updateProfile).not.toHaveBeenCalled();
  });

  it("syncs credits, plan, and subscription_status into the profile on success", async () => {
    supabaseResult = {
      data: { credits: 77, plan_id: "pro", subscription_status: "trialing" },
      error: null,
    };
    const { refreshCredits } = await import("@/lib/billing/creditsManager");

    const result = await refreshCredits();

    expect(result).toBe(77);
    expect(authState.setProfile).toHaveBeenCalledWith(
      expect.objectContaining({
        credits: 77,
        plan: "pro",
        plan_id: "pro",
        subscription_status: "trialing",
      }),
    );
    expect(authState.updateProfile).not.toHaveBeenCalled();
  });

  it("returns null and skips the profile update when the DB call errors", async () => {
    supabaseResult = { data: null, error: { message: "db down" } };
    const { refreshCredits } = await import("@/lib/billing/creditsManager");

    const result = await refreshCredits();

    expect(result).toBeNull();
    expect(authState.updateProfile).not.toHaveBeenCalled();
  });
});
