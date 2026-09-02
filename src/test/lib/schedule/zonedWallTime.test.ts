import { describe, expect, it } from "vitest";
import { zonedWallTimeToUtc } from "@/lib/schedule/zonedWallTime";

describe("zonedWallTimeToUtc", () => {
  it("converts fixed +05:30 offset to UTC", () => {
    const dt = zonedWallTimeToUtc("2026-09-01", "10:00", "+05:30");
    expect(dt?.toISOString()).toBe("2026-09-01T04:30:00.000Z");
  });

  it("converts IANA Asia/Kolkata wall time", () => {
    const dt = zonedWallTimeToUtc("2026-09-01", "10:00", "Asia/Kolkata");
    expect(dt?.toISOString()).toBe("2026-09-01T04:30:00.000Z");
  });

  it("handles America/New_York DST spring-forward boundary date", () => {
    // Second Sunday in March 2026 — EST still in effect on Mar 7
    const beforeDst = zonedWallTimeToUtc("2026-03-07", "09:00", "America/New_York");
    expect(beforeDst?.toISOString()).toBe("2026-03-07T14:00:00.000Z");
  });

  it("returns null for invalid input", () => {
    expect(zonedWallTimeToUtc("", "10:00", "UTC")).toBeNull();
    expect(zonedWallTimeToUtc("2026-09-01", "", "UTC")).toBeNull();
  });
});
