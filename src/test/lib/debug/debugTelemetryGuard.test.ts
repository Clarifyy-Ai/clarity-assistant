import { readdirSync, readFileSync } from "node:fs";
import { join, relative, sep } from "node:path";
import { describe, expect, it } from "vitest";

const LOCALHOST_INGEST = /127\.0\.0\.1:7572|localhost:7572/;

function walkSourceFiles(dir: string, skipDirNames: Set<string>): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.isDirectory()) {
      if (skipDirNames.has(entry.name)) continue;
      out.push(...walkSourceFiles(join(dir, entry.name), skipDirNames));
      continue;
    }
    if (/\.(ts|tsx|js|jsx)$/.test(entry.name)) {
      out.push(join(dir, entry.name));
    }
  }
  return out;
}

/**
 * BUG-05 / BUG-020 — production client source must not hard-code localhost
 * debug ingest URLs. Dev forwarding lives in vite.config.ts (server-side only).
 */
describe("debug telemetry source guard", () => {
  const root = process.cwd();
  const srcRoot = join(root, "src");

  it("does not hard-code localhost ingest URLs in production src (excluding tests)", () => {
    const files = walkSourceFiles(srcRoot, new Set(["test", "node_modules"]));
    const offenders: string[] = [];
    for (const file of files) {
      const rel = relative(srcRoot, file).split(sep).join("/");
      if (rel.startsWith("test/")) continue;
      const source = readFileSync(file, "utf8");
      if (LOCALHOST_INGEST.test(source)) {
        offenders.push(rel);
      }
    }
    expect(offenders).toEqual([]);
  });

  it("does not allowlist localhost ingest in index.html CSP", () => {
    const html = readFileSync(join(root, "index.html"), "utf8");
    expect(html).not.toMatch(LOCALHOST_INGEST);
    expect(html).not.toMatch(/http:\/\/127\.0\.0\.1/);
    expect(html).not.toMatch(/http:\/\/localhost/);
  });
});
