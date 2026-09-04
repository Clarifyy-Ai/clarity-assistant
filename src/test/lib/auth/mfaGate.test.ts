import { describe, expect, it, vi, beforeEach } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  MFA_ENFORCEMENT_PAUSED,
  isMfaEnforcementPaused,
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

  it("keeps fail-closed MFA enabled", () => {
    expect(MFA_ENFORCEMENT_PAUSED).toBe(false);
    expect(isMfaEnforcementPaused()).toBe(false);
  });

  it("hard-fails closed for production builds (no easy pause kill-switch)", () => {
    const src = fs.readFileSync(
      path.resolve(
        path.dirname(fileURLToPath(import.meta.url)),
        "../../../lib/auth/mfaGate.ts",
      ),
      "utf8",
    );
    expect(src).toContain("import.meta.env.PROD");
    expect(src).toContain("export function isMfaEnforcementPaused");
    expect(src).toMatch(
      /function isMfaEnforcementPaused[\s\S]*?if \(import\.meta\.env\.PROD\) return false/,
    );
    expect(src).toContain("isMfaEnforcementPaused()");
    expect(src).not.toMatch(/VITE_.*MFA.*PAUSE/);
  });

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
