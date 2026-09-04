import { describe, expect, it } from "vitest";
import {
  honorIndiaForceFlag,
  isIndiaTimezone,
  isIndiaLocale,
  resolveIsIndiaUser,
} from "@/lib/regional/indiaRegion";

describe("india region helpers", () => {
  it("recognizes India timezones", () => {
    expect(isIndiaTimezone("Asia/Kolkata")).toBe(true);
    expect(isIndiaTimezone("America/New_York")).toBe(false);
  });

  it("recognizes India locales", () => {
    expect(isIndiaLocale("en-IN")).toBe(true);
    expect(isIndiaLocale("hi-IN")).toBe(true);
    expect(isIndiaLocale("en-US")).toBe(false);
  });

  it("allows gov exam access worldwide regardless of profile region", () => {
    expect(resolveIsIndiaUser({ region: "IN", locale: "en-US", timezone: "America/New_York" })).toBe(true);
    expect(resolveIsIndiaUser({ region: "US", locale: "en-US", timezone: "America/New_York" })).toBe(true);
    expect(resolveIsIndiaUser(null)).toBe(true);
  });

  it("ignores the India force flag in production", () => {
    expect(honorIndiaForceFlag(true, true)).toBe(null);
    expect(honorIndiaForceFlag(false, true)).toBe(null);
    expect(honorIndiaForceFlag(true, false)).toBe(true);
    expect(honorIndiaForceFlag(false, false)).toBe(false);
  });
});
