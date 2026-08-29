import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import {
  AUTH_ACCOUNT_FRIENDLY_ERROR,
  AUTH_INVALID_CREDENTIALS_MESSAGE,
  buildResolvedAccountContext,
  canRetryAccountRecovery,
  classifyAccountLoadFailure,
  createInFlightMap,
  isTimeoutError,
  normalizeLoginEmail,
  shouldDetectSessionInUrl,
  shouldLoadAccountOnAuthEvent,
  shouldSkipSoftProfileRefresh,
  userFacingAccountError,
  withTimeout,
} from "@/lib/auth/accountBootstrap";

describe("normalizeLoginEmail", () => {
  it("trims and lowercases without altering the password path", () => {
    expect(normalizeLoginEmail("  Free.User@Example.COM ")).toBe(
      "free.user@example.com",
    );
  });
});

describe("classifyAccountLoadFailure / userFacingAccountError", () => {
  it("maps invalid credentials and timeouts to safe copy", () => {
    expect(classifyAccountLoadFailure(new Error("Invalid login credentials"))).toBe(
      "invalid_credentials",
    );
    expect(classifyAccountLoadFailure(new Error("Role check timed out after 4s"))).toBe(
      "timeout",
    );
    expect(userFacingAccountError("invalid_credentials")).toBe(
      AUTH_INVALID_CREDENTIALS_MESSAGE,
    );
    expect(AUTH_INVALID_CREDENTIALS_MESSAGE).toMatch(/Incorrect email or password/i);
    expect(userFacingAccountError("timeout")).toBe(AUTH_ACCOUNT_FRIENDLY_ERROR);
    expect(userFacingAccountError("unknown")).not.toMatch(/PGRST|postgres|jwt/i);
  });

  it("detects timeout errors", () => {
    expect(isTimeoutError(new Error("Profile load timed out after 6s"))).toBe(true);
    expect(isTimeoutError(new Error("network down"))).toBe(false);
  });
});

describe("withTimeout", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("resolves when the promise wins", async () => {
    const p = withTimeout(Promise.resolve("ok"), 1000, "Test");
    await expect(p).resolves.toBe("ok");
  });

  it("rejects with a labeled timeout", async () => {
    const pending = withTimeout(new Promise<string>(() => {}), 1000, "Role check");
    const assertion = expect(pending).rejects.toThrow(/Role check timed out after 1s/);
    await vi.advanceTimersByTimeAsync(1000);
    await assertion;
  });
});

describe("createInFlightMap", () => {
  it("deduplicates concurrent work for the same key", async () => {
    const map = createInFlightMap<number>();
    let calls = 0;
    const factory = () => {
      calls += 1;
      return Promise.resolve(42);
    };
    const [a, b] = await Promise.all([map.run("u1", factory), map.run("u1", factory)]);
    expect(a).toBe(42);
    expect(b).toBe(42);
    expect(calls).toBe(1);
  });

  it("allows a new run after the prior settles", async () => {
    const map = createInFlightMap<number>();
    await map.run("u1", async () => 1);
    await map.run("u1", async () => 2);
    expect(map.has("u1")).toBe(false);
  });
});

describe("shouldSkipSoftProfileRefresh", () => {
  it("skips when the same user has a fresh cache", () => {
    expect(
      shouldSkipSoftProfileRefresh({
        userId: "u1",
        cacheUserId: "u1",
        cachedAt: 1_000,
        ttlMs: 30_000,
        nowMs: 10_000,
      }),
    ).toBe(true);
  });

  it("does not skip when cache is stale or for another user", () => {
    expect(
      shouldSkipSoftProfileRefresh({
        userId: "u1",
        cacheUserId: "u1",
        cachedAt: 1_000,
        ttlMs: 30_000,
        nowMs: 50_000,
      }),
    ).toBe(false);
    expect(
      shouldSkipSoftProfileRefresh({
        userId: "u1",
        cacheUserId: "u2",
        cachedAt: 1_000,
        ttlMs: 30_000,
        nowMs: 10_000,
      }),
    ).toBe(false);
  });
});

describe("buildResolvedAccountContext", () => {
  it("fills safe defaults for Free accounts", () => {
    expect(
      buildResolvedAccountContext({
        userId: "u1",
        email: "a@b.com",
      }),
    ).toEqual({
      userId: "u1",
      email: "a@b.com",
      planId: "free",
      credits: 0,
      isOnboarded: false,
      isBanned: false,
      isAdmin: false,
      isAdminResolved: false,
      phase: "resolved",
    });
  });
});

