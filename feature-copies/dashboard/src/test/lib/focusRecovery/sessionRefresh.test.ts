import { describe, it, expect, vi, beforeEach } from "vitest";

const getSession = vi.fn();
const refreshSession = vi.fn();
const reset = vi.fn();
const redirect = vi.fn();

vi.mock("@/lib/supabase/client", () => ({
  supabase: {
    auth: {
      getSession: (...args: unknown[]) => getSession(...args),
      refreshSession: (...args: unknown[]) => refreshSession(...args),
    },
  },
}));

vi.mock("@/store/authStore", () => ({
  useAuthStore: Object.assign(
    vi.fn(),
    {
      getState: () => ({
        status: "authenticated",
        session: { access_token: "old", expires_at: Math.floor(Date.now() / 1000) + 3600 },
        user: { id: "u1" },
        reset,
      }),
      setState: vi.fn(),
    },
  ),
}));

vi.mock("@/lib/auth/sessionErrors", async () => {
  const actual = await vi.importActual<typeof import("@/lib/auth/sessionErrors")>(
    "@/lib/auth/sessionErrors",
  );
  return {
    ...actual,
    redirectToSessionExpiredLogin: (...args: unknown[]) => redirect(...args),
  };
});

import {
  ensureAuthSession,
  isSessionNearExpiry,
  __resetSessionRefreshForTests,
} from "@/lib/focusRecovery/sessionRefresh";

describe("ensureAuthSession", () => {
  beforeEach(() => {
    __resetSessionRefreshForTests();
    getSession.mockReset();
    refreshSession.mockReset();
    reset.mockReset();
    redirect.mockReset();
  });

  it("returns the current session without refreshing when far from expiry", async () => {
    const session = {
      access_token: "fresh",
      expires_at: Math.floor(Date.now() / 1000) + 3600,
      user: { id: "u1" },
    };
    getSession.mockResolvedValue({ data: { session }, error: null });

    const first = ensureAuthSession();
    const second = ensureAuthSession();
    const [a, b] = await Promise.all([first, second]);

    expect(getSession).toHaveBeenCalledTimes(1);
    expect(refreshSession).not.toHaveBeenCalled();
    expect(a.session).toEqual(session);
    expect(b.session).toEqual(session);
    expect(a.refreshed).toBe(false);
  });

  it("refreshes once when the token is near expiry", async () => {
    const expiring = {
      access_token: "old",
      expires_at: Math.floor(Date.now() / 1000) + 10,
      user: { id: "u1" },
    };
    const next = {
      access_token: "new",
      expires_at: Math.floor(Date.now() / 1000) + 3600,
      user: { id: "u1" },
    };
    getSession.mockResolvedValue({ data: { session: expiring }, error: null });
    refreshSession.mockResolvedValue({ data: { session: next }, error: null });

    const result = await ensureAuthSession();
    expect(refreshSession).toHaveBeenCalledTimes(1);
    expect(result.refreshed).toBe(true);
    expect(result.session).toEqual(next);
  });

  it("treats an invalid refresh token as an expired session", async () => {
    getSession.mockResolvedValue({
      data: { session: null },
      error: new Error("Invalid Refresh Token: Refresh Token Not Found"),
    });

    const result = await ensureAuthSession();
    expect(result.expired).toBe(true);
    expect(reset).toHaveBeenCalled();
    expect(redirect).toHaveBeenCalled();
  });

  it("does not expire the working session on a transient probe failure", async () => {
    getSession.mockResolvedValue({
      data: { session: null },
      error: new Error("Failed to fetch"),
    });

    const result = await ensureAuthSession();
    expect(result.expired).toBe(false);
    expect(result.probeFailed).toBe(true);
    expect(reset).not.toHaveBeenCalled();
  });

  it("forceRefresh does not join a soft in-flight that skips refresh", async () => {
    const far = {
      access_token: "stale-jwt",
      expires_at: Math.floor(Date.now() / 1000) + 3600,
      user: { id: "u1" },
    };
    const next = {
      access_token: "rotated-jwt",
      expires_at: Math.floor(Date.now() / 1000) + 3600,
      user: { id: "u1" },
    };
    let releaseGet!: () => void;
    const gate = new Promise<void>((resolve) => {
      releaseGet = resolve;
    });
    getSession.mockImplementation(async () => {
      await gate;
      return { data: { session: far }, error: null };
    });
    refreshSession.mockResolvedValue({ data: { session: next }, error: null });

    const soft = ensureAuthSession();
    const forced = ensureAuthSession({ forceRefresh: true });
    releaseGet();
    const [softResult, forcedResult] = await Promise.all([soft, forced]);

    expect(refreshSession).toHaveBeenCalled();
    expect(forcedResult.refreshed).toBe(true);
    expect(forcedResult.session?.access_token).toBe("rotated-jwt");
    expect(softResult.session?.access_token).toBe("stale-jwt");
  });
});

describe("isSessionNearExpiry", () => {
  it("is true within the skew window", () => {
    const now = 1_000_000;
    expect(isSessionNearExpiry(now / 1000 + 30, now, 60_000)).toBe(true);
    expect(isSessionNearExpiry(now / 1000 + 600, now, 60_000)).toBe(false);
  });
});
