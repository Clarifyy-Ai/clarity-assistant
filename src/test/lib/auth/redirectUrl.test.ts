import { describe, it, expect } from "vitest";
import {
  buildAuthRedirectUrl,
  isLocalhostUrl,
  PRODUCTION_APP_URL,
} from "@/lib/auth/redirectUrl";

describe("isLocalhostUrl", () => {
  it("detects localhost URLs", () => {
    expect(isLocalhostUrl("http://localhost:5173")).toBe(true);
    expect(isLocalhostUrl("http://127.0.0.1:3000")).toBe(true);
  });

  it("rejects non-local URLs", () => {
    expect(isLocalhostUrl("https://clarify.ai.sltfinanceindia.com")).toBe(
      false,
    );
  });

  it("rejects invalid URLs instead of throwing", () => {
    expect(isLocalhostUrl("not-a-url")).toBe(false);
    expect(isLocalhostUrl("")).toBe(false);
  });
});

describe("buildAuthRedirectUrl", () => {
  it("prefers a valid configured VITE_APP_URL", () => {
    expect(
      buildAuthRedirectUrl({
        path: "/reset-password",
        configuredAppUrl: "https://staging.clarify.ai",
        appEnv: "staging",
        windowOrigin: "https://unrelated-origin.example",
      }),
    ).toBe("https://staging.clarify.ai/reset-password");
  });

  it("adds a leading slash to the path when missing", () => {
    expect(
      buildAuthRedirectUrl({
        path: "reset-password",
        configuredAppUrl: "https://staging.clarify.ai",
      }),
    ).toBe("https://staging.clarify.ai/reset-password");
  });

  it("strips trailing slashes from the configured URL", () => {
    expect(
      buildAuthRedirectUrl({
        path: "/reset-password",
        configuredAppUrl: "https://staging.clarify.ai/",
      }),
    ).toBe("https://staging.clarify.ai/reset-password");
  });

  it("QA-041: falls back to the production URL when VITE_APP_URL is a localhost leak in a production build", () => {
    expect(
      buildAuthRedirectUrl({
        path: "/reset-password",
        configuredAppUrl: "http://localhost:5173",
        appEnv: "production",
        windowOrigin: "https://clarify.ai.sltfinanceindia.com",
      }),
    ).toBe(`${PRODUCTION_APP_URL}/reset-password`);
  });

  it("QA-041: falls back to the production URL when VITE_APP_URL is missing entirely in production", () => {
    expect(
      buildAuthRedirectUrl({
        path: "/reset-password",
        configuredAppUrl: "",
        appEnv: "production",
        windowOrigin: "https://some-preview-domain.example",
      }),
    ).toBe(`${PRODUCTION_APP_URL}/reset-password`);
  });

  it("allows a localhost VITE_APP_URL outside of production (local dev)", () => {
    expect(
      buildAuthRedirectUrl({
        path: "/reset-password",
        configuredAppUrl: "http://localhost:5173",
        appEnv: "development",
      }),
    ).toBe("http://localhost:5173/reset-password");
  });

  it("falls back to window.location.origin when VITE_APP_URL is unset outside production", () => {
    expect(
      buildAuthRedirectUrl({
        path: "/reset-password",
        configuredAppUrl: "",
        appEnv: "development",
        windowOrigin: "http://localhost:5174",
      }),
    ).toBe("http://localhost:5174/reset-password");
  });

  it("falls back to the production URL as a last resort with no configured URL, env, or origin", () => {
    expect(
      buildAuthRedirectUrl({
        path: "/reset-password",
      }),
    ).toBe(`${PRODUCTION_APP_URL}/reset-password`);
  });

  it("ignores a malformed configured URL and continues to the next fallback", () => {
    expect(
      buildAuthRedirectUrl({
        path: "/reset-password",
        configuredAppUrl: "not-a-valid-url",
        appEnv: "development",
        windowOrigin: "http://localhost:5174",
      }),
    ).toBe("http://localhost:5174/reset-password");
  });

  it("rejects non-http(s) protocols in the configured URL", () => {
    expect(
      buildAuthRedirectUrl({
        path: "/reset-password",
        configuredAppUrl: "javascript:alert(1)",
        appEnv: "development",
        windowOrigin: "http://localhost:5174",
      }),
    ).toBe("http://localhost:5174/reset-password");
  });
});
