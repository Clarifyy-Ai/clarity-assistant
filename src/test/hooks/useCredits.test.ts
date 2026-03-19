// ─────────────────────────────────────────────────────────────────────────────
// useCredits.test.ts — Tests for the useCredits hook:
// balance reads, sufficiency checks, deduction flows,
// optimistic updates, plan-gate guards, and low-balance warnings.
// ─────────────────────────────────────────────────────────────────────────────

import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, act, waitFor }             from "@testing-library/react";

// ─── Mock Supabase ────────────────────────────────────────────────────────────

const mockUpdateCredits  = vi.fn();
const mockSelectCredits  = vi.fn();

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from: vi.fn(() => ({
      select:  vi.fn().mockReturnThis(),
      update:  vi.fn().mockReturnThis(),
      eq:      vi.fn().mockReturnThis(),
      single:  mockSelectCredits,
    })),
  },
}));

// ─── Mock stores ──────────────────────────────────────────────────────────────

import { useAuthStore }   from "@/store/authStore";
import { useGlobalStore } from "@/store/globalStore";

function setCredits(credits: number, planId = "pro") {
  useAuthStore.setState({
    credits,
    planId,
    user:    { id: "user-123", email: "test@example.com" } as never,
    status:  "authenticated",
    profile: { credits, plan_id: planId } as never,
  });
}

// ─── Import hook ──────────────────────────────────────────────────────────────

import { useCredits } from "@/hooks/useCredits";

// ─── Tests ────────────────────────────────────────────────────────────────────

describe("useCredits — balance reads", () => {
  beforeEach(() => {
    useAuthStore.setState({ credits: 50, planId: "pro", status: "authenticated" });
    vi.clearAllMocks();
  });

  it("returns current credit balance from the store", () => {
    setCredits(50);
    const { result } = renderHook(() => useCredits());
    expect(result.current.balance).toBe(50);
  });

  it("returns unlimited balance as -1 for enterprise plan", () => {
    setCredits(-1, "enterprise");
    const { result } = renderHook(() => useCredits());
    expect(result.current.balance).toBe(-1);
    expect(result.current.isUnlimited).toBe(true);
  });

  it("returns isUnlimited as false for non-enterprise plans", () => {
    setCredits(100, "pro");
    const { result } = renderHook(() => useCredits());
    expect(result.current.isUnlimited).toBe(false);
  });
});

// ─────────────────────────────────────────────────────────────────────────────

describe("useCredits — sufficiency checks", () => {
  it("hasEnough returns true when balance covers the cost", () => {
    setCredits(10);
    const { result } = renderHook(() => useCredits());
    expect(result.current.hasEnough(5)).toBe(true);
    expect(result.current.hasEnough(10)).toBe(true);
  });

  it("hasEnough returns false when balance is insufficient", () => {
    setCredits(3);
    const { result } = renderHook(() => useCredits());
    expect(result.current.hasEnough(5)).toBe(false);
  });

  it("hasEnough always returns true when unlimited", () => {
    setCredits(-1, "enterprise");
    const { result } = renderHook(() => useCredits());
    expect(result.current.hasEnough(9999)).toBe(true);
  });

  it("hasEnough returns false when balance is 0", () => {
    setCredits(0);
    const { result } = renderHook(() => useCredits());
    expect(result.current.hasEnough(1)).toBe(false);
  });
});

// ─────────────────────────────────────────────────────────────────────────────

describe("useCredits — low balance warnings", () => {
  it("isLow is true when balance is at or below the threshold (default 10)", () => {
    setCredits(5);
    const { result } = renderHook(() => useCredits());
    expect(result.current.isLow).toBe(true);
  });

  it("isLow is true at exactly the threshold", () => {
    setCredits(10);
    const { result } = renderHook(() => useCredits());
    expect(result.current.isLow).toBe(true);
  });

  it("isLow is false above the threshold", () => {
    setCredits(11);
    const { result } = renderHook(() => useCredits());
    expect(result.current.isLow).toBe(false);
  });

  it("isLow is false when unlimited", () => {
    setCredits(-1, "enterprise");
    const { result } = renderHook(() => useCredits());
    expect(result.current.isLow).toBe(false);
  });

  it("isEmpty is true when balance is 0", () => {
    setCredits(0);
    const { result } = renderHook(() => useCredits());
    expect(result.current.isEmpty).toBe(true);
  });

  it("isEmpty is false when balance is positive", () => {
    setCredits(1);
    const { result } = renderHook(() => useCredits());
    expect(result.current.isEmpty).toBe(false);
  });
});

