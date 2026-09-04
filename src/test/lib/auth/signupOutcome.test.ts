import { describe, expect, it } from "vitest";
import {
  classifyAuthEmailResend,
  isSignupAlreadyRegisteredResponse,
  signupAlreadyRegisteredError,
} from "@/lib/auth/signupOutcome";
import { AUTH_MESSAGES } from "@/lib/constants/errorMessages";

describe("isSignupAlreadyRegisteredResponse", () => {
  it("detects empty identities (no confirmation email sent)", () => {
    expect(isSignupAlreadyRegisteredResponse({ identities: [] })).toBe(true);
  });

  it("allows a real new signup with at least one identity", () => {
    expect(
      isSignupAlreadyRegisteredResponse({
        identities: [{ provider: "email" }],
      }),
    ).toBe(false);
  });

  it("does not treat missing user as already registered", () => {
    expect(isSignupAlreadyRegisteredResponse(null)).toBe(false);
    expect(isSignupAlreadyRegisteredResponse(undefined)).toBe(false);
  });
});

describe("signupAlreadyRegisteredError", () => {
  it("uses the shared SIGNUP_EMAIL_TAKEN copy", () => {
    const err = signupAlreadyRegisteredError();
    expect(err.message).toBe(AUTH_MESSAGES.SIGNUP_EMAIL_TAKEN);
    expect((err as Error & { code?: string }).code).toBe("user_already_exists");
  });
});

describe("classifyAuthEmailResend", () => {
  it("maps GoTrue rate-limit codes to rate_limited (not sent)", () => {
    expect(
      classifyAuthEmailResend({ code: "over_email_send_rate_limit", message: "Rate limit" }),
    ).toMatchObject({ kind: "rate_limited" });
    expect(
      classifyAuthEmailResend({ code: "over_request_rate_limit", message: "Too many" }),
    ).toMatchObject({ kind: "rate_limited" });
    expect(
      classifyAuthEmailResend({ code: "too_many_requests", message: "slow down" }),
    ).toMatchObject({ kind: "rate_limited" });
  });

  it("maps other errors to failed", () => {
    expect(
      classifyAuthEmailResend({ code: "unexpected_failure", message: "SMTP unavailable" }),
    ).toMatchObject({ kind: "failed", message: "SMTP unavailable" });
  });
});
