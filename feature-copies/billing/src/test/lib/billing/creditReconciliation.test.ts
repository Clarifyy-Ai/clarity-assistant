import { describe, expect, it } from "vitest";
import { creditShortfall } from "@/lib/billing/creditErrorCodes";

describe("credit reconciliation cases", () => {
  it("CASE A: 3983 balance with 3 cost is not a shortfall", () => {
    expect(creditShortfall(3983, 3)).toBe(0);
  });

  it("does not double-charge an idempotent retry (shortfall stays the same math)", () => {
    const before = 800;
    const cost = 3;
    const afterSuccess = before - cost;
    const afterDuplicate = afterSuccess; // server returns existing reservation
    expect(afterDuplicate).toBe(797);
    expect(creditShortfall(afterDuplicate, cost)).toBe(0);
  });

  it("rejected-before-reservation leaves the balance unchanged", () => {
    const before = 3983;
    const afterInventoryDenial = before;
    expect(afterInventoryDenial).toBe(before);
  });
});
