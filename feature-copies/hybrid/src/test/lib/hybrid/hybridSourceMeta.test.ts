import { describe, expect, it } from "vitest";
import { hybridSourceLabel, parseHybridSource } from "@/lib/hybrid/hybridSourceMeta";

describe("hybridSourceMeta", () => {
  it("reads top-level source", () => {
    expect(parseHybridSource({ source: "python" })).toBe("python");
  });

  it("reads meta.source", () => {
    expect(parseHybridSource({ meta: { source: "deterministic" } })).toBe(
      "deterministic",
    );
  });

  it("reads scoring_source", () => {
    expect(parseHybridSource({ scoring_source: "ai" })).toBe("ai");
  });

  it("labels sources for UI", () => {
    expect(hybridSourceLabel("database")).toBe("Database");
    expect(hybridSourceLabel(undefined)).toBeNull();
  });
});
