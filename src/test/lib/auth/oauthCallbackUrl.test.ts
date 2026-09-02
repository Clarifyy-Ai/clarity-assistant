import { afterEach, describe, expect, it, vi } from "vitest";

describe("buildOAuthCallbackUrl", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.resetModules();
  });

  it("uses production origin in production builds even when window is localhost", async () => {
    vi.stubEnv("VITE_APP_ENV", "production");
    vi.stubEnv("VITE_APP_URL", "http://localhost:5173");
    const { buildOAuthCallbackUrl } = await import("@/lib/auth/oauthCallbackUrl");
    expect(buildOAuthCallbackUrl("http://localhost:5173")).toBe(
      "https://trycareerpilot.com/auth/callback",
    );
  });

  it("uses window origin in development", async () => {
    vi.stubEnv("VITE_APP_ENV", "development");
    vi.stubEnv("VITE_APP_URL", "http://localhost:5173");
    const { buildOAuthCallbackUrl } = await import("@/lib/auth/oauthCallbackUrl");
    expect(buildOAuthCallbackUrl("http://localhost:5173")).toBe(
      "http://localhost:5173/auth/callback",
    );
  });
});
