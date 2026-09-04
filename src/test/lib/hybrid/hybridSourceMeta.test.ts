import { describe, expect, it } from "vitest";
import {
  hybridSourceLabel,
  isDegradedCoachSource,
  parseHybridSource,
} from "@/lib/hybrid/hybridSourceMeta";

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
    expect(hybridSourceLabel("python")).toBe("AI unavailable");
    expect(hybridSourceLabel("deterministic")).toBe("AI unavailable");
    expect(hybridSourceLabel("ai")).toBe("AI");
    expect(hybridSourceLabel(undefined)).toBeNull();
  });

  it("flags degraded coach sources", () => {
    expect(isDegradedCoachSource("ai")).toBe(false);
    expect(isDegradedCoachSource("python")).toBe(true);
    expect(isDegradedCoachSource("deterministic")).toBe(true);
    expect(isDegradedCoachSource("fallback")).toBe(true);
  });
});
