import { describe, expect, it } from "vitest";
import {
  APP_TO_API,
  DEFAULT_TEXT_MODEL,
  GEMINI_TEXT_MODELS,
  MAX_MODELS_PER_PROVIDER,
  buildFallbackChain,
  isTextGenerationModel,
  mapAppModelToApi,
  mergeAvailable,
  providerForModel,
} from "../../../../supabase/functions/_shared/modelCatalog";

describe("modelCatalog", () => {
  it("maps gemini-pro to paid Pro, not Flash", () => {
    expect(mapAppModelToApi("gemini-pro")).toBe("gemini-2.5-pro");
    expect(APP_TO_API["gemini-flash"]).toBe("gemini-2.5-flash");
    expect(mapAppModelToApi("gpt-4o")).toBe("gpt-4o");
    expect(mapAppModelToApi("claude-3-5-sonnet")).toBe("claude-3-5-sonnet-20241022");
  });

  it("routes unknown official ids by prefix so paid/live models are not rejected", () => {
    expect(providerForModel("gemini-3.5-flash")).toBe("gemini");
    expect(providerForModel("gpt-4.1")).toBe("openai");
    expect(providerForModel("gpt-4.1-mini")).toBe("openai");
    expect(providerForModel("claude-sonnet-4-20250514")).toBe("anthropic");
    expect(providerForModel("not-a-model")).toBeNull();
  });

  it("excludes embeddings, image, and TTS models", () => {
    expect(isTextGenerationModel("gemini-2.5-flash")).toBe(true);
    expect(isTextGenerationModel("text-embedding-004")).toBe(false);
    expect(isTextGenerationModel("gemini-2.5-flash-image-preview")).toBe(false);
    expect(isTextGenerationModel("whisper-1")).toBe(false);
  });

  it("builds a mixed-provider chain from configured keys", () => {
    const chain = buildFallbackChain("gemini-flash", {
      gemini: true,
      openai: true,
      anthropic: true,
    });
    expect(chain[0]).toBe("gemini-2.5-flash");
    expect(chain.some((id) => id.startsWith("gemini"))).toBe(true);
    expect(chain).toContain("gpt-4o-mini");
    expect(chain).toContain("claude-3-haiku-20240307");
    expect(chain.length).toBeGreaterThan(3);
    expect(chain.length).toBeLessThanOrEqual(9);
  });

  it("keeps OpenAI primary then falls back to Gemini and Anthropic", () => {
    const chain = buildFallbackChain("gpt-4o", {
      gemini: true,
      openai: true,
      anthropic: true,
    });
    expect(chain[0]).toBe("gpt-4o");
    expect(chain).toContain("gpt-4o-mini");
    expect(chain.some((id) => id.startsWith("gemini"))).toBe(true);
    expect(chain.some((id) => id.startsWith("claude"))).toBe(true);
  });

  it("filters the chain to live-available models including newer Gemini ids", () => {
    const available = new Set([
      "gemini-3.5-flash",
      "gemini-2.5-flash",
      "gpt-4.1-mini",
      "claude-sonnet-4-20250514",
    ]);
    const chain = buildFallbackChain(DEFAULT_TEXT_MODEL, {
      gemini: true,
      openai: true,
      anthropic: true,
    }, {
      gemini: available,
      openai: available,
      anthropic: available,
    });
    expect(chain).toContain("gemini-2.5-flash");
    expect(chain).toContain("gemini-3.5-flash");
    expect(chain).toContain("gpt-4.1-mini");
    expect(chain).toContain("claude-sonnet-4-20250514");
    expect(chain).not.toContain("gpt-4o-mini");
  });

  it("uses the static catalog when live listing is empty", () => {
    const merged = mergeAvailable(GEMINI_TEXT_MODELS, new Set());
    expect(merged[0]).toBe(GEMINI_TEXT_MODELS[0]);
    expect(merged.length).toBe(GEMINI_TEXT_MODELS.length);
  });

  it("caps models per provider", () => {
    const chain = buildFallbackChain("gemini-2.5-flash", { gemini: true });
    const gemini = chain.filter((id) => id.startsWith("gemini"));
    expect(gemini.length).toBeLessThanOrEqual(MAX_MODELS_PER_PROVIDER);
  });
});
