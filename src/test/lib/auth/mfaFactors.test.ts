import { describe, expect, it } from "vitest";
import {
  MFA_TOTP_FRIENDLY_NAME,
  collectMfaFactors,
  findUnverifiedTotp,
  findVerifiedTotp,
  isFriendlyNameConflictError,
} from "@/lib/auth/mfaFactors";

describe("mfaFactors", () => {
  it("prefers data.all so unverified factors are visible", () => {
    const factors = collectMfaFactors({
      all: [
        {
          id: "u1",
          factor_type: "totp",
          status: "unverified",
          friendly_name: MFA_TOTP_FRIENDLY_NAME,
        } as never,
      ],
      totp: [],
      phone: [],
    });
    expect(factors).toHaveLength(1);
    expect(findUnverifiedTotp(factors)).toHaveLength(1);
    expect(findVerifiedTotp(factors)).toBeUndefined();
  });

  it("falls back to totp/phone when all is empty", () => {
    const factors = collectMfaFactors({
      all: [],
      totp: [
        {
          id: "v1",
          factor_type: "totp",
          status: "verified",
          friendly_name: MFA_TOTP_FRIENDLY_NAME,
        } as never,
      ],
      phone: [],
    });
    expect(findVerifiedTotp(factors)?.id).toBe("v1");
  });

  it("detects friendly-name conflict errors", () => {
    expect(
      isFriendlyNameConflictError(
        'A factor with the friendly name "Authenticator app" for this user already exists',
      ),
    ).toBe(true);
    expect(isFriendlyNameConflictError("network timeout")).toBe(false);
  });
});
