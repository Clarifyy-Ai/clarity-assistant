import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * BUG-020 — client source must not hard-code localhost debug ingest URLs.
 * Dev forwarding lives in vite.config.ts (server-side only).
 */
describe("debug telemetry source guard", () => {
  const root = join(process.cwd(), "src");

  function readSrc(rel: string): string {
    return readFileSync(join(root, rel), "utf8");
  }

  it("does not hard-code localhost ingest URLs in client debug modules", () => {
    const files = [
      "lib/debug/debugIngest.ts",
      "lib/debug/debugLog161d95.ts",
      "lib/debug/debugLog4a9592.ts",
      "lib/debug/agentIngest.ts",
    ];
    for (const file of files) {
      const source = readSrc(file);
      expect(source).not.toMatch(/127\.0\.0\.1:7572/);
      expect(source).not.toMatch(/localhost:7572/);
    }
  });
});
