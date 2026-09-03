import { describe, expect, it } from "vitest";
import { emailOtpSatisfiesMfa } from "@/lib/auth/securityModel";

describe("auth security model", () => {
  it("never treats email OTP as TOTP MFA", () => {
    expect(emailOtpSatisfiesMfa()).toBe(false);
  });
});
