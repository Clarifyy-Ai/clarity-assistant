import { describe, expect, it } from "vitest";
import {
  isOAuthNotConfiguredError,
  isOAuthProbeMisconfiguredError,
  isOAuthStateMismatchError,
} from "@/lib/auth/oauthProviders";
import { classifyLoginFailure } from "@/lib/auth/loginFailure";
import { formatSupabaseAuthError } from "@/lib/errors";

describe("isOAuthNotConfiguredError", () => {
  it("detects provider-disabled callback errors", () => {
    expect(
      isOAuthNotConfiguredError("server_error", "Unsupported provider: provider is not enabled"),
    ).toBe(true);
    expect(isOAuthNotConfiguredError("access_denied")).toBe(false);
  });

  it("detects validation_failed without leaking provider internals", () => {
    expect(isOAuthNotConfiguredError("validation_failed", null, "validation_failed")).toBe(true);
    expect(isOAuthNotConfiguredError(null, "redirect_uri_mismatch")).toBe(true);
    expect(isOAuthNotConfiguredError("error", "Access blocked by Google OAuth client")).toBe(true);
  });
});

describe("isOAuthStateMismatchError", () => {
  it("detects state mismatch callback errors", () => {
    expect(isOAuthStateMismatchError("invalid_request", "OAuth state mismatch")).toBe(true);
    expect(isOAuthStateMismatchError("bad_oauth_state")).toBe(true);
    expect(isOAuthStateMismatchError("validation_failed")).toBe(false);
  });
});

describe("isOAuthProbeMisconfiguredError", () => {
  it("maps GoTrue probe failures to misconfigured", () => {
    expect(
      isOAuthProbeMisconfiguredError({
        message: "validation_failed",
        code: "validation_failed",
        status: 400,
      }),
    ).toBe(true);
    expect(isOAuthProbeMisconfiguredError({ message: "Failed to fetch" })).toBe(false);
  });
});

describe("login + OAuth error mapping", () => {
  it("maps provider-disabled errors to not-configured copy", () => {
    const classified = classifyLoginFailure({
      code: "validation_failed",
      message: "Unsupported provider: provider is not enabled",
    });
    expect(classified.code).toBe("AUTH_OAUTH_NOT_CONFIGURED");
    expect(classified.message.toLowerCase()).toContain("not configured");
  });

  it("maps bare validation_failed login errors to generic credentials", () => {
    const classified = classifyLoginFailure({
      code: "validation_failed",
      message: "Unable to validate email address: invalid format",
    });
    expect(classified.code).toBe("AUTH_INVALID_CREDENTIALS");
    expect(classified.message).toBe("Incorrect email or password.");
  });

  it("maps state mismatch to retry copy", () => {
    const classified = classifyLoginFailure({
      code: "invalid_request",
      message: "OAuth state mismatch",
    });
    expect(classified.code).toBe("AUTH_OAUTH_STATE_MISMATCH");
    expect(classified.message.toLowerCase()).toContain("expired");
  });

  it("formatSupabaseAuthError hides raw provider text", () => {
    const copy = formatSupabaseAuthError({
      message: "Unsupported provider: provider is not enabled",
      code: "validation_failed",
    });
    expect(copy.toLowerCase()).not.toContain("provider is not enabled");
    expect(copy).toMatch(/not configured/i);
  });
});
