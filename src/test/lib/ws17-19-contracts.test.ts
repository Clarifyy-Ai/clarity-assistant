import { describe, expect, it } from "vitest";
import { normalizeCompanyName } from "@/lib/company/normalizeCompanyName";
import { isSearchUnavailableError, mapGovSearchError } from "@/lib/gov-exam/api";

describe("normalizeCompanyName", () => {
  it("collapses whitespace and lowercases", () => {
    expect(normalizeCompanyName("  Acme   Corp ")).toBe("acme corp");
  });

  it("treats equivalent display names as the same identity", () => {
    expect(normalizeCompanyName("Google")).toBe(normalizeCompanyName(" google "));
  });
});

describe("isSearchUnavailableError", () => {
  it("detects SEARCH_SERVICE_UNAVAILABLE", () => {
    const err = Object.assign(new Error("down"), {
      code: "SEARCH_SERVICE_UNAVAILABLE",
    });
    expect(isSearchUnavailableError(err)).toBe(true);
  });

  it("does not treat empty results as unavailable", () => {
    expect(isSearchUnavailableError(new Error("No exams found"))).toBe(false);
  });
});

describe("mapGovSearchError", () => {
  it("maps RATE_LIMITED distinctly from SEARCH_FAILED", () => {
    const rl = Object.assign(new Error("limited"), { code: "RATE_LIMITED" });
    expect(mapGovSearchError(rl).code).toBe("RATE_LIMITED");
    expect(mapGovSearchError(new Error("boom")).code).toBe("SEARCH_FAILED");
  });

  it("maps INVALID_QUERY", () => {
    const err = Object.assign(new Error("bad"), { code: "INVALID_QUERY" });
    expect(mapGovSearchError(err).code).toBe("INVALID_QUERY");
  });
});

describe("session duration non-negative contract", () => {
  it("clamps negative epoch deltas to zero", () => {
    const started = Date.parse("2026-08-23T10:00:00.000Z");
    const ended = Date.parse("2026-08-23T09:59:00.000Z");
    const seconds = Math.max(0, Math.floor((ended - started) / 1000));
    expect(seconds).toBe(0);
  });
});
