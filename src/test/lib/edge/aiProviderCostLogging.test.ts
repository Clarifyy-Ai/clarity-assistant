import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../..");
const aiProviderPath = path.join(root, "supabase/functions/_shared/aiProvider.ts");

describe("aiProvider cost logging", () => {
  it("calls logAICost after generateWithFallback success path", () => {
    const source = fs.readFileSync(aiProviderPath, "utf8");
    const fnStart = source.indexOf("export async function generateWithFallback");
    expect(fnStart).toBeGreaterThan(0);

    const successMarker = source.indexOf("wasFallback: isFallback", fnStart);
    expect(successMarker).toBeGreaterThan(fnStart);

    const logCall = source.indexOf("logAICost(", successMarker);
    expect(logCall).toBeGreaterThan(successMarker);

    const fnThrow = source.indexOf("All AI models failed", fnStart);
    expect(fnThrow).toBeGreaterThan(logCall);
    expect(source.slice(successMarker, fnThrow)).toContain("logAICost(");
    expect(source.slice(successMarker, logCall + 200)).not.toMatch(/GEMINI_API_KEY|x-goog-api-key/);
  });
});
