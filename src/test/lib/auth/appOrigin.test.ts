import { afterEach, describe, expect, it, vi } from "vitest";
import { AUTH_PATHS } from "@/lib/auth/appOrigin";

describe("authoritative auth URLs", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.resetModules();
  });

  it("exposes a single set of auth paths", () => {
    expect(AUTH_PATHS.oauthCallback).toBe("/auth/callback");
    expect(AUTH_PATHS.mfaEnroll).toBe("/auth/mfa-enroll");
    expect(AUTH_PATHS.mfaRecovery).toBe("/auth/mfa-recovery");
    expect(AUTH_PATHS.passwordReset).toBe("/reset-password");
  });

  it("never emits localhost auth URLs in production", async () => {
    vi.stubEnv("VITE_APP_ENV", "production");
    vi.stubEnv("VITE_APP_URL", "http://localhost:5173");
    const { authUrl, authAbsoluteUrl } = await import("@/lib/auth/appOrigin");
    expect(authUrl("oauthCallback", "http://localhost:5173")).toBe(
      "https://trycareerpilot.com/auth/callback",
    );
    expect(authAbsoluteUrl("/reset-password", "http://127.0.0.1:3000")).toBe(
      "https://trycareerpilot.com/reset-password",
    );
    expect(authUrl("mfaRecovery", "http://localhost:5173")).toBe(
      "https://trycareerpilot.com/auth/mfa-recovery",
    );
  });
});
