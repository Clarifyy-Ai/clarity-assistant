import { describe, expect, it } from "vitest";

/** Mirrors stripe-webhook pack credit resolution (server catalog only). */
function resolvePackCredits(metadata: Record<string, string>): number {
  const packs: Record<string, number> = {
    credits_10: 10,
    credits_50: 50,
    credits_150: 150,
    credits_500: 500,
  };
  const packId = metadata.credit_pack_id?.trim();
  if (packId && packs[packId] != null) return packs[packId];
  const tampered = Number(metadata.credit_amount ?? 0);
  void tampered;
  return 0;
}

function rejectTestModeInProduction(appEnv: string, livemode: boolean): boolean {
  const prod = appEnv === "production" || appEnv === "prod";
  return !(prod && livemode === false);
}

describe("stripe webhook product rules", () => {
  it("uses catalog pack id, ignores tampered credit_amount", () => {
    expect(
      resolvePackCredits({ credit_pack_id: "credits_50", credit_amount: "9999" }),
    ).toBe(50);
    expect(resolvePackCredits({ credit_amount: "500" })).toBe(0);
  });

  it("rejects test-mode events in production", () => {
    expect(rejectTestModeInProduction("production", false)).toBe(false);
    expect(rejectTestModeInProduction("production", true)).toBe(true);
  });

  it("duplicate idempotency claim can be released for retry", () => {
    const claimed = new Set<string>();
    const claim = (id: string) => {
      if (claimed.has(id)) return false;
      claimed.add(id);
      return true;
    };
    const release = (id: string) => claimed.delete(id);

    expect(claim("evt_1")).toBe(true);
    expect(claim("evt_1")).toBe(false);
    release("evt_1");
    expect(claim("evt_1")).toBe(true);
  });
});
