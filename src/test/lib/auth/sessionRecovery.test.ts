import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  isInvalidRefreshTokenError,
  isNonRetryableAuthError,
  redirectToSessionExpiredLogin,
  redirectAfterCrossTabSignOut,
  SESSION_EXPIRED_REASON,
  SIGNED_OUT_ELSEWHERE_REASON,
} from "@/lib/auth/sessionErrors";
import {
  sanitizeReturnTo,
  buildLoginUrl,
  assignLoginWithReturnTo,
} from "@/lib/auth/safeReturnTo";
import { isUserEmailConfirmed } from "@/lib/auth/emailVerification";
import {
  ACCOUNT_SUSPENDED_MESSAGE,
  formatSupabaseAuthError,
  isAccountSuspendedAuthError,
} from "@/lib/errors";
import { redactSensitiveFields } from "@/lib/logger";

describe("isInvalidRefreshTokenError", () => {
  it("detects refresh token not found", () => {
    expect(
      isInvalidRefreshTokenError(
        new Error("Invalid Refresh Token: Refresh Token Not Found"),
      ),
    ).toBe(true);
  });

  it("detects invalid_grant", () => {
    expect(isInvalidRefreshTokenError(new Error("invalid_grant"))).toBe(true);
  });

  it("rejects unrelated errors", () => {
    expect(isInvalidRefreshTokenError(new Error("network timeout"))).toBe(
      false,
    );
  });
});

describe("isNonRetryableAuthError", () => {
  it("treats JWT expired as non-retryable", () => {
    expect(isNonRetryableAuthError(new Error("JWT expired"))).toBe(true);
  });

  it("treats RLS / permission denied as non-retryable", () => {
    expect(
      isNonRetryableAuthError(new Error("permission denied by row-level security")),
    ).toBe(true);
  });

  it("allows transient network errors to retry", () => {
    expect(isNonRetryableAuthError(new Error("Failed to fetch"))).toBe(false);
    expect(isNonRetryableAuthError(new Error("Profile load timed out after 8s"))).toBe(
      false,
    );
  });
});

describe("sanitizeReturnTo / buildLoginUrl", () => {
  it("accepts internal paths", () => {
    expect(sanitizeReturnTo("/app/dashboard")).toBe("/app/dashboard");
    expect(sanitizeReturnTo("/app/sessions?id=1")).toBe("/app/sessions?id=1");
  });

  it("rejects open redirects", () => {
    expect(sanitizeReturnTo("https://evil.com")).toBeNull();
    expect(sanitizeReturnTo("//evil.com")).toBeNull();
    expect(sanitizeReturnTo("javascript:alert(1)")).toBeNull();
    expect(sanitizeReturnTo("\\evil")).toBeNull();
  });

  it("builds login URL with reason and returnTo", () => {
    const url = buildLoginUrl({
      reason: SESSION_EXPIRED_REASON,
      returnTo: "/app/dashboard",
    });
    expect(url).toBe(
      "/login?reason=session_expired&returnTo=%2Fapp%2Fdashboard",
    );
  });

  it("omits unsafe returnTo from login URL", () => {
    expect(
      buildLoginUrl({ reason: SESSION_EXPIRED_REASON, returnTo: "//evil.com" }),
    ).toBe("/login?reason=session_expired");
  });
});

describe("isUserEmailConfirmed", () => {
  it("requires a non-empty confirmation timestamp", () => {
    expect(isUserEmailConfirmed({ email_confirmed_at: "2026-01-01T00:00:00Z" })).toBe(
      true,
    );
    expect(isUserEmailConfirmed({ email_confirmed_at: null })).toBe(false);
    expect(isUserEmailConfirmed({ email_confirmed_at: "" })).toBe(false);
    expect(isUserEmailConfirmed(null)).toBe(false);
  });
});

describe("account suspended auth errors", () => {
  it("maps schema / ban failures to suspended copy", () => {
    expect(
      isAccountSuspendedAuthError(new Error("Database error querying schema")),
    ).toBe(true);
    expect(
      formatSupabaseAuthError({ message: "User is banned", code: "user_banned" }),
    ).toBe(ACCOUNT_SUSPENDED_MESSAGE);
  });
});

describe("assignLoginWithReturnTo", () => {
  const originalLocation = window.location;

  beforeEach(() => {
    Object.defineProperty(window, "location", {
      configurable: true,
      value: {
        ...originalLocation,
        pathname: "/app/dashboard",
        search: "",
        hash: "",
        assign: vi.fn(),
      },
    });
  });

  afterEach(() => {
    Object.defineProperty(window, "location", {
      configurable: true,
      value: originalLocation,
    });
  });

  it("hard-assigns login with returnTo of current path", () => {
    assignLoginWithReturnTo();
    expect(window.location.assign).toHaveBeenCalledWith(
      "/login?returnTo=%2Fapp%2Fdashboard",
    );
  });
});

