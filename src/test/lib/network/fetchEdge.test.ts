// fetchEdge — private-mode blocking, RPC/edge error handling, credit-refresh sync
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const mockGetSession = vi.fn();
const mockGetPrivateMode = vi.fn(() => false);
const mockRefreshCredits = vi.fn().mockResolvedValue(50);

vi.mock("@/lib/supabase/client", () => ({
  supabase: {
    auth: {
      getSession: (...args: unknown[]) => mockGetSession(...args),
    },
  },
}));

vi.mock("@/store/userStore", () => {
  const state: any = {
    session: { access_token: "store-token" },
  };
  return {
    useAuthStore: Object.assign(() => state, { getState: () => state }),
  };
});

vi.mock("@/hooks/usePrivateMode", () => ({
  getPrivateMode: () => mockGetPrivateMode(),
}));

vi.mock("@/lib/env", () => ({
  EDGE_BASE: "https://edge.test/functions/v1",
  SUPABASE_PUBLISHABLE_KEY: "anon-key",
}));

vi.mock("@/lib/billing/creditsManager", () => ({
  refreshCredits: (...args: unknown[]) => mockRefreshCredits(...args),
}));

const originalFetch = global.fetch;

beforeEach(() => {
  vi.clearAllMocks();
  mockGetPrivateMode.mockReturnValue(false);
  mockGetSession.mockResolvedValue({
    data: { session: { access_token: "fresh-token" } },
    error: null,
  });
  global.fetch = vi.fn();
});

afterEach(() => {
  global.fetch = originalFetch;
});

describe("fetchEdge — private-mode blocking", () => {
  it("throws when private mode is enabled and function is not allowlisted", async () => {
    mockGetPrivateMode.mockReturnValue(true);
    const { fetchEdge } = await import("@/lib/network/fetchEdge");

    await expect(fetchEdge("deduct-credits", { action: "generate_hint" })).rejects.toThrow(
      /private mode/i,
    );
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it("allows allowlisted functions (e.g. ping) while private mode is enabled", async () => {
    mockGetPrivateMode.mockReturnValue(true);
    (global.fetch as any).mockResolvedValueOnce(
      new Response(JSON.stringify({ ok: true }), { status: 200 }),
    );
    const { fetchEdge } = await import("@/lib/network/fetchEdge");

    const res = await fetchEdge("ping", {});
    expect(res.ok).toBe(true);
    expect(global.fetch).toHaveBeenCalledTimes(1);
  });

  it("does not block calls when private mode is disabled", async () => {
    mockGetPrivateMode.mockReturnValue(false);
    (global.fetch as any).mockResolvedValueOnce(
      new Response(JSON.stringify({ ok: true }), { status: 200 }),
    );
    const { fetchEdge } = await import("@/lib/network/fetchEdge");

    const res = await fetchEdge("deduct-credits", { action: "generate_hint" });
    expect(res.ok).toBe(true);
  });
});

describe("fetchEdgeJson — RPC/edge error handling", () => {
  it("throws with server-provided error message on non-ok response", async () => {
    (global.fetch as any).mockResolvedValueOnce(
      new Response(JSON.stringify({ error: "deduct_credits RPC failed: insufficient funds" }), {
        status: 402,
      }),
    );
    const { fetchEdgeJson } = await import("@/lib/network/fetchEdge");

    await expect(fetchEdgeJson("deduct-credits", { action: "generate_hint" })).rejects.toThrow(
      /deduct_credits rpc failed/i,
    );
  });

  it("falls back to a generic HTTP-status message when body has no error/message", async () => {
    (global.fetch as any).mockResolvedValueOnce(new Response("", { status: 500 }));
    const { fetchEdgeJson } = await import("@/lib/network/fetchEdge");

    await expect(fetchEdgeJson("deduct-credits", { action: "generate_hint" })).rejects.toThrow(
      /failed with HTTP 500/,
    );
  });

  it("surfaces network/unreachable errors as a friendly message", async () => {
    (global.fetch as any).mockRejectedValueOnce(new TypeError("Failed to fetch"));
    const { fetchEdgeJson } = await import("@/lib/network/fetchEdge");

    await expect(fetchEdgeJson("deduct-credits", { action: "generate_hint" })).rejects.toThrow(
      /unreachable/i,
    );
  });
});

describe("fetchEdgeJson — credit balance sync after edge calls", () => {
  it("triggers refreshCredits after a successful credit-affecting call", async () => {
    (global.fetch as any).mockResolvedValueOnce(
      new Response(JSON.stringify({ data: { credits_remaining: 45 } }), { status: 200 }),
    );
    const { fetchEdgeJson } = await import("@/lib/network/fetchEdge");

    await fetchEdgeJson("deduct-credits", { action: "generate_hint" });

    expect(mockRefreshCredits).toHaveBeenCalledTimes(1);
  });

  it("skips refreshCredits for functions that do not touch credits", async () => {
    (global.fetch as any).mockResolvedValueOnce(
      new Response(JSON.stringify({ data: { url: "https://stripe.test" } }), { status: 200 }),
    );
    const { fetchEdgeJson } = await import("@/lib/network/fetchEdge");

    await fetchEdgeJson("create-checkout", {});

    expect(mockRefreshCredits).not.toHaveBeenCalled();
  });

  it("does not call refreshCredits when the edge call fails", async () => {
    (global.fetch as any).mockResolvedValueOnce(
      new Response(JSON.stringify({ error: "boom" }), { status: 500 }),
    );
    const { fetchEdgeJson } = await import("@/lib/network/fetchEdge");

    await expect(fetchEdgeJson("deduct-credits", { action: "generate_hint" })).rejects.toThrow();
    expect(mockRefreshCredits).not.toHaveBeenCalled();
  });
});
