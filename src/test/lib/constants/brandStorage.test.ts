import { describe, expect, it } from "vitest";
import {
  brandExportBasename,
  BRAND_FILE_SLUG,
  localStorageGetWithLegacy,
  localStorageSetBrand,
} from "@/lib/constants/brandStorage";
import { PRODUCT_NAMES } from "@/lib/constants/productNames";

describe("Career Pilot brand storage / export helpers", () => {
  it("builds career-pilot export basenames", () => {
    expect(brandExportBasename("sessions", "2026-09-04")).toBe(
      "career-pilot-sessions-2026-09-04",
    );
    expect(BRAND_FILE_SLUG).toBe("career-pilot");
    expect(PRODUCT_NAMES.brand).toBe("Career Pilot");
  });

  it("reads legacy Clarify keys and migrates to Career Pilot keys", () => {
    const primary = "career-pilot-test-key";
    const legacy = "clarify-test-key";
    window.localStorage.removeItem(primary);
    window.localStorage.removeItem(legacy);
    window.localStorage.setItem(legacy, "legacy-value");

    const value = localStorageGetWithLegacy(primary, [legacy]);
    expect(value).toBe("legacy-value");
    expect(window.localStorage.getItem(primary)).toBe("legacy-value");

    localStorageSetBrand(primary, "new-value", [legacy]);
    expect(window.localStorage.getItem(primary)).toBe("new-value");
    expect(window.localStorage.getItem(legacy)).toBeNull();
  });
});