// ─────────────────────────────────────────────────────────────────────────────

describe("useCredits — deductCredits", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockSelectCredits.mockResolvedValue({
      data:  { credits: 45 },
      error: null,
    });
  });

  it("optimistically deducts credits before server confirms", async () => {
    setCredits(50);
    const { result } = renderHook(() => useCredits());

    act(() => { result.current.deductOptimistic(5); });

    expect(useAuthStore.getState().credits).toBe(45);
  });

  it("deductCredits returns true on success and persists balance", async () => {
    setCredits(50);
    const { result } = renderHook(() => useCredits());

    let success: boolean | undefined;
    await act(async () => {
      success = await result.current.deductCredits(5, "generate_answer");
    });

    expect(success).toBe(true);
    expect(useAuthStore.getState().credits).toBe(45);
  });

  it("deductCredits returns false and rolls back when insufficient", async () => {
    setCredits(3);
    const { result } = renderHook(() => useCredits());

    let success: boolean | undefined;
    await act(async () => {
      success = await result.current.deductCredits(5, "generate_answer");
    });

    expect(success).toBe(false);
    expect(useAuthStore.getState().credits).toBe(3); // unchanged
  });

  it("rolls back optimistic deduction on server error", async () => {
    setCredits(50);
    mockSelectCredits.mockResolvedValueOnce({
      data: null, error: { message: "DB error" },
    });

    const { result } = renderHook(() => useCredits());

    await act(async () => {
      await result.current.deductCredits(5, "generate_answer");
    });

    // Balance should be restored on rollback
    expect(useAuthStore.getState().credits).toBe(50);
  });

  it("skips deduction entirely for unlimited plan", async () => {
    setCredits(-1, "enterprise");
    const { result } = renderHook(() => useCredits());

    let success: boolean | undefined;
    await act(async () => {
      success = await result.current.deductCredits(100, "generate_answer");
    });

    expect(success).toBe(true);
    expect(mockSelectCredits).not.toHaveBeenCalled();
  });
});

// ─────────────────────────────────────────────────────────────────────────────

describe("useCredits — canUseFeature", () => {
  it("returns true when user has enough credits and feature is enabled", () => {
    setCredits(20, "pro");
    useGlobalStore.setState({
      featureFlags: { generate_answer: true } as never,
    });

    const { result } = renderHook(() => useCredits());
    expect(result.current.canUseFeature("generate_answer", 2)).toBe(true);
  });

  it("returns false when feature is gated (flag disabled)", () => {
    setCredits(100, "free");
    useGlobalStore.setState({
      featureFlags: { company_research: false } as never,
    });

    const { result } = renderHook(() => useCredits());
    expect(result.current.canUseFeature("company_research", 3)).toBe(false);
  });

  it("returns false when feature is enabled but credits are insufficient", () => {
    setCredits(1, "pro");
    useGlobalStore.setState({
      featureFlags: { session_debrief: true } as never,
    });

    const { result } = renderHook(() => useCredits());
    expect(result.current.canUseFeature("session_debrief", 5)).toBe(false);
  });
});

// ─────────────────────────────────────────────────────────────────────────────

describe("useCredits — refreshCredits", () => {
  it("refreshes balance from the server", async () => {
    setCredits(10);
    mockSelectCredits.mockResolvedValueOnce({
      data: { credits: 75 }, error: null,
    });

    const { result } = renderHook(() => useCredits());

    await act(async () => {
      await result.current.refreshCredits();
    });

    expect(useAuthStore.getState().credits).toBe(75);
  });

  it("does not update state when refresh fails", async () => {
    setCredits(10);
    mockSelectCredits.mockResolvedValueOnce({
      data: null, error: { message: "Timeout" },
    });

    const { result } = renderHook(() => useCredits());

    await act(async () => {
      await result.current.refreshCredits();
    });

    expect(useAuthStore.getState().credits).toBe(10); // unchanged
  });
});