describe("shouldLoadAccountOnAuthEvent", () => {
  it("skips TOKEN_REFRESHED and in-flight password SIGNED_IN", () => {
    expect(
      shouldLoadAccountOnAuthEvent({
        event: "TOKEN_REFRESHED",
        signingIn: false,
        alreadyReadyForUser: false,
        sameAccessToken: false,
      }),
    ).toBe(false);
    expect(
      shouldLoadAccountOnAuthEvent({
        event: "SIGNED_IN",
        signingIn: true,
        alreadyReadyForUser: false,
        sameAccessToken: false,
      }),
    ).toBe(false);
    expect(
      shouldLoadAccountOnAuthEvent({
        event: "SIGNED_IN",
        signingIn: false,
        alreadyReadyForUser: true,
        sameAccessToken: true,
      }),
    ).toBe(false);
  });

  it("loads account on fresh SIGNED_IN", () => {
    expect(
      shouldLoadAccountOnAuthEvent({
        event: "SIGNED_IN",
        signingIn: false,
        alreadyReadyForUser: false,
        sameAccessToken: false,
      }),
    ).toBe(true);
  });
});

describe("shouldDetectSessionInUrl", () => {
  it("only enables URL session detection on callback or token params", () => {
    expect(
      shouldDetectSessionInUrl({
        pathname: "/login",
        search: "",
        hash: "",
      }),
    ).toBe(false);
    expect(
      shouldDetectSessionInUrl({
        pathname: "/auth/callback",
        search: "?code=abc",
        hash: "",
      }),
    ).toBe(true);
    expect(
      shouldDetectSessionInUrl({
        pathname: "/app/dashboard",
        search: "?code=abc",
        hash: "",
      }),
    ).toBe(true);
  });
});

describe("canRetryAccountRecovery", () => {
  it("bounds soft recovery attempts", () => {
    expect(canRetryAccountRecovery(0)).toBe(true);
    expect(canRetryAccountRecovery(2)).toBe(true);
    expect(canRetryAccountRecovery(3)).toBe(false);
  });
});

describe("asLoginCredentials", () => {
  it("normalizes email and preserves the password byte-for-byte", async () => {
    const { asLoginCredentials } = await import("@/lib/auth/accountBootstrap");
    const password = "  P@ss word!\n\t";
    const result = asLoginCredentials("  Free.User@Example.COM ", password);
    expect(result.email).toBe("free.user@example.com");
    expect(result.password).toBe(password);
    expect(result.password).not.toBe(password.trim());
    expect(result.password).not.toBe(password.toLowerCase());
  });
});

describe("deriveAccountPhase", () => {
  it("maps store status to the authoritative lifecycle", async () => {
    const { deriveAccountPhase } = await import("@/lib/auth/accountBootstrap");
    expect(
      deriveAccountPhase({
        status: "loading",
        hasUser: false,
        isProfileLoaded: false,
      }),
    ).toBe("INITIALIZING");
    expect(
      deriveAccountPhase({
        status: "loading",
        hasUser: true,
        isProfileLoaded: false,
      }),
    ).toBe("ACCOUNT_LOADING");
    expect(
      deriveAccountPhase({
        status: "authenticated",
        hasUser: true,
        isProfileLoaded: true,
      }),
    ).toBe("READY");
    expect(
      deriveAccountPhase({
        status: "error",
        hasUser: true,
        isProfileLoaded: false,
      }),
    ).toBe("RECOVERY_REQUIRED");
    expect(
      deriveAccountPhase({
        status: "unauthenticated",
        hasUser: false,
        isProfileLoaded: false,
      }),
    ).toBe("UNAUTHENTICATED");
  });
});

describe("classifyAccountLoadFailure extra kinds", () => {
  it("distinguishes network, expired session, missing profile, and role failures", () => {
    expect(classifyAccountLoadFailure(new Error("Failed to fetch"))).toBe(
      "network_failure",
    );
    expect(
      classifyAccountLoadFailure(new Error("Invalid Refresh Token: Refresh Token Not Found")),
    ).toBe("expired_session");
    expect(classifyAccountLoadFailure(new Error("profile not found"))).toBe(
      "missing_profile",
    );
    expect(classifyAccountLoadFailure(new Error("role query failed"))).toBe(
      "role_query_failure",
    );
    expect(classifyAccountLoadFailure(new Error("503 internal server"))).toBe(
      "auth_server_failure",
    );
    expect(userFacingAccountError("expired_session")).toMatch(/session has expired/i);
    expect(userFacingAccountError("network_failure")).not.toMatch(/PGRST|postgres|jwt/i);
  });
});
