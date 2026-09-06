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

  it("uses trusted database fields rather than the client practice flag", () => {
    const source = readShared("sessionEnforcement.ts");
    expect(source).toContain("Client-supplied is_practice");
    expect(source).toContain("trusted DB fields");
    expect(source).toContain("!session.interview_id");
  });

  it("does not direct users to unavailable setup modes", () => {
    const source = readShared("sessionEnforcement.ts");
    expect(source).toContain("Practice Coach or Mock Interview");
    expect(source).not.toContain("Use Mock, Warmup, or Live Rehearsal");
  });
});
