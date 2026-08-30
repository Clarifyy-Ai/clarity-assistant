import { describe, expect, it } from "vitest";
import {
  documentParseIdempotencyKey,
  prepToolIdempotencyKey,
  prepToolContentIdempotencyKey,
  nextPrepToolIdempotencyKey,
  isValidClientIdempotencyKey,
  practiceCoachStartIdempotencyKey,
} from "@/lib/network/idempotency";
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

describe("prepToolIdempotencyKey", () => {
  it("produces valid edge keys", () => {
    const key = prepToolIdempotencyKey("rephrase");
    expect(isValidClientIdempotencyKey(key)).toBe(true);
    expect(key.startsWith("prep-tool:rephrase:")).toBe(true);
  });

  it("reuses the same key while a Rephraser request is in flight", () => {
    const inflight = { current: null as string | null };
    const first = nextPrepToolIdempotencyKey(inflight, "rephrase");
    const concurrent = nextPrepToolIdempotencyKey(inflight, "rephrase");
    expect(concurrent).toBe(first);
    inflight.current = null;
    const afterComplete = nextPrepToolIdempotencyKey(inflight, "rephrase");
    expect(afterComplete).not.toBe(first);
  });

  it("derives a stable key from content SHA so the same text does not recharge", () => {
    const hash = "a".repeat(64);
    const a = prepToolContentIdempotencyKey("rephrase", hash);
    const b = prepToolContentIdempotencyKey("rephrase", hash);
    expect(a).toBe(b);
    expect(isValidClientIdempotencyKey(a)).toBe(true);
    expect(a).not.toBe(prepToolContentIdempotencyKey("rephrase", "b".repeat(64)));
  });
});

describe("practiceCoachStartIdempotencyKey", () => {
  const cfg = {
    resume_id: "res-1",
    role: "SWE",
    company: "Acme",
    interview_type: "behavioral",
  };

  it("is stable for the same setup without a nonce (in-flight replay)", () => {
    const a = practiceCoachStartIdempotencyKey("user-1", cfg);
    const b = practiceCoachStartIdempotencyKey("user-1", cfg);
    expect(a).toBe(b);
    expect(isValidClientIdempotencyKey(a)).toBe(true);
  });

  it("differs after End when a new attempt nonce is supplied", () => {
    const first = practiceCoachStartIdempotencyKey("user-1", { ...cfg, attemptNonce: "aaaa1111" });
    const second = practiceCoachStartIdempotencyKey("user-1", { ...cfg, attemptNonce: "bbbb2222" });
    expect(first).not.toBe(second);
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