describe("redirectToSessionExpiredLogin", () => {
  const originalLocation = window.location;

  beforeEach(() => {
    Object.defineProperty(window, "location", {
      configurable: true,
      value: {
        pathname: "/app/dashboard",
        search: "",
        hash: "",
        assign: vi.fn(),
      },
    });
  });

  afterEach(() => {
    Object.defineProperty(window, "location", {
      configurable: true,
      value: originalLocation,
    });
  });

  it("assigns login with session_expired for protected routes", () => {
    redirectToSessionExpiredLogin("/app/live");
    expect(window.location.assign).toHaveBeenCalledWith(
      "/login?reason=session_expired&returnTo=%2Fapp%2Flive",
    );
  });

  it("does not redirect when already on login", () => {
    (window.location as { pathname: string }).pathname = "/login";
    redirectToSessionExpiredLogin("/login");
    expect(window.location.assign).not.toHaveBeenCalled();
  });

  it("does not redirect from public marketing paths", () => {
    (window.location as { pathname: string }).pathname = "/pricing";
    redirectToSessionExpiredLogin("/pricing");
    expect(window.location.assign).not.toHaveBeenCalled();
  });

  it("handles Electron hash-router protected paths", () => {
    (window.location as { pathname: string }).pathname = "/";
    (window.location as { hash: string }).hash = "#/app/dashboard";
    redirectToSessionExpiredLogin("/#/app/dashboard");
    expect(window.location.assign).toHaveBeenCalledWith(
      "/login?reason=session_expired&returnTo=%2Fapp%2Fdashboard",
    );
  });
});

describe("redirectAfterCrossTabSignOut [QA-231]", () => {
  const originalLocation = window.location;

  beforeEach(() => {
    Object.defineProperty(window, "location", {
      configurable: true,
      value: {
        pathname: "/app/dashboard",
        search: "",
        hash: "",
        assign: vi.fn(),
      },
    });
  });

  afterEach(() => {
    Object.defineProperty(window, "location", {
      configurable: true,
      value: originalLocation,
    });
  });

  it("assigns login with signed_out_elsewhere for protected routes", () => {
    redirectAfterCrossTabSignOut("/app/live");
    expect(window.location.assign).toHaveBeenCalledWith(
      "/login?reason=signed_out_elsewhere&returnTo=%2Fapp%2Flive",
    );
  });

  it("does not redirect when already on login", () => {
    (window.location as { pathname: string }).pathname = "/login";
    redirectAfterCrossTabSignOut("/login");
    expect(window.location.assign).not.toHaveBeenCalled();
  });

  it("does not redirect from public marketing paths", () => {
    (window.location as { pathname: string }).pathname = "/pricing";
    redirectAfterCrossTabSignOut("/pricing");
    expect(window.location.assign).not.toHaveBeenCalled();
  });

  it("uses a distinct reason from session_expired", () => {
    expect(SIGNED_OUT_ELSEWHERE_REASON).not.toBe(SESSION_EXPIRED_REASON);
  });
});

describe("resolveAppPath", () => {
  it("strips hash-router prefixes", async () => {
    const { resolveAppPath } = await import("@/lib/auth/sessionErrors");
    expect(resolveAppPath("/#/app/live")).toBe("/app/live");
    expect(resolveAppPath("/app/live")).toBe("/app/live");
    expect(resolveAppPath("/?x=1#/app/admin?tab=1")).toBe("/app/admin?tab=1");
  });
});

describe("logger redaction", () => {
  it("redacts tokens, passwords, and email", () => {
    const safe = redactSensitiveFields({
      password: "secret",
      refresh_token: "rt_abc",
      accessToken: "at_abc",
      email: "user@example.com",
      route: "/app/dashboard",
      attempt: 1,
    });
    expect(safe.password).toBe("[REDACTED]");
    expect(safe.refresh_token).toBe("[REDACTED]");
    expect(safe.accessToken).toBe("[REDACTED]");
    expect(safe.email).toBe("[REDACTED]");
    expect(safe.route).toBe("/app/dashboard");
    expect(safe.attempt).toBe(1);
  });
});

describe("recovery helpers", () => {
  it("builds a support mailto without leaking tokens", async () => {
    const { supportMailto, PROFILE_FRIENDLY_ERROR } = await import(
      "@/lib/auth/recoveryActions"
    );
    expect(PROFILE_FRIENDLY_ERROR).toMatch(/having trouble loading your profile/i);
    expect(supportMailto("help")).toMatch(/^mailto:support@clarifyprep\.com/);
    expect(supportMailto("help")).not.toMatch(/token|password|jwt/i);
  });
});
