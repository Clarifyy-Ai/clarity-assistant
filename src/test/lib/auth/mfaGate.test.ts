import { describe, expect, it, vi, beforeEach } from "vitest";
import {
  MFA_ENFORCEMENT_PAUSED,
  resolveMfaGateDecision,
  resolveMfaGateFromAal,
} from "@/lib/auth/mfaGate";

const listFactors = vi.fn();
const getAuthenticatorAssuranceLevel = vi.fn();

vi.mock("@/lib/supabase/client", () => ({
  supabase: {
    auth: {
      mfa: {
        listFactors: (...args: unknown[]) => listFactors(...args),
        getAuthenticatorAssuranceLevel: (...args: unknown[]) =>
          getAuthenticatorAssuranceLevel(...args),
      },
    },
  },
}));

describe("mfaGate enforcement", () => {
  beforeEach(() => {
    listFactors.mockReset();
    getAuthenticatorAssuranceLevel.mockReset();
  });

  it("is paused so login/route gates do not block the app", () => {
    expect(MFA_ENFORCEMENT_PAUSED).toBe(true);
  });

  it("allows every AAL outcome while paused", async () => {
    await expect(
      resolveMfaGateFromAal({ error: new Error("mfa down") }),
    ).resolves.toEqual({ decision: "allow" });
    await expect(
      resolveMfaGateFromAal({
        aal: { currentLevel: "aal1", nextLevel: "aal2" },
      }),
    ).resolves.toEqual({ decision: "allow" });
  });

  describe.skipIf(MFA_ENFORCEMENT_PAUSED)("live enforcement", () => {
    it("challenges AAL1→AAL2 when a verified TOTP exists", async () => {
      listFactors.mockResolvedValue({
        data: {
          totp: [{ id: "factor-1", factor_type: "totp", status: "verified" }],
          phone: [],
          all: [{ id: "factor-1", factor_type: "totp", status: "verified" }],
        },
        error: null,
      });
      await expect(
        resolveMfaGateFromAal({
          aal: { currentLevel: "aal1", nextLevel: "aal2" },
        }),
      ).resolves.toEqual({ decision: "challenge", factorId: "factor-1" });
    });

    it("blocks when AAL lookup fails", async () => {
      await expect(
        resolveMfaGateFromAal({ error: new Error("mfa down") }),
      ).resolves.toEqual({ decision: "block" });
    });

    it("allows AAL1 with no verified factor", async () => {
      listFactors.mockResolvedValue({
        data: { totp: [], phone: [], all: [] },
        error: null,
      });
      await expect(
        resolveMfaGateFromAal({
          aal: { currentLevel: "aal1", nextLevel: "aal1" },
        }),
      ).resolves.toEqual({ decision: "allow" });
    });

    it("challenges AAL1 when a verified factor exists even if nextLevel is aal1", async () => {
      listFactors.mockResolvedValue({
        data: {
          totp: [{ id: "factor-9", factor_type: "totp", status: "verified" }],
          phone: [],
          all: [],
        },
        error: null,
      });
      await expect(
        resolveMfaGateFromAal({
          aal: { currentLevel: "aal1", nextLevel: "aal1" },
        }),
      ).resolves.toEqual({ decision: "challenge", factorId: "factor-9" });
    });

    it("resolveMfaGateDecision uses live AAL", async () => {
      getAuthenticatorAssuranceLevel.mockResolvedValue({
        data: { currentLevel: "aal2", nextLevel: "aal2" },
        error: null,
      });
      listFactors.mockResolvedValue({
        data: { totp: [], phone: [], all: [] },
        error: null,
      });
      await expect(resolveMfaGateDecision()).resolves.toEqual({ decision: "allow" });
    });
  });
});
