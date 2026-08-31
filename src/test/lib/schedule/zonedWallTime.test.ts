import { describe, expect, it } from "vitest";
import { zonedWallTimeToUtc } from "@/lib/schedule/zonedWallTime";

describe("zonedWallTimeToUtc", () => {
  it("converts Asia/Kolkata wall time to the correct UTC instant", () => {
    const d = zonedWallTimeToUtc("2026-08-30", "10:30", "Asia/Kolkata");
    expect(d).not.toBeNull();
    expect(d!.toISOString()).toBe("2026-08-30T05:00:00.000Z");
  });

  it("honors a fixed +05:30 offset", () => {
    const d = zonedWallTimeToUtc("2026-08-30", "10:30", "+05:30");
    expect(d!.toISOString()).toBe("2026-08-30T05:00:00.000Z");
  });
});
