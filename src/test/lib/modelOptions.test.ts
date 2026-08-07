import { describe, it, expect } from "vitest";
import {
  clampPreferredModel,
  hasProModelAccess,
  isFreeModel,
  isModelAvailableForPlan,
  normalizePreferredModel,
} from "@/lib/ai/modelOptions";

describe("modelOptions plan gating", () => {
  it("marks GPT/Claude as Pro-only and Gemini as free", () => {
    expect(isFreeModel("gemini-flash")).toBe(true);
    expect(isFreeModel("gemini-pro")).toBe(true);
    expect(isFreeModel("gpt-4o")).toBe(false);
    expect(isFreeModel("claude-3-5-sonnet")).toBe(false);
  });

  it("locks Pro models for free/starter display tiers", () => {
    expect(hasProModelAccess("free")).toBe(false);
    expect(hasProModelAccess("starter")).toBe(false);
    expect(hasProModelAccess("pro")).toBe(true);
    expect(isModelAvailableForPlan("gpt-4o", "free")).toBe(false);
    expect(isModelAvailableForPlan("gemini-pro", "free")).toBe(true);
    expect(isModelAvailableForPlan("gpt-4o", "pro")).toBe(true);
  });

  it("clamps locked selections to gemini-flash", () => {
    expect(clampPreferredModel("gpt-4o", "free")).toBe("gemini-flash");
    expect(clampPreferredModel("claude-3-5-sonnet", "starter")).toBe("gemini-flash");
    expect(clampPreferredModel("gpt-4o", "pro")).toBe("gpt-4o");
  });

  it("normalizes legacy Gemini Pro aliases", () => {
    expect(normalizePreferredModel("gemini-1-5-pro")).toBe("gemini-pro");
    expect(normalizePreferredModel("gemini-1.5-pro")).toBe("gemini-pro");
  });
});
