import { describe, expect, it, vi } from "vitest";
import {
  resolveSchedulerTimezoneKey,
  utcIsoToZonedWallParts,
  zoneOrOffsetForPicker,
  inferTimezoneKeyFromIso,
  persistableIanaTimezone,
  isScheduledToday,
  normalizeIanaTimezoneAlias,
} from "@/lib/interviews/schedulerTimezone";
import { schedulerTimezoneSchema } from "@/lib/validators/interviewSchemas";
import { zonedWallTimeToUtc } from "@/lib/schedule/zonedWallTime";

describe("schedulerTimezone", () => {
  it("prefers round timezone over interview timezone", () => {
    expect(resolveSchedulerTimezoneKey("Asia/Kolkata", "UTC")).toBe("Asia/Kolkata");
    expect(resolveSchedulerTimezoneKey(null, "Europe/London")).toBe("Europe/London");
    expect(resolveSchedulerTimezoneKey(null, null)).toBe("local");
  });

  it("round-trips Asia/Kolkata wall time to UTC and back", () => {
    const utc = zonedWallTimeToUtc("2026-09-15", "10:30", "+05:30");
    expect(utc).not.toBeNull();
    const wall = utcIsoToZonedWallParts(utc!.toISOString(), "Asia/Kolkata");
    expect(wall).toEqual({ date: "2026-09-15", time: "10:30" });
  });

  it("round-trips America/New_York across a standard-time date", () => {
    const utc = zonedWallTimeToUtc("2026-01-15", "09:00", "America/New_York");
    expect(utc).not.toBeNull();
    const wall = utcIsoToZonedWallParts(utc!.toISOString(), "America/New_York");
    expect(wall).toEqual({ date: "2026-01-15", time: "09:00" });
  });

  it("maps picker keys to zoneOrOffset arguments", () => {
    expect(zoneOrOffsetForPicker("Asia/Kolkata")).toBe("+05:30");
    expect(zoneOrOffsetForPicker("UTC")).toBe("Z");
    expect(zoneOrOffsetForPicker("America/New_York")).toBe("America/New_York");
    expect(zoneOrOffsetForPicker("local")).toBe("local");
  });

  it("infers legacy ISO offsets when timezone column is missing", () => {
    expect(inferTimezoneKeyFromIso("2026-09-01T10:00:00.000Z")).toBe("local");
    expect(inferTimezoneKeyFromIso("2026-09-01T10:00:00.000+05:30")).toBe("Asia/Kolkata");
    expect(inferTimezoneKeyFromIso("2026-09-01T10:00:00.000-04:00")).toBe("local");
  });

  it("persists browser IANA instead of the local sentinel", () => {
    expect(persistableIanaTimezone("Asia/Kolkata")).toBe("Asia/Kolkata");
    expect(persistableIanaTimezone("local")).not.toBe("local");
    expect(persistableIanaTimezone("local").length).toBeGreaterThan(2);
  });

  it("normalizes Asia/Calcutta and related aliases to allowlisted IANA", () => {
    expect(normalizeIanaTimezoneAlias("Asia/Calcutta")).toBe("Asia/Kolkata");
    expect(normalizeIanaTimezoneAlias("Asia/Saigon")).toBe("Asia/Ho_Chi_Minh");
    expect(normalizeIanaTimezoneAlias("Europe/Kyiv")).toBe("Europe/Kiev");
    expect(persistableIanaTimezone("Asia/Calcutta")).toBe("Asia/Kolkata");
    expect(resolveSchedulerTimezoneKey("Asia/Calcutta", null)).toBe("Asia/Kolkata");
  });

  it("persistableIanaTimezone(local) result is allowlist-compatible after normalize", () => {
    const resolved = vi.spyOn(Intl.DateTimeFormat.prototype, "resolvedOptions");
    resolved.mockReturnValue({ timeZone: "Asia/Calcutta" } as Intl.ResolvedDateTimeFormatOptions);
    try {
      const persisted = persistableIanaTimezone("local");
      expect(persisted).toBe("Asia/Kolkata");
      expect(schedulerTimezoneSchema.safeParse(persisted).success).toBe(true);
    } finally {
      resolved.mockRestore();
    }
  });

  it("isScheduledToday uses interview timezone calendar date", () => {
    const istLateNight = "2026-09-15T20:30:00.000Z";
    const fakeNow = new Date("2026-09-16T01:00:00.000Z");
    vi.useFakeTimers();
    vi.setSystemTime(fakeNow);
    expect(isScheduledToday(istLateNight, "Asia/Kolkata")).toBe(true);
    expect(isScheduledToday(istLateNight, "UTC")).toBe(false);
    vi.useRealTimers();
  });
});
