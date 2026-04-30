// @ts-nocheck
// ─────────────────────────────────────────────────────────────────────────────
// useCredits.test.ts — Tests for useCredits hook against current API:
//   balance, isLow, isEmpty, canAfford(action), deduct(action), refund, refresh
// Catalog refs: T-0120..T-0129 (credits & deduction)
// ─────────────────────────────────────────────────────────────────────────────

import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, act } from "@testing-library/react";

// ─── Supabase mock ───────────────────────────────────────────────────────────
const mockRpc          = vi.fn();
const singleQueue: Array<{ data: any; error: any }> = [];
const mockSingleSelect = {
  mockResolvedValueOnce(v: { data: any; error: any }) { singleQueue.push(v); return this; },
};

function chain() {
  const c: any = {};
  c.select = vi.fn(() => c);
  c.update = vi.fn(() => c);
  c.insert = vi.fn(() => c);
  c.eq     = vi.fn(() => c);
  c.single = vi.fn(async () =>
    singleQueue.shift() ?? { data: { id: "u1", credits: 0 }, error: null }
  );
  return c;
}

vi.mock("@/lib/supabase/client", () => ({
  supabase: {
    rpc:  (...args: unknown[]) => mockRpc(...args),
    from: vi.fn(() => chain()),
  },
}));

import { useAuthStore } from "@/store/authStore";
import { useCredits, CREDIT_COSTS } from "@/hooks/useCredits";

function seed(credits: number) {
  useAuthStore.setState({
    user:    { id: "u1", email: "u@x.com" } as never,
    profile: { id: "u1", credits } as never,
    session: { access_token: "tok" } as never,
    isAuthenticated: true,
    isLoading: false,
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  seed(50);
});

describe("useCredits — balance & flags [T-0120]", () => {
  it("returns balance from profile", () => {
    const { result } = renderHook(() => useCredits());
    expect(result.current.balance).toBe(50);
  });

  it("flags isLow when balance <= 2", () => {
    seed(2);
    const { result } = renderHook(() => useCredits());
    expect(result.current.isLow).toBe(true);
    expect(result.current.isEmpty).toBe(false);
  });

  it("flags isEmpty when balance is 0", () => {
    seed(0);
    const { result } = renderHook(() => useCredits());
    expect(result.current.isEmpty).toBe(true);
  });
});

describe("useCredits — canAfford [T-0121]", () => {
  it("true when balance covers cost", () => {
    seed(20);
    const { result } = renderHook(() => useCredits());
    expect(result.current.canAfford("live_hint")).toBe(true);
  });

  it("false when insufficient", () => {
    seed(1);
    const { result } = renderHook(() => useCredits());
    expect(result.current.canAfford("company_brief")).toBe(false);
  });
});

describe("useCredits — deduct [T-0122]", () => {
  it("calls deduct_credits RPC and updates balance on success", async () => {
    mockRpc.mockResolvedValueOnce({ data: { new_balance: 49 }, error: null });
    const { result } = renderHook(() => useCredits());

    let res: any;
    await act(async () => {
      res = await result.current.deduct("live_hint", "sess-1");
    });

    expect(mockRpc).toHaveBeenCalledWith("deduct_credits", {
      p_action:     "live_hint",
      p_cost:       CREDIT_COSTS.live_hint,
      p_session_id: "sess-1",
    });
    expect(res.success).toBe(true);
    expect(res.newBalance).toBe(49);
  });

  it("blocks deduction when balance < cost (no RPC call)", async () => {
    seed(0);
    const { result } = renderHook(() => useCredits());

    let res: any;
    await act(async () => {
      res = await result.current.deduct("live_hint");
    });

    expect(mockRpc).not.toHaveBeenCalled();
    expect(res.success).toBe(false);
    expect(res.error).toMatch(/not enough/i);
  });

  it("returns error from RPC failure", async () => {
    mockRpc.mockResolvedValueOnce({ data: null, error: { message: "rpc fail" } });
    const { result } = renderHook(() => useCredits());

    let res: any;
    await act(async () => {
      res = await result.current.deduct("live_hint");
    });

    expect(res.success).toBe(false);
    expect(res.error).toBe("rpc fail");
  });
});

describe("useCredits — refund [T-0123]", () => {
  it("calls refund_credits RPC with cost", async () => {
    mockRpc.mockResolvedValueOnce({ data: null, error: null });
    const { result } = renderHook(() => useCredits());

    await act(async () => {
      await result.current.refund("live_hint");
    });

    expect(mockRpc).toHaveBeenCalledWith("refund_credits", {
      p_cost: CREDIT_COSTS.live_hint,
    });
  });
});

describe("useCredits — refresh [T-0124]", () => {
  it("re-reads credits from profiles", async () => {
    mockSingleSelect.mockResolvedValueOnce({ data: { credits: 99 }, error: null });
    const { result } = renderHook(() => useCredits());

    await act(async () => {
      await result.current.refresh();
    });

    expect(useAuthStore.getState().profile?.credits).toBe(99);
  });
});
