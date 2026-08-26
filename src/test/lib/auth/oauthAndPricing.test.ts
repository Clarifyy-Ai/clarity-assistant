import { describe, expect, it, vi, afterEach } from "vitest";

describe("oauthProviders allowlist", () => {
  afterEach(() => {
    vi.resetModules();
    vi.unstubAllEnvs();
  });

  it("defaults to google when env unset", async () => {
    vi.stubEnv("VITE_OAUTH_PROVIDERS", undefined as unknown as string);
    const { getEnabledOAuthProviders } = await import("@/lib/auth/oauthProviders");
    expect(getEnabledOAuthProviders()).toEqual(["google"]);
  });

  it("hides all OAuth CTAs when env is empty or none", async () => {
    vi.stubEnv("VITE_OAUTH_PROVIDERS", "");
    const empty = await import("@/lib/auth/oauthProviders");
    expect(empty.getEnabledOAuthProviders()).toEqual([]);
    vi.resetModules();
    vi.stubEnv("VITE_OAUTH_PROVIDERS", "none");
    const none = await import("@/lib/auth/oauthProviders");
    expect(none.getEnabledOAuthProviders()).toEqual([]);
    expect(none.isOAuthProviderEnabled("google")).toBe(false);
  });

  it("parses comma list and ignores unknown ids", async () => {
    vi.stubEnv("VITE_OAUTH_PROVIDERS", "google, github, not-a-provider");
    const { getEnabledOAuthProviders, isOAuthProviderEnabled } = await import(
      "@/lib/auth/oauthProviders"
    );
    expect(getEnabledOAuthProviders()).toEqual(["google", "github"]);
    expect(isOAuthProviderEnabled("azure")).toBe(false);
  });

  it("treats access_denied as a cancelled OAuth attempt", async () => {
    const { isOAuthCancelledError } = await import("@/lib/auth/oauthProviders");
    expect(isOAuthCancelledError("access_denied")).toBe(true);
    expect(isOAuthCancelledError("server_error")).toBe(false);
    expect(isOAuthCancelledError("error", "User cancelled the login")).toBe(true);
  });
});

describe("pricing exact 20% savings", () => {
  it("PLANS pro/enterprise yearly equal monthly×12×0.8", async () => {
    const { PLANS } = await import("@/lib/billing/subscriptionManager");
    for (const id of ["pro", "enterprise"] as const) {
      const plan = PLANS[id];
      expect(plan.yearlyPrice * 5).toBe(plan.monthlyPrice * 12 * 4);
      expect(Math.round(plan.yearlyPrice / 12)).toBe(
        Math.round((plan.monthlyPrice * 12 * 0.8) / 12),
      );
    }
  });
});

describe("isOAuthCancelledError", () => {
  it("treats access_denied as cancelled", async () => {
    const { isOAuthCancelledError } = await import("@/lib/auth/oauthProviders");
    expect(isOAuthCancelledError("access_denied", null)).toBe(true);
    expect(isOAuthCancelledError("access_denied", "The user denied access")).toBe(true);
  });

  it("treats description text containing cancelled / access_denied as cancelled", async () => {
    const { isOAuthCancelledError } = await import("@/lib/auth/oauthProviders");
    expect(isOAuthCancelledError("server_error", "access_denied")).toBe(true);
    expect(isOAuthCancelledError(null, "User cancelled login")).toBe(true);
    expect(isOAuthCancelledError("oauth_error", "Sign-in was cancelled")).toBe(true);
    expect(isOAuthCancelledError("", "The user canceled the request")).toBe(true);
  });

  it("does not treat unrelated auth failures as cancelled", async () => {
    const { isOAuthCancelledError } = await import("@/lib/auth/oauthProviders");
    expect(isOAuthCancelledError("server_error", "temporarily unavailable")).toBe(false);
    expect(isOAuthCancelledError("invalid_request", null)).toBe(false);
    expect(isOAuthCancelledError(null, null)).toBe(false);
  });
});
