import { describe, expect, it, beforeEach, afterEach, vi } from "vitest";
import {
  detectAuthDeepLinkKind,
  maybeRedirectAuthDeepLink,
  resolveAuthDeepLinkRedirect,
  AUTH_RECOVERY_FLAG_KEY,
} from "@/lib/auth/authDeepLinkRedirect";

describe("authDeepLinkRedirect", () => {
  beforeEach(() => {
    sessionStorage.clear();
  });

  afterEach(() => {
    sessionStorage.clear();
  });

  it("detects recovery from type=recovery in hash", () => {
    expect(
      detectAuthDeepLinkKind({
        pathname: "/",
        search: "",
        hash: "#access_token=abc&type=recovery",
      }),
    ).toBe("recovery");
  });

  it("detects oauth/magic-link callback from ?code=", () => {
    expect(
      detectAuthDeepLinkKind({
        pathname: "/",
        search: "?code=abc",
        hash: "",
      }),
    ).toBe("callback");
  });

  it("preserves search/hash when redirecting recovery off Site URL", () => {
    expect(
      resolveAuthDeepLinkRedirect({
        pathname: "/",
        search: "",
        hash: "#access_token=tok&type=recovery&refresh_token=r",
      }),
    ).toBe("/reset-password#access_token=tok&type=recovery&refresh_token=r");
  });

  it("preserves code when redirecting callback off homepage", () => {
    expect(
      resolveAuthDeepLinkRedirect({
        pathname: "/",
        search: "?code=pkce-code",
        hash: "",
      }),
    ).toBe("/auth/callback?code=pkce-code");
  });

  it("does not redirect when already on the correct path", () => {
    expect(
      resolveAuthDeepLinkRedirect({
        pathname: "/reset-password",
        search: "",
        hash: "#type=recovery&access_token=x",
      }),
    ).toBeNull();
    expect(
      resolveAuthDeepLinkRedirect({
        pathname: "/auth/callback",
        search: "?code=abc",
        hash: "",
      }),
    ).toBeNull();
  });

  it("uses recovery flag when tokens already consumed", () => {
    expect(
      resolveAuthDeepLinkRedirect({
        pathname: "/auth/callback",
        search: "",
        hash: "",
        recoveryFlag: true,
      }),
    ).toBe("/reset-password");
  });

  it("maybeRedirectAuthDeepLink replaces location for Site URL recovery", () => {
    const replace = vi.fn();
    const redirected = maybeRedirectAuthDeepLink({
      pathname: "/",
      search: "",
      hash: "#type=recovery&access_token=abc",
      replace,
    });
    expect(redirected).toBe(true);
    expect(replace).toHaveBeenCalledWith(
      "/reset-password#type=recovery&access_token=abc",
    );
    expect(sessionStorage.getItem(AUTH_RECOVERY_FLAG_KEY)).toBe("1");
  });

  it("does not treat Session History ?type=mock_interview as auth deep link", () => {
    expect(
      detectAuthDeepLinkKind({
        pathname: "/app/sessions",
        search: "?type=mock_interview",
        hash: "",
      }),
    ).toBeNull();
    expect(
      resolveAuthDeepLinkRedirect({
        pathname: "/app/sessions",
        search: "?type=mock_interview",
        hash: "",
      }),
    ).toBeNull();
  });
});
