// Hash + cache key utilities — covers Caching/Performance tests
import { describe, it, expect } from "vitest";
import {
  fnv1a,
  numericHash,
  sha256,
  shortHash,
  promptCacheKey,
  documentCacheKey,
  stableId,
  generateETag,
  adler32,
  hmacSHA256,
} from "@/lib/utils/hashUtils";

describe("FNV-1a hash", () => {
  it("returns 8-hex-char string", () => {
    expect(fnv1a("hello")).toMatch(/^[0-9a-f]{8}$/);
  });
  it("is deterministic", () => {
    expect(fnv1a("abc")).toBe(fnv1a("abc"));
  });
  it("is different for different input", () => {
    expect(fnv1a("abc")).not.toBe(fnv1a("abd"));
  });
  it("numericHash within range", () => {
    for (let i = 0; i < 50; i++) {
      const v = numericHash(`x${i}`, 100);
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(100);
    }
  });
});

describe("SHA-256 (Web Crypto)", () => {
  it("hashes 'hello' to known value", async () => {
    const h = await sha256("hello");
    expect(h).toBe("2cf24dba5fb0a30e26e83b2ac5b9e29e1b161e5c1fa7425e73043362938b9824");
  });
  it("shortHash returns N chars", async () => {
    const h = await shortHash("foo", 8);
    expect(h).toHaveLength(8);
  });
});

describe("cache key helpers", () => {
  it("promptCacheKey is stable + prefixed", async () => {
    const a = await promptCacheKey("Tell me about React", "gpt-4o");
    const b = await promptCacheKey("  TELL me about    REACT  ", "gpt-4o");
    expect(a).toBe(b);
    expect(a.startsWith("prompt:")).toBe(true);
  });
  it("documentCacheKey prefix doc:", async () => {
    const k = await documentCacheKey("resume", "jd");
    expect(k.startsWith("doc:")).toBe(true);
  });
  it("stableId combines parts", () => {
    expect(stableId("a", "b")).toBe(stableId("a", "b"));
    expect(stableId("a", "b")).not.toBe(stableId("a", "c"));
  });
  it("generateETag wraps in quotes", () => {
    expect(generateETag("x")).toMatch(/^".+"$/);
  });
});

describe("checksums + HMAC", () => {
  it("adler32 returns a number", () => {
    expect(typeof adler32("hello")).toBe("number");
    expect(adler32("hello")).toBe(adler32("hello"));
  });
  it("hmacSHA256 produces 64-char hex", async () => {
    const sig = await hmacSHA256("secret", "message");
    expect(sig).toMatch(/^[0-9a-f]{64}$/);
  });
});
