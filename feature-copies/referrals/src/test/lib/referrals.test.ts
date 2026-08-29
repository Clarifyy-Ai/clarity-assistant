import { afterEach, describe, expect, it, vi } from "vitest";

import {
  clearStoredRefCode,
  getStoredRefCode,
  normalizeRefCode,
  REFERRAL_STORAGE_KEY,
  shouldClearStoredReferral,
  storeRefCode,
} from "@/lib/referrals";

describe("normalizeRefCode", () => {
  it("accepts 6–16 alphanumeric codes", () => {
    expect(normalizeRefCode("ab12cd")).toBe("AB12CD");
    expect(normalizeRefCode("  abcdef12  ")).toBe("ABCDEF12");
    expect(normalizeRefCode("A1B2C3D4E5F6G7H8")).toBe("A1B2C3D4E5F6G7H8");
  });

  it("rejects uuid prefixes, punctuation, and oversize values", () => {
    expect(normalizeRefCode("not-a-code")).toBeNull();
    expect(normalizeRefCode("ABC_123")).toBeNull();
    expect(normalizeRefCode("short")).toBeNull();
    expect(normalizeRefCode("A".repeat(17))).toBeNull();
    expect(normalizeRefCode(null)).toBeNull();
    expect(normalizeRefCode("")).toBeNull();
  });
});

describe("referral storage", () => {
  afterEach(() => {
    localStorage.clear();
  });

  it("stores only normalized codes", () => {
    expect(storeRefCode("friend01")).toBe("FRIEND01");
    expect(localStorage.getItem(REFERRAL_STORAGE_KEY)).toBe("FRIEND01");
    expect(getStoredRefCode()).toBe("FRIEND01");
    expect(storeRefCode("bad_code")).toBeNull();
    expect(getStoredRefCode()).toBe("FRIEND01");
    clearStoredRefCode();
    expect(getStoredRefCode()).toBeNull();
  });
});

describe("shouldClearStoredReferral", () => {
  it("clears after a successful award", () => {
    expect(
      shouldClearStoredReferral({
        success: true,
        result: { ok: true, referee_credits: 25 },
      }),
    ).toBe(true);
  });

  it("clears terminal failures so the client does not retry forever", () => {
    expect(
      shouldClearStoredReferral({
        success: true,
        result: { ok: false, reason: "code_not_found" },
      }),
    ).toBe(true);
    expect(
      shouldClearStoredReferral({
        success: true,
        result: { ok: true, reason: "already_recorded" },
      }),
    ).toBe(true);
  });

  it("keeps the code on transport failure", () => {
    expect(shouldClearStoredReferral({ success: false })).toBe(false);
  });
});

describe("recordReferral", () => {
  afterEach(() => {
    localStorage.clear();
    vi.restoreAllMocks();
    vi.resetModules();
  });

  it("does not write referrals from the client when the edge call fails", async () => {
    localStorage.setItem(REFERRAL_STORAGE_KEY, "FRIEND01");
    vi.resetModules();
    vi.doMock("@/lib/api/payments", () => ({
      recordReferralViaEdge: vi.fn().mockRejectedValue(new Error("network")),
    }));
    const { recordReferral, getStoredRefCode: stored } = await import("@/lib/referrals");
    const outcome = await recordReferral("user-1", null);
    expect(outcome.applied).toBe(false);
    expect(stored()).toBe("FRIEND01");
  });

  it("clears storage after a successful edge award", async () => {
    localStorage.setItem(REFERRAL_STORAGE_KEY, "FRIEND01");
    vi.resetModules();
    vi.doMock("@/lib/api/payments", () => ({
      recordReferralViaEdge: vi.fn().mockResolvedValue({
        success: true,
        result: { ok: true, referee_credits: 25, promo_code: "REFabcd123" },
      }),
    }));
    const { recordReferral, getStoredRefCode: stored } = await import("@/lib/referrals");
    const outcome = await recordReferral("user-1", null);
    expect(outcome.applied).toBe(true);
    expect(outcome.refereeCredits).toBe(25);
    expect(stored()).toBeNull();
  });
});
