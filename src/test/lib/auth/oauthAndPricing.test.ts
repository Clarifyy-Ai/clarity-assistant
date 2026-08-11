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

  it("parses comma list and ignores unknown ids", async () => {
    vi.stubEnv("VITE_OAUTH_PROVIDERS", "google, github, not-a-provider");
    const { getEnabledOAuthProviders, isOAuthProviderEnabled } = await import(
      "@/lib/auth/oauthProviders"
    );
    expect(getEnabledOAuthProviders()).toEqual(["google", "github"]);
    expect(isOAuthProviderEnabled("azure")).toBe(false);
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
