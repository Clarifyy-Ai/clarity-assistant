// fetchEdge — private-mode blocking, RPC/edge error handling, credit-refresh sync
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
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
  ENV: {
    STRIPE_PRICE_STARTER_MONTHLY: "price_mock_starter_m",
    STRIPE_PRICE_STARTER_YEARLY: "price_mock_starter_y",
    STRIPE_PRICE_PRO_MONTHLY: "price_mock_pro_m",
    STRIPE_PRICE_PRO_YEARLY: "price_mock_pro_y",
    STRIPE_PRICE_ELITE_MONTHLY: "price_mock_elite_m",
    STRIPE_PRICE_ELITE_YEARLY: "price_mock_elite_y",
    STRIPE_PRICE_ENTERPRISE_MONTHLY: "price_mock_ent_m",
    STRIPE_PRICE_ENTERPRISE_YEARLY: "price_mock_ent_y",
  },
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
  it("throws when private mode is enabled and function is not allowlisted", { timeout: 15_000 }, async () => {
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

  it("allows support-chat while private mode is enabled", async () => {
    mockGetPrivateMode.mockReturnValue(true);
    (global.fetch as any).mockResolvedValueOnce(
      new Response(JSON.stringify({ ok: true }), { status: 200 }),
    );
    const { fetchEdge } = await import("@/lib/network/fetchEdge");

    const res = await fetchEdge("support-chat", { action: "list" });
    expect(res.ok).toBe(true);
    expect(global.fetch).toHaveBeenCalledTimes(1);
  });

  it("allows hybrid-health while private mode is enabled (admin diagnostics)", async () => {
    mockGetPrivateMode.mockReturnValue(true);
    (global.fetch as any).mockResolvedValueOnce(
      new Response(JSON.stringify({ edge: "ok" }), { status: 200 }),
    );
    const { fetchEdge } = await import("@/lib/network/fetchEdge");

    const res = await fetchEdge("hybrid-health", {});
    expect(res.ok).toBe(true);
  });

  it("allows collect-exam-papers while private mode is enabled", async () => {
    mockGetPrivateMode.mockReturnValue(true);
    (global.fetch as any).mockResolvedValueOnce(
      new Response(JSON.stringify({ collected: 0 }), { status: 200 }),
    );
    const { fetchEdge } = await import("@/lib/network/fetchEdge");

    const res = await fetchEdge("collect-exam-papers", { exam_type: "UPSC" });
    expect(res.ok).toBe(true);
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

  it("falls back to a generic message when body has no error/message", async () => {
    (global.fetch as any).mockResolvedValueOnce(new Response("", { status: 500 }));
    const { fetchEdgeJson } = await import("@/lib/network/fetchEdge");

    let message = "";
    try {
      await fetchEdgeJson("deduct-credits", { action: "generate_hint" });
    } catch (err) {
      message = err instanceof Error ? err.message : String(err);
    }
    expect(message).toMatch(/Something went wrong/i);
    expect(message).not.toMatch(/HTTP\s+\d{3}/i);
  });

  it("surfaces network/unreachable errors as a friendly message", async () => {
    (global.fetch as any).mockRejectedValue(new TypeError("Failed to fetch"));
    const { fetchEdgeJson } = await import("@/lib/network/fetchEdge");

    await expect(fetchEdgeJson("deduct-credits", { action: "generate_hint" })).rejects.toThrow(
      /AI request did not go through/i,
    );
  });

  it("retries Failed to fetch once then succeeds for non-mutating calls", async () => {
    (global.fetch as any)
      .mockRejectedValueOnce(new TypeError("Failed to fetch"))
      .mockResolvedValueOnce(new Response(JSON.stringify({ ok: true }), { status: 200 }));
    const { fetchEdgeJson } = await import("@/lib/network/fetchEdge");

    await expect(fetchEdgeJson("get-exam-details", { examId: "e1" })).resolves.toEqual({ ok: true });
    const edgeCalls = (global.fetch as ReturnType<typeof vi.fn>).mock.calls.filter((call) =>
      String(call[0] ?? "").includes("get-exam-details"),
    );
    expect(edgeCalls).toHaveLength(2);
  });

  it("does not retry search-exams after Failed to fetch", async () => {
    (global.fetch as any).mockRejectedValue(new TypeError("Failed to fetch"));
    const { fetchEdgeJson } = await import("@/lib/network/fetchEdge");

    await expect(fetchEdgeJson("search-exams", { q: "" })).rejects.toThrow(
      /Couldn't reach the server/i,
    );
    expect(global.fetch).toHaveBeenCalledTimes(1);
  });

  it("does not retry create-exam-paper after Failed to fetch", async () => {
    (global.fetch as any).mockRejectedValue(new TypeError("Failed to fetch"));
    const { fetchEdgeJson } = await import("@/lib/network/fetchEdge");

    await expect(fetchEdgeJson("create-exam-paper", { examId: "e1" })).rejects.toThrow(
      /Couldn't reach the server/i,
    );
    expect(global.fetch).toHaveBeenCalledTimes(1);
  });

  it("does not name delete-account on network failure", async () => {
    (global.fetch as any).mockRejectedValue(new TypeError("Failed to fetch"));
    const { fetchEdgeJson } = await import("@/lib/network/fetchEdge");

    let message = "";
    try {
      await fetchEdgeJson("delete-account", { confirmation: "DELETE" });
    } catch (err) {
      message = err instanceof Error ? err.message : String(err);
    }
    expect(message).toMatch(/couldn't complete account deletion/i);
    expect(message).not.toMatch(/Edge Function|CORS/i);
  });

  it("does not retry submit-test after Failed to fetch", async () => {
    (global.fetch as any).mockRejectedValue(new TypeError("Failed to fetch"));
    const { fetchEdgeJson } = await import("@/lib/network/fetchEdge");

    await expect(fetchEdgeJson("submit-test", { test_id: "t1" })).rejects.toThrow(
      /Couldn't reach the server/i,
    );
    expect(global.fetch).toHaveBeenCalledTimes(1);
  });

  it("logs network.request.business for expected 409 without requiring correlation id", async () => {
    const { logger } = await import("@/lib/logger");
    const info = vi.spyOn(logger, "info").mockImplementation(() => {});
    const warn = vi.spyOn(logger, "warn").mockImplementation(() => {});
    (global.fetch as any).mockResolvedValueOnce(
      new Response(JSON.stringify({ code: "SUBMISSION_CONFLICT", error: "conflict" }), {
        status: 409,
      }),
    );
    const { fetchEdgeJson } = await import("@/lib/network/fetchEdge");
    const { ApiClientError } = await import("@/lib/api/apiClient");

    await expect(fetchEdgeJson("submit-test", { test_id: "t1" })).rejects.toBeInstanceOf(
      ApiClientError,
    );
    expect(info).toHaveBeenCalledWith(
      "network.request.business",
      expect.objectContaining({
        fnName: "submit-test",
        status: 409,
        code: "SUBMISSION_CONFLICT",
        outcome: "skipped",
        retryable: false,
      }),
    );
    expect(warn).not.toHaveBeenCalledWith("network.request.failed", expect.anything());
    info.mockRestore();
    warn.mockRestore();
  });

  it("logs network.request.failed for unexpected errors even without correlation id", async () => {
    const { logger } = await import("@/lib/logger");
    const warn = vi.spyOn(logger, "warn").mockImplementation(() => {});
    (global.fetch as any).mockResolvedValueOnce(
      new Response(JSON.stringify({ code: "API_ERROR", error: "boom" }), { status: 500 }),
    );
    const { fetchEdgeJson } = await import("@/lib/network/fetchEdge");

    await expect(fetchEdgeJson("deduct-credits", { action: "generate_hint" })).rejects.toThrow();
    expect(warn).toHaveBeenCalledWith(
      "network.request.failed",
      expect.objectContaining({
        fnName: "deduct-credits",
        status: 500,
        code: "API_ERROR",
      }),
    );
    warn.mockRestore();
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

describe("fetchEdge request budget", () => {
  it("times out a hung session probe instead of spinning forever", async () => {
    mockGetSession.mockReturnValue(new Promise(() => {}));
    const { fetchEdgeJson } = await import("@/lib/network/fetchEdge");
    const { __resetSessionRefreshForTests } = await import(
      "@/lib/focusRecovery/sessionRefresh"
    );

    await expect(
      fetchEdgeJson("search-exams", { q: "ssc" }, { timeoutMs: 25 }),
    ).rejects.toThrow(/timed out/i);
    expect(global.fetch).not.toHaveBeenCalled();
    __resetSessionRefreshForTests();
  });
});

describe("fetchEdge allowlists", () => {
  it("does not reference the ghost create-portal-session slug", () => {
    const source = readFileSync(
      path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../lib/network/fetchEdge.ts"),
      "utf8",
    );
    expect(source).not.toContain("create-portal-session");
    expect(source).toContain("create-billing-portal");
  });
});
