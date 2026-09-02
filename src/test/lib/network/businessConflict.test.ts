import { describe, expect, it } from "vitest";
import {
  EXPECTED_BUSINESS_FAILURE_CODES,
  isExpectedBusinessFailure,
} from "@/lib/network/businessConflict";

describe("isExpectedBusinessFailure", () => {
  it("treats HTTP 409 as expected regardless of code", () => {
    expect(isExpectedBusinessFailure(409)).toBe(true);
    expect(isExpectedBusinessFailure(409, "ANYTHING")).toBe(true);
  });

  it.each([...EXPECTED_BUSINESS_FAILURE_CODES])(
    "treats %s as expected even without 409",
    (code) => {
      expect(isExpectedBusinessFailure(402, code)).toBe(true);
      expect(isExpectedBusinessFailure(400, ` ${code} `)).toBe(true);
    },
  );

  it("returns false for unexpected failures", () => {
    expect(isExpectedBusinessFailure(500)).toBe(false);
    expect(isExpectedBusinessFailure(500, "API_ERROR")).toBe(false);
    expect(isExpectedBusinessFailure(401, "AUTH_REQUIRED")).toBe(false);
  });
});
