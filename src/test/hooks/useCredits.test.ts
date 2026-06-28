// ─────────────────────────────────────────────────────────────────────────────
// useCredits.test.ts — Tests for useCredits hook against current API:
//   balance, isLow, isEmpty, canAfford(action), deduct(action), refund, refresh
// Catalog refs: T-0120..T-0129 (credits & deduction)
// ─────────────────────────────────────────────────────────────────────────────

import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, act } from "@testing-library/react";

const mockDeductCredits = vi.fn();
const mockRefreshCredits = vi.fn().mockResolvedValue(undefined);

vi.mock("@/lib/api/billing", () => ({
  deductCredits: (...args: unknown[]) => mockDeductCredits(...args),
}));

vi.mock("sonner", () => ({
  toast: {
    error: vi.fn(),
    warning: vi.fn(),
  },
}));

// Prevent env/supabase initialization errors during import chain
vi.mock("@/lib/supabase/client", () => ({
  supabase: {
    auth: {
      getSession: vi.fn().mockResolvedValue({ data: { session: null }, error: null }),
      onAuthStateChange: vi.fn(() => ({ data: { subscription: { unsubscribe: vi.fn() } } })),
    },
    from: vi.fn(() => ({
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValue({ data: null, error: null }),
      maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
    })),
  },
}));

vi.mock("@/lib/supabase/database", () => ({
  profilesDB: { getByIdMaybe: vi.fn(), update: vi.fn() },
  userRolesDB: { hasRole: vi.fn().mockResolvedValue(false) },
}));

vi.mock("@/lib/supabase/sessionCache", () => ({
  readCachedAuthSession: vi.fn(() => null),
  cacheAuthSession: vi.fn(),
  clearCachedAuthSession: vi.fn(),
}));

import { useAuthStore } from "@/store/authStore";
import { useCredits, CREDIT_COSTS } from "@/hooks/useCredits";

function seed(credits: number) {
  useAuthStore.setState({
    user: { id: "u1", email: "u@x.com" } as never,
    profile: { id: "u1", credits, plan_id: "free" } as never,
    session: { access_token: "tok" } as never,
    credits,
    isAuthenticated: true,
    isLoading: false,
    status: "authenticated",
    refreshCredits: mockRefreshCredits,
    setProfile: (profile) => {
      useAuthStore.setState({ profile: profile as never });
    },
  } as never);
}

beforeEach(() => {
  vi.clearAllMocks();
  mockRefreshCredits.mockResolvedValue(undefined);
  seed(50);
});

describe("useCredits — balance & flags [T-0120]", () => {
  it("returns balance from authStore.credits", () => {
    const { result } = renderHook(() => useCredits());
    expect(result.current.balance).toBe(50);
  });

  it("falls back to profile.credits when store credits unset", () => {
    useAuthStore.setState({ credits: undefined as never, profile: { id: "u1", credits: 33 } as never });
    const { result } = renderHook(() => useCredits());
    expect(result.current.balance).toBe(33);
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
  it("calls billing deductCredits API and updates balance on success", async () => {
    mockDeductCredits.mockResolvedValueOnce({
      credits_remaining: 49,
      transaction_id: "tx-1",
    });
    const { result } = renderHook(() => useCredits());

    let res: Awaited<ReturnType<typeof result.current.deduct>>;
    await act(async () => {
      res = await result.current.deduct("live_hint", "sess-1");
    });

    expect(mockDeductCredits).toHaveBeenCalledWith(
      {
        action: "live_hint",
        cost: CREDIT_COSTS.live_hint,
        session_id: "sess-1",
        reference_id: null,
      },
      expect.objectContaining({
        idempotencyKey: expect.stringMatching(/^credit:live_hint:/),
      })
    );
    expect(res!.success).toBe(true);
    expect(res!.newBalance).toBe(49);
    expect(res!.transactionId).toBe("tx-1");
    expect(mockRefreshCredits).toHaveBeenCalled();
  });

  it("blocks deduction when balance < cost (no API call)", async () => {
    seed(0);
    const { result } = renderHook(() => useCredits());

    let res: Awaited<ReturnType<typeof result.current.deduct>>;
    await act(async () => {
      res = await result.current.deduct("live_hint");
    });

    expect(mockDeductCredits).not.toHaveBeenCalled();
    expect(res!.success).toBe(false);
    expect(res!.error).toMatch(/not enough/i);
  });

  it("returns error from API failure", async () => {
    mockDeductCredits.mockRejectedValueOnce(new Error("deduction failed"));
    const { result } = renderHook(() => useCredits());

    let res: Awaited<ReturnType<typeof result.current.deduct>>;
    await act(async () => {
      res = await result.current.deduct("live_hint");
    });

    expect(res!.success).toBe(false);
    expect(res!.error).toBe("deduction failed");
    expect(mockRefreshCredits).toHaveBeenCalled();
  });
});

describe("useCredits — refund [T-0123]", () => {
  it("does not call deduct API (server-side refunds only)", async () => {
    mockRefreshCredits.mockImplementation(async () => {
      useAuthStore.setState({ credits: 42 });
    });
    const { result } = renderHook(() => useCredits());

    let res: Awaited<ReturnType<typeof result.current.refund>>;
    await act(async () => {
      res = await result.current.refund("live_hint");
    });

    expect(mockDeductCredits).not.toHaveBeenCalled();
    expect(res!.success).toBe(true);
    expect(res!.newBalance).toBe(42);
  });
});

describe("useCredits — refresh [T-0124]", () => {
  it("delegates to authStore.refreshCredits", async () => {
    const { result } = renderHook(() => useCredits());

    await act(async () => {
      await result.current.refresh();
    });

    expect(mockRefreshCredits).toHaveBeenCalled();
  });
});
