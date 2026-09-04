import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../..");

function read(rel: string): string {
  return fs.readFileSync(path.join(root, rel), "utf8");
}

describe("Gemini key resolution (Edge)", () => {
  const geminiKey = read("supabase/functions/_shared/geminiKey.ts");

  it("resolves GOOGLE_API_KEY before GEMINI_API_KEY before GOOGLE_AI_API_KEY", () => {
    const fn = geminiKey.slice(
      geminiKey.indexOf("export function resolveGeminiApiKey"),
      geminiKey.indexOf("export function resolveGeminiProbeModel"),
    );
    const google = fn.indexOf('Deno.env.get("GOOGLE_API_KEY")');
    const gemini = fn.indexOf('Deno.env.get("GEMINI_API_KEY")');
    const alias = fn.indexOf('Deno.env.get("GOOGLE_AI_API_KEY")');
    expect(google).toBeGreaterThan(-1);
    expect(gemini).toBeGreaterThan(google);
    expect(alias).toBeGreaterThan(gemini);
  });

  it("accepts AIza and AQ auth key formats", () => {
    expect(geminiKey).toMatch(/AIza/);
    expect(geminiKey).toMatch(/AQ\./);
  });

  it("probes with catalog default model (not obsolete flash-latest alone)", () => {
    expect(geminiKey).toContain("DEFAULT_TEXT_MODEL");
    expect(geminiKey).toContain("probeGeminiApiKeyDetailed");
  });
});

describe("AI gateway wiring", () => {
  it("aiProvider uses resolveGeminiApiKey and ProviderError codes", () => {
    const src = read("supabase/functions/_shared/aiProvider.ts");
    expect(src).toContain("resolveGeminiApiKey");
    expect(src).toContain("PROVIDER_NOT_CONFIGURED");
    expect(src).toContain("PROVIDER_AUTH_FAILED");
    expect(src).toContain("isFallbackEligibleError");
  });

  it("generate-answer non-Gemini path uses generateWithFallback", () => {
    const src = read("supabase/functions/generate-answer/index.ts");
    expect(src).toContain("generateWithFallback");
    const nonGemini = src.indexOf("if (!isGeminiModel(model))");
    expect(nonGemini).toBeGreaterThan(-1);
    expect(src.slice(nonGemini, nonGemini + 800)).toContain("generateWithFallback");
  });

  it("stream and gemini helpers resolve shared key", () => {
    expect(read("supabase/functions/_shared/geminiStream.ts")).toContain("resolveGeminiApiKey");
    expect(read("supabase/functions/_shared/gemini.ts")).toContain("resolveGeminiApiKey");
    expect(read("supabase/functions/_shared/utils.ts")).toContain("resolveGeminiApiKey");
  });

  it("does not expose provider secrets under VITE_*", () => {
    const example = read(".env.example");
    expect(example).not.toMatch(/VITE_GEMINI_API_KEY|VITE_OPENAI_API_KEY|VITE_ANTHROPIC_API_KEY/);
    expect(example).toContain("GOOGLE_API_KEY");
    expect(example).toContain("GEMINI_API_KEY");
  });
});

describe("Gov PYQ safety remains intact", () => {
  it("gap-fill labels ai_generated_practice and never official", () => {
    const gap = read("supabase/functions/_shared/govAiGapFill.ts");
    expect(gap).toContain('source_type: "ai_generated_practice"');
    expect(gap).toMatch(/not claimed as official/i);
    expect(gap).not.toMatch(/source_type:\s*["']official/);
    expect(gap).toContain("resolveGeminiApiKey");
  });

  it("Python official_mode blocks AI fabrication", () => {
    const policy = read("scraper/app/ai_policy.py");
    expect(policy).toContain("official_mode");
    expect(policy).toContain("if official_mode:");
    expect(policy).toContain('return "AI_NOT_PERMITTED"');
  });
});

describe("Credit operation keys remain documented", () => {
  it("hints charge live_hint; coach chat charges ai_coach_message", () => {
    const hint = read("supabase/functions/generate-hint/index.ts");
    const chat = read("supabase/functions/ai-coach-chat/index.ts");
    const economics = read("src/lib/constants/creditEconomics.ts");
    expect(hint).toContain('creditCost("live_hint")');
    expect(chat).toContain('creditCost("ai_coach_message")');
    expect(economics).toMatch(/live_hint:\s*\d+/);
    expect(economics).toMatch(/ai_coach_message:\s*\d+/);
  });
});
