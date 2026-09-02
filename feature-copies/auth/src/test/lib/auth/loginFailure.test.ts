import { describe, expect, it } from "vitest";
import { AUTH_INVALID_CREDENTIALS_MESSAGE } from "@/lib/auth/accountBootstrap";
import {
  AUTH_ACCOUNT_SUSPENDED_MESSAGE,
  AUTH_RECOVERY_LINK_EXPIRED_MESSAGE,
  AUTH_RECOVERY_LINK_INVALID_MESSAGE,
  assertSafeLoginMessage,
  classifyLoginFailure,
  isAuthImplementationLeak,
  loginFailureFromUrl,
  recoveryLinkIssueFromUrl,
} from "@/lib/auth/loginFailure";
import { formatSupabaseAuthError } from "@/lib/errors";

const LEAK_RE = /token|jwt|pkce|invalid_grant|otp|gotrue|supabase|provider is not enabled/i;

describe("classifyLoginFailure", () => {
  it("uses the same generic copy for invalid email and invalid password", () => {
    const unknownEmail = classifyLoginFailure({
      message: "User not found",
      code: "user_not_found",
      status: 400,
    });
    const wrongPassword = classifyLoginFailure({
      message: "Invalid login credentials",
      code: "invalid_credentials",
      status: 401,
    });
    const tokenStyle = classifyLoginFailure({
      message: "Password recovery token is invalid",
      code: "otp_expired",
      error_description: "password token invalid",
      status: 400,
    });

    expect(unknownEmail.message).toBe(AUTH_INVALID_CREDENTIALS_MESSAGE);
    expect(wrongPassword.message).toBe(unknownEmail.message);
    expect(tokenStyle.message).toBe(unknownEmail.message);
    expect(unknownEmail.code).toBe("AUTH_INVALID_CREDENTIALS");
    expect(wrongPassword.code).toBe("AUTH_INVALID_CREDENTIALS");
    expect(tokenStyle.code).toBe("AUTH_INVALID_CREDENTIALS");
  });

  it("does not use HTTP 400 vs 401 for copy", () => {
    const as400 = classifyLoginFailure({
      message: "Invalid login credentials",
      code: "invalid_grant",
      status: 400,
    });
    const as401 = classifyLoginFailure({
      message: "Invalid login credentials",
      code: "invalid_credentials",
      status: 401,
    });
    expect(as400.message).toBe(as401.message);
    expect(as400.code).toBe(as401.code);
  });

  it("never returns token or provider internals", () => {
    const samples = [
      { message: "password token invalid", code: "validation_failed" },
      { message: "invalid_grant", error: "invalid_grant" },
      { message: "Unable to validate email address: invalid format", code: "validation_failed" },
      { error_description: "Invalid Refresh Token: Refresh Token Not Found" },
      { message: "Unsupported provider: provider is not enabled", code: "validation_failed" },
    ];
    for (const sample of samples) {
      const classified = classifyLoginFailure(sample);
      expect(classified.message).not.toMatch(LEAK_RE);
      expect(isAuthImplementationLeak(classified.message)).toBe(false);
    }
  });

  it("keeps banned, rate-limit, and unverified email distinct", () => {
    expect(classifyLoginFailure({ code: "user_banned", message: "User is banned" })).toEqual({
      code: "AUTH_ACCOUNT_SUSPENDED",
      message: AUTH_ACCOUNT_SUSPENDED_MESSAGE,
    });
    expect(
      classifyLoginFailure({ code: "over_request_rate_limit", message: "Too many requests" }).code,
    ).toBe("AUTH_RATE_LIMITED");
    expect(
      classifyLoginFailure({ code: "email_not_confirmed", message: "Email not confirmed" }).code,
    ).toBe("AUTH_EMAIL_NOT_VERIFIED");
  });

  it("recognizes already-classified app codes without GoTrue status", () => {
    const thrown = Object.assign(new Error(AUTH_INVALID_CREDENTIALS_MESSAGE), {
      code: "AUTH_INVALID_CREDENTIALS",
    });
    expect(classifyLoginFailure(thrown)).toEqual({
      code: "AUTH_INVALID_CREDENTIALS",
      message: AUTH_INVALID_CREDENTIALS_MESSAGE,
    });
    expect((thrown as { status?: number }).status).toBeUndefined();
  });
});

describe("loginFailureFromUrl", () => {
  it("sanitizes leaky error_description query params", () => {
    const classified = loginFailureFromUrl({
      error: "access_denied",
      errorDescription: "password token invalid",
    });
    expect(classified.message).toBe(AUTH_INVALID_CREDENTIALS_MESSAGE);
    expect(classified.message).not.toMatch(LEAK_RE);
  });

  it("maps typed callback codes without a message param", () => {
    expect(loginFailureFromUrl({ error: "AUTH_INVALID_CREDENTIALS" }).message).toBe(
      AUTH_INVALID_CREDENTIALS_MESSAGE,
    );
    expect(loginFailureFromUrl({ error: "cancelled" }).code).toBe("AUTH_CANCELLED");
    expect(loginFailureFromUrl({ error: "not_configured" }).code).toBe(
      "AUTH_OAUTH_NOT_CONFIGURED",
    );
  });
});

describe("recoveryLinkIssueFromUrl", () => {
  it("never surfaces raw token text", () => {
    expect(
      recoveryLinkIssueFromUrl({
        error: "access_denied",
        errorCode: "otp_expired",
        errorDescription: "password token invalid",
      }),
    ).toBe(AUTH_RECOVERY_LINK_EXPIRED_MESSAGE);
    expect(
      recoveryLinkIssueFromUrl({
        error: "unauthorized_client",
        errorDescription: "Password recovery token is invalid",
      }),
    ).toBe(AUTH_RECOVERY_LINK_INVALID_MESSAGE);
    expect(
      recoveryLinkIssueFromUrl({
        errorDescription: "password token invalid",
      }),
    ).toBeNull();
  });
});

describe("assertSafeLoginMessage", () => {
  it("replaces leaky copy with the generic credentials message", () => {
    expect(assertSafeLoginMessage("password token invalid")).toBe(
      AUTH_INVALID_CREDENTIALS_MESSAGE,
    );
    expect(assertSafeLoginMessage(AUTH_INVALID_CREDENTIALS_MESSAGE)).toBe(
      AUTH_INVALID_CREDENTIALS_MESSAGE,
    );
  });
});

describe("formatSupabaseAuthError leak guard", () => {
  it("maps token-style login bodies to the generic credentials message", () => {
    expect(
      formatSupabaseAuthError({
        message: "password token invalid",
        code: "otp_expired",
        status: 400,
      }),
    ).toBe(AUTH_INVALID_CREDENTIALS_MESSAGE);
  });
});
