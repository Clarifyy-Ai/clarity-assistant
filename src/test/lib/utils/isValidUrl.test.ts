import { describe, expect, it } from "vitest";
import { isValidUrl } from "@/lib/utils";

describe("isValidUrl", () => {
  it("accepts real http(s) hosts with a TLD", () => {
    expect(isValidUrl("https://example.com")).toBe(true);
    expect(isValidUrl("http://sub.example.co.uk/path")).toBe(true);
  });

  it("rejects nonsense single-label hosts like uuojj", () => {
    expect(isValidUrl("https://uuojj")).toBe(false);
    expect(isValidUrl("uuojj")).toBe(false);
  });

  it("rejects non-http schemes", () => {
    expect(isValidUrl("ftp://example.com")).toBe(false);
  });
});
