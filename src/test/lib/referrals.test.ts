import { afterEach, describe, expect, it, vi } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  clearStoredRefCode,
  extractRefCodeFromSearchParams,
  getPendingReferralFromUserMetadata,
  getStoredRefCode,
  normalizeRefCode,
  REFERRAL_SESSION_STORAGE_KEY,
  REFERRAL_STORAGE_KEY,
  resolveReferralCodeForClaim,
  shouldClearStoredReferral,
  storeRefCode,
} from "@/lib/referrals";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");

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

describe("extractRefCodeFromSearchParams", () => {
  it("reads canonical ref and legacy r params", () => {
    expect(extractRefCodeFromSearchParams(new URLSearchParams("ref=friend01"))).toBe(
      "FRIEND01",
    );
    expect(extractRefCodeFromSearchParams(new URLSearchParams("r=legacy01"))).toBe(
      "LEGACY01",
    );
    expect(extractRefCodeFromSearchParams(new URLSearchParams("ref=bad"))).toBeNull();
    expect(extractRefCodeFromSearchParams(new URLSearchParams(""))).toBeNull();
  });

  it("prefers ref over r when both are present", () => {
    expect(
      extractRefCodeFromSearchParams(new URLSearchParams("ref=CANON01&r=OTHER01")),
    ).toBe("CANON01");
  });
});

describe("referral storage", () => {
  afterEach(() => {
    localStorage.clear();
    sessionStorage.clear();
  });

  it("stores only normalized codes", () => {
    expect(storeRefCode("friend01")).toBe("FRIEND01");
    expect(localStorage.getItem(REFERRAL_STORAGE_KEY)).toBe("FRIEND01");
    expect(sessionStorage.getItem(REFERRAL_SESSION_STORAGE_KEY)).toBe("FRIEND01");
    expect(getStoredRefCode()).toBe("FRIEND01");
    expect(storeRefCode("bad_code")).toBeNull();
    expect(getStoredRefCode()).toBe("FRIEND01");
    clearStoredRefCode();
    expect(getStoredRefCode()).toBeNull();
  });

  it("falls back to sessionStorage when localStorage is empty", () => {
    sessionStorage.setItem(REFERRAL_SESSION_STORAGE_KEY, "SESS001");
    expect(getStoredRefCode()).toBe("SESS001");
  });
});

describe("pending referral metadata", () => {
  afterEach(() => {
    localStorage.clear();
  });

  it("reads pending_referral_code from user_metadata", () => {
    expect(
      getPendingReferralFromUserMetadata({
        user_metadata: { pending_referral_code: "friend01" },
      }),
    ).toBe("FRIEND01");
    expect(getPendingReferralFromUserMetadata({ user_metadata: {} })).toBeNull();
    expect(getPendingReferralFromUserMetadata(null)).toBeNull();
  });

  it("prefers explicit then metadata then localStorage", () => {
    localStorage.setItem(REFERRAL_STORAGE_KEY, "LOCAL01");
    expect(resolveReferralCodeForClaim("EXPLIC1")).toBe("EXPLIC1");
    expect(
      resolveReferralCodeForClaim(null, {
        user_metadata: { pending_referral_code: "META001" },
      }),
    ).toBe("META001");
    expect(resolveReferralCodeForClaim(null, { user_metadata: {} })).toBe("LOCAL01");
    clearStoredRefCode();
    expect(
      resolveReferralCodeForClaim(null, {
        user_metadata: { pending_referral_code: "META002" },
      }),
    ).toBe("META002");
  });
});

describe("buildReferralLink", () => {
  it("uses the canonical public website origin", async () => {
    const { buildReferralLink } = await import("@/lib/referrals");
    expect(buildReferralLink("FRIEND01")).toBe(
      "https://trycareerpilot.com/signup?ref=FRIEND01",
    );
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
    expect(
      shouldClearStoredReferral({
        success: true,
        result: { ok: false, reason: "programme_disabled" },
      }),
    ).toBe(true);
    expect(
      shouldClearStoredReferral({
        success: true,
        result: { ok: false, reason: "self_referral" },
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
    expect(outcome.retryable).toBe(true);
    expect(outcome.reason).toBe("network_error");
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

  it("clears storage on self_referral without treating as applied", async () => {
    localStorage.setItem(REFERRAL_STORAGE_KEY, "MYCODE1");
    vi.resetModules();
    vi.doMock("@/lib/api/payments", () => ({
      recordReferralViaEdge: vi.fn().mockResolvedValue({
        success: true,
        result: { ok: false, reason: "self_referral" },
      }),
    }));
    const { recordReferral, getStoredRefCode: stored } = await import("@/lib/referrals");
    const outcome = await recordReferral("user-1", null);
    expect(outcome.applied).toBe(false);
    expect(outcome.retryable).toBe(false);
    expect(outcome.reason).toBe("self_referral");
    expect(stored()).toBeNull();
  });

  it("marks transport failures as retryable", async () => {
    localStorage.setItem(REFERRAL_STORAGE_KEY, "FRIEND01");
    vi.resetModules();
    vi.doMock("@/lib/api/payments", () => ({
      recordReferralViaEdge: vi.fn().mockResolvedValue({ success: false }),
    }));
    const { recordReferral } = await import("@/lib/referrals");
    const outcome = await recordReferral("user-1", null);
    expect(outcome.applied).toBe(false);
    expect(outcome.retryable).toBe(true);
    expect(outcome.reason).toBe("transport_failure");
  });

  it("claims from user_metadata when localStorage is empty", async () => {
    clearStoredRefCode();
    vi.resetModules();
    const edge = vi.fn().mockResolvedValue({
      success: true,
      result: { ok: true, referee_credits: 25 },
    });
    vi.doMock("@/lib/api/payments", () => ({
      recordReferralViaEdge: edge,
    }));
    const { recordReferral } = await import("@/lib/referrals");
    const outcome = await recordReferral("user-1", null, {
      user_metadata: { pending_referral_code: "META99X" },
    });
    expect(outcome.applied).toBe(true);
    expect(edge).toHaveBeenCalledWith("META99X");
  });
});

describe("referral qualification is server-side only", () => {
  it("record-referral Edge maps self_referral and calls record_referral_reward RPC", () => {
    const src = fs.readFileSync(
      path.join(root, "supabase/functions/record-referral/index.ts"),
      "utf8",
    );
    expect(src).toContain('rpc("record_referral_reward"');
    expect(src).toContain("self_referral");
    expect(src).toContain("REFERRAL_SELF_REFERRAL");
    expect(src).not.toContain("add_credits");
  });

  it("client creditsDB.add is disabled (no FE credit grants)", () => {
    const src = fs.readFileSync(
      path.join(root, "src/lib/supabase/database.ts"),
      "utf8",
    );
    expect(src).toContain("Client add_credits is disabled");
    expect(src).toContain('operation: "add"');
  });

  it("FE referrals helper only invokes Edge, never profiles.credits writes", () => {
    const src = fs.readFileSync(path.join(root, "src/lib/referrals.ts"), "utf8");
    expect(src).toContain("recordReferralViaEdge");
    expect(src).not.toMatch(/\.from\(["']profiles["']\)/);
    expect(src).not.toContain("add_credits");
    expect(src).not.toContain("increment_profile_credits");
  });
});
