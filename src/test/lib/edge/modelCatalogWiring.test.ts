import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../..");
const shared = path.join(root, "supabase/functions/_shared");

function readShared(name: string): string {
  return fs.readFileSync(path.join(shared, name), "utf8");
}

describe("paid-tier model availability wiring", () => {
  it("resolveModel no longer remaps every Gemini id to 2.5-flash", () => {
    const src = readShared("resolveModel.ts");
    expect(src).toContain("getFallbackModelsAsync");
    expect(src).toContain("buildFallbackChain");
    expect(src).not.toMatch(/"gemini-2.0-flash":\s*"gemini-2.5-flash"/);
    expect(src).not.toMatch(/"gemini-pro":\s*"gemini-2.5-flash"/);
  });

  it("utils routes models by prefix instead of a closed PROVIDER_MAP", () => {
    const src = readShared("utils.ts");
    expect(src).toContain("providerForModel");
    expect(src).not.toContain("PROVIDER_MAP");
    expect(src).not.toContain("Add it to PROVIDER_MAP");
  });

  it("aiProvider tries other Gemini models on 429 before skipping OpenAI/Anthropic", () => {
    const src = readShared("aiProvider.ts");
    expect(src).toContain("getFallbackModelsAsync");
    expect(src).toContain("geminiQuotaFails");
    expect(src).toContain("skipSecondaryOnQuota");
    expect(src).not.toMatch(/skipGeminiFamily = true;\s*if \(isQuotaOrRateLimitError/);
  });

  it("catalog lists free and paid models for all three providers", () => {
    const src = readShared("modelCatalog.ts");
    expect(src).toContain("gemini-2.5-pro");
    expect(src).toContain("gemini-2.5-flash-lite");
    expect(src).toContain("gpt-4o");
    expect(src).toContain("gpt-4o-mini");
    expect(src).toContain("claude-3-5-sonnet-20241022");
    expect(src).toContain("claude-3-haiku-20240307");
  });
});
