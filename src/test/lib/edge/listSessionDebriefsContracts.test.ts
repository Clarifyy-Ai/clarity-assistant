import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../..");
const functionsDir = path.join(root, "supabase/functions");

function readFunction(name: string): string {
  return fs.readFileSync(path.join(functionsDir, name, "index.ts"), "utf8");
}

function readSrc(relative: string): string {
  return fs.readFileSync(path.join(root, relative), "utf8");
}

describe("list-session-debriefs contracts (BUG-21)", () => {
  it("includes rehearsal in interview type eligibility", () => {
    const source = readFunction("list-session-debriefs");
    expect(source).toContain('"rehearsal"');
    expect(source).toMatch(/INTERVIEW_TYPES[\s\S]*rehearsal/);
    expect(source).toMatch(/DEBRIEF_SESSION_TYPE_FILTER[\s\S]*rehearsal/);
  });

  it("returns retryable failed jobs alongside processing", () => {
    const source = readFunction("list-session-debriefs");
    expect(source).toContain('eq("status", "failed")');
    expect(source).toContain('eq("retryable", true)');
    expect(source).toContain("failedJobs");
  });

  it("client pending query includes rehearsal", () => {
    const db = readSrc("src/lib/supabase/database.ts");
    expect(db).toMatch(
      /listDebriefPendingWithEligibility[\s\S]*?\.in\("type",\s*\["mock",\s*"live",\s*"practice",\s*"rehearsal"\]/,
    );
  });

  it("client eligibility helper exports rehearsal-capable types", () => {
    const list = readSrc("src/lib/debrief/debriefList.ts");
    expect(list).toContain("DEBRIEF_ELIGIBLE_SESSION_TYPES");
    expect(list).toContain('"rehearsal"');
    expect(list).toContain('kind: "failed"');
  });
});
