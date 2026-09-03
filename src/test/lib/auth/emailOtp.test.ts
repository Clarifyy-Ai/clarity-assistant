import { describe, expect, it } from "vitest";
import {
  classifyEmailOtpError,
  isCompleteEmailOtp,
  normalizeEmailOtpInput,
} from "@/lib/auth/emailOtp";

describe("email OTP (primary auth, not MFA)", () => {
  it("normalizes to digits and accepts 6 or 8 character codes", () => {
    expect(normalizeEmailOtpInput("12 34-56")).toBe("123456");
    expect(isCompleteEmailOtp("123456")).toBe(true);
    expect(isCompleteEmailOtp("12345678")).toBe(true);
    expect(isCompleteEmailOtp("12345")).toBe(false);
  });

  it("classifies invalid, expired, used, rate-limited, and network failures", () => {
    expect(classifyEmailOtpError({ message: "Token has expired or is invalid" }).status).toBe(
      "expired",
    );
    expect(classifyEmailOtpError({ message: "otp_expired" }).status).toBe("expired");
    expect(classifyEmailOtpError({ message: "otp already used" }).status).toBe("already_used");
    expect(classifyEmailOtpError({ status: 429, message: "rate" }).status).toBe("rate_limited");
    expect(classifyEmailOtpError({ message: "Failed to fetch" }).status).toBe("network");
    expect(classifyEmailOtpError({ message: "Invalid token" }).status).toBe("invalid");
  });
});
