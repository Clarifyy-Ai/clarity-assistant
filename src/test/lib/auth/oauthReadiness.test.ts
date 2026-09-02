import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const signInWithOAuth = vi.fn();

vi.mock("@/lib/supabase/client", () => ({
  supabase: {
    auth: {
      signInWithOAuth,
    },
  },
}));

describe("oauthReadiness probe", () => {
  beforeEach(async () => {
    vi.resetModules();
    vi.unstubAllEnvs();
    vi.stubEnv("VITE_OAUTH_PROVIDERS", "google");
    signInWithOAuth.mockReset();
    const { clearOAuthReadinessCache } = await import("@/lib/auth/oauthReadiness");
    clearOAuthReadinessCache();
  });

  afterEach(() => {
    vi.resetModules();
    vi.unstubAllEnvs();
  });

  it("marks provider available when skipBrowserRedirect returns an authorize URL", async () => {
    signInWithOAuth.mockResolvedValue({
      data: { provider: "google", url: "https://accounts.google.com/o/oauth2/v2/auth" },
      error: null,
    });

    const { probeOAuthProviderAvailability } = await import("@/lib/auth/oauthReadiness");
    await expect(probeOAuthProviderAvailability("google")).resolves.toBe("available");
    expect(signInWithOAuth).toHaveBeenCalledWith(
      expect.objectContaining({
        provider: "google",
        options: expect.objectContaining({ skipBrowserRedirect: true }),
      }),
    );
  });

  it("marks provider unavailable on validation_failed probe", async () => {
    signInWithOAuth.mockResolvedValue({
      data: { provider: "google", url: null },
      error: { message: "validation_failed", code: "validation_failed", status: 400 },
    });

    const { probeOAuthProviderAvailability } = await import("@/lib/auth/oauthReadiness");
    await expect(probeOAuthProviderAvailability("google")).resolves.toBe("unavailable");
  });

  it("returns unavailable when provider is not in env allowlist", async () => {
    vi.stubEnv("VITE_OAUTH_PROVIDERS", "none");
    vi.resetModules();
    const { probeOAuthProviderAvailability } = await import("@/lib/auth/oauthReadiness");
    await expect(probeOAuthProviderAvailability("google")).resolves.toBe("unavailable");
    expect(signInWithOAuth).not.toHaveBeenCalled();
  });
});
