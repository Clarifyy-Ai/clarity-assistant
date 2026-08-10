import { describe, expect, it } from "vitest";
import { documentParseIdempotencyKey } from "@/lib/network/idempotency";
import { sanitizeReturnTo, buildLoginUrl } from "@/lib/auth/safeReturnTo";

describe("documentParseIdempotencyKey", () => {
  it("produces stable keys within length bounds", () => {
    const a = documentParseIdempotencyKey("parse-resume", "abc-123", "hash1");
    const b = documentParseIdempotencyKey("parse-resume", "abc-123", "hash1");
    expect(a).toBe(b);
    expect(a.length).toBeGreaterThanOrEqual(16);
    expect(a.length).toBeLessThanOrEqual(150);
  });

  it("differs by fingerprint", () => {
    const a = documentParseIdempotencyKey("gap-analysis", "r1:j1", "v1");
    const b = documentParseIdempotencyKey("gap-analysis", "r1:j1", "v2");
    expect(a).not.toBe(b);
  });
});

describe("legacy route returnTo safety", () => {
  it("allows answer-bank and debriefs paths", () => {
    expect(sanitizeReturnTo("/app/answer-bank")).toBe("/app/answer-bank");
    expect(sanitizeReturnTo("/app/debriefs/x")).toBe("/app/debriefs/x");
  });

  it("builds login with returnTo", () => {
    expect(
      buildLoginUrl({ returnTo: "/app/documents" }),
    ).toContain("returnTo=%2Fapp%2Fdocuments");
  });
});
