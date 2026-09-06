import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../..");

function readShared(name: string): string {
  return fs.readFileSync(
    path.join(root, "supabase/functions/_shared", name),
    "utf8",
  );
}

describe("sessionEnforcement practice tags", () => {
  it("allows live sessions tagged practice for AI generation", () => {
    const source = readShared("sessionEnforcement.ts");
    expect(source).toContain('sessionType === "live"');
    expect(source).toContain("sessionHasPracticeFlag");
    expect(source).toContain("mergePracticeTags");
  });

  it("documents that client is_practice is not trusted at AI enforcement time", () => {
    const source = readShared("sessionEnforcement.ts");
    expect(source).toContain("Client-supplied is_practice");
    expect(source).toContain("DB tags array");
  });
});
