import { describe, expect, it } from "vitest";
import { inferAiProvider } from "@/lib/admin/inferAiProvider";

describe("inferAiProvider", () => {
  it("classifies Deepgram STT and flux models", () => {
    expect(inferAiProvider("nova-2-meeting")).toBe("deepgram");
    expect(inferAiProvider("flux-general-en")).toBe("deepgram");
    expect(inferAiProvider("flux-kit-en")).toBe("deepgram");
  });

  it("classifies LLM providers", () => {
    expect(inferAiProvider("gpt-4o")).toBe("openai");
    expect(inferAiProvider("claude-3-haiku")).toBe("anthropic");
    expect(inferAiProvider("gemini-2.5-flash")).toBe("gemini");
  });
});
