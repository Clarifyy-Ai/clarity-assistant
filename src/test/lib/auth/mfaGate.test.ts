import { describe, expect, it } from "vitest";
import {
  MFA_ENFORCEMENT_PAUSED,
  resolveMfaGateDecision,
  resolveMfaGateFromAal,
} from "@/lib/auth/mfaGate";

describe("mfaGate pause", () => {
  it("allows AAL2 step-up while enforcement is paused", async () => {
    expect(MFA_ENFORCEMENT_PAUSED).toBe(true);
    await expect(
      resolveMfaGateFromAal({
        aal: { currentLevel: "aal1", nextLevel: "aal2" },
      }),
    ).resolves.toEqual({ decision: "allow" });
  });

  it("allows even when AAL lookup fails while paused", async () => {
    await expect(
      resolveMfaGateFromAal({ error: new Error("mfa down") }),
    ).resolves.toEqual({ decision: "allow" });
  });

  it("skips the authenticator check while paused", async () => {
    await expect(resolveMfaGateDecision()).resolves.toEqual({ decision: "allow" });
  });
});
