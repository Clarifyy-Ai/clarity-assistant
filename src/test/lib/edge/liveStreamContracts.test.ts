import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../..");

function readFn(name: string): string {
  return fs.readFileSync(path.join(root, "supabase/functions", name, "index.ts"), "utf8");
}

describe("live copilot streaming contracts", () => {
  it("generate-answer streams Gemini via streamGenerateContent helper", () => {
    const source = readFn("generate-answer");
    expect(source).toContain("prepareHybridStreamOperation");
    expect(source).toContain("streamGeminiContent");
    expect(source).toContain("createSseStreamResponse");
    expect(source).toContain("livePythonTimeoutMs");
    expect(source).toContain("ttft_ms");
    expect(source).not.toContain("runGeminiNonStream");
    expect(source).toContain("executeHybridOperation");
    expect(source).toContain('operation: "live_answer"');
  });

  it("generate-hint streams when Accept is text/event-stream", () => {
    const source = readFn("generate-hint");
    expect(source).toContain("requestWantsSse");
    expect(source).toContain("prepareHybridStreamOperation");
    expect(source).toContain("streamGeminiContent");
    expect(source).toContain("executeHybridOperation");
    expect(source).toContain("AI returned empty hints");
    expect(source).toContain("hybridResult.response");
    expect(source).toContain("livePythonTimeoutMs");
  });
});
