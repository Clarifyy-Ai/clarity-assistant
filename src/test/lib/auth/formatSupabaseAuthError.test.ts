import { describe, expect, it } from "vitest";
import {
  formatSupabaseAuthError,
  isHardAuthTransportError,
} from "@/lib/errors";

describe("formatSupabaseAuthError", () => {
  it("maps email_not_confirmed from code", () => {
    expect(
      formatSupabaseAuthError({ code: "email_not_confirmed", message: "Email not confirmed" }),
    ).toBe("Please verify your email before continuing.");
  });

  it("maps email_not_confirmed from message/msg only", () => {
    expect(
      formatSupabaseAuthError({ msg: "Email not confirmed", error_code: "email_not_confirmed" }),
    ).toBe("Please verify your email before continuing.");
    expect(formatSupabaseAuthError("400 email_not_confirmed")).toBe(
      "Please verify your email before continuing.",
    );
  });

  it("maps OAuth provider-not-enabled without raw GoTrue text", () => {
    const copy = formatSupabaseAuthError({
      message: "Unsupported provider: provider is not enabled",
      code: "validation_failed",
    });
    expect(copy.toLowerCase()).not.toContain("provider is not enabled");
    expect(copy).toMatch(/not configured/i);
  });

  it("never returns the raw 400 body for unknown codes", () => {
    expect(
      formatSupabaseAuthError({
        message: "invalid_grant",
        code: "email_not_confirmed",
      }),
    ).toBe("Please verify your email before continuing.");
  });
});

describe("isHardAuthTransportError", () => {
  it("treats network and SMTP failures as hard", () => {
    expect(isHardAuthTransportError(new Error("Failed to fetch"))).toBe(true);
    expect(isHardAuthTransportError({ message: "Error sending confirmation email", code: "unexpected_failure" })).toBe(true);
  });

  it("does not treat unknown-user style errors as hard", () => {
    expect(isHardAuthTransportError({ message: "User not found" })).toBe(false);
  });
});
