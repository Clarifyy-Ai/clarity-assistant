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

  it("uses persisted profile region over browser locale", () => {
    expect(resolveIsIndiaUser({ region: "IN", locale: "en-US", timezone: "America/New_York" })).toBe(true);
    expect(resolveIsIndiaUser({ region: "US", locale: "en-IN", timezone: "Asia/Kolkata" })).toBe(false);
  });

  it("ignores the India force flag in production", () => {
    expect(honorIndiaForceFlag(true, true)).toBe(null);
    expect(honorIndiaForceFlag(false, true)).toBe(null);
    expect(honorIndiaForceFlag(true, false)).toBe(true);
    expect(honorIndiaForceFlag(false, false)).toBe(false);
  });
});
