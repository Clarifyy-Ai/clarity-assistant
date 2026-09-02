import { describe, expect, it } from "vitest";
import {
  bucketIsoDays,
  formatAdminRelativeTime,
  sanitizeAdminSearch,
} from "@/lib/admin/searchFilter";

describe("sanitizeAdminSearch", () => {
  it("strips PostgREST or/ilike metacharacters", () => {
    expect(sanitizeAdminSearch("  a%b,c(d)e  ")).toBe("abcde");
  });
});

describe("bucketIsoDays", () => {
  it("fills a contiguous local-day series", () => {
    const end = new Date(2026, 8, 2, 12, 0, 0);
    const series = bucketIsoDays(
      ["2026-09-02T08:00:00.000Z", "2026-09-02T09:00:00.000Z", "2026-08-31T12:00:00.000Z"],
      3,
      end,
    );
    expect(series).toHaveLength(3);
    expect(series.map((row) => row.day)).toEqual(["2026-08-31", "2026-09-01", "2026-09-02"]);
    expect(series.reduce((sum, row) => sum + row.count, 0)).toBeGreaterThanOrEqual(1);
  });
});

describe("formatAdminRelativeTime", () => {
  it("returns an em dash for invalid timestamps", () => {
    expect(formatAdminRelativeTime("not-a-date", () => {
      throw new RangeError("Invalid time value");
    })).toBe("—");
    expect(formatAdminRelativeTime(null, () => "x")).toBe("—");
  });
});
