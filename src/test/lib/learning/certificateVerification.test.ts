import { describe, expect, it } from "vitest";
import {
  CERTIFICATE_CODE_PATTERN,
  classifyRouteCertificateCode,
  certificateMalformedCopy,
  certificateNotFoundCopy,
  isCertificateCodeFormatValid,
  normalizeCertificateCode,
  resolveVerifyStatusFromRpc,
  safeCertificateVerifyErrorMessage,
} from "@/lib/learning/certificateVerification";

describe("certificateVerification helpers", () => {
  it("accepts issued certificate code format", () => {
    expect(CERTIFICATE_CODE_PATTERN.test("CLR-2026-AB12CD34")).toBe(true);
    expect(isCertificateCodeFormatValid("CLR-2026-57055017")).toBe(true);
  });

  it("rejects malformed certificate codes", () => {
    expect(isCertificateCodeFormatValid("")).toBe(false);
    expect(isCertificateCodeFormatValid("foo")).toBe(false);
    expect(isCertificateCodeFormatValid("CLR-2026")).toBe(false);
    expect(isCertificateCodeFormatValid("CLR-2026-TOOLONGCODE")).toBe(false);
    expect(isCertificateCodeFormatValid("DROP TABLE;--")).toBe(false);
  });

  it("classifies route codes as missing, malformed, or ready", () => {
    expect(classifyRouteCertificateCode(undefined)).toBe("missing");
    expect(classifyRouteCertificateCode("   ")).toBe("missing");
    expect(classifyRouteCertificateCode("not-a-code")).toBe("malformed");
    expect(classifyRouteCertificateCode("CLR-2026-AB12CD34")).toBe("ready");
  });

  it("normalizes certificate codes", () => {
    expect(normalizeCertificateCode("  CLR-2026-AB12CD34  ")).toBe("CLR-2026-AB12CD34");
    expect(normalizeCertificateCode(null)).toBe("");
  });

  it("resolves RPC outcomes without leaking technical errors", () => {
    expect(resolveVerifyStatusFromRpc({ valid: true }, null)).toEqual({
      status: "valid",
      error: null,
    });
    expect(resolveVerifyStatusFromRpc({ valid: false }, null)).toEqual({
      status: "invalid",
      error: null,
    });
    expect(
      resolveVerifyStatusFromRpc(null, {
        message: "permission denied for function verify_course_certificate",
      }),
    ).toEqual({
      status: "error",
      error: safeCertificateVerifyErrorMessage(
        "permission denied for function verify_course_certificate",
      ),
    });
  });

  it("sanitizes SQL and stack traces from verify errors", () => {
    expect(safeCertificateVerifyErrorMessage("ERROR: syntax error at or near")).toBe(
      "We could not verify this certificate right now. Please try again in a moment.",
    );
    expect(safeCertificateVerifyErrorMessage("JWT expired")).toBe(
      "We could not verify this certificate right now. Please try again in a moment.",
    );
    expect(safeCertificateVerifyErrorMessage(undefined)).toBe(
      "We could not verify this certificate right now. Please try again in a moment.",
    );
  });

  it("exposes safe public copy for not-found and malformed states", () => {
    expect(certificateNotFoundCopy().title).toMatch(/not found/i);
    expect(certificateMalformedCopy().description).toMatch(/CLR-YYYY-XXXXXXXX/i);
  });
});
