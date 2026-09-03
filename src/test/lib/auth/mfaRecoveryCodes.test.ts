import { describe, expect, it } from "vitest";
import { generateRecoveryCodes, normalizeRecoveryCode } from "@/lib/auth/mfaRecoveryCodes";

describe("MFA recovery codes", () => {
  it("generates unique crockford codes and normalizes separators", () => {
    const codes = generateRecoveryCodes(10);
    expect(codes).toHaveLength(10);
    expect(new Set(codes).size).toBe(10);
    expect(codes.every((c) => /^[0-9A-HJKMNP-TV-Z]{5}-[0-9A-HJKMNP-TV-Z]{5}$/.test(c))).toBe(
      true,
    );
    expect(normalizeRecoveryCode("ab12c-def3g")).toBe("AB12CDEF3G");
  });
});
