import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../..");
const functionsDir = path.join(root, "supabase/functions");

function readFunction(name: string): string {
  return fs.readFileSync(path.join(functionsDir, name, "index.ts"), "utf8");
}

describe("coach-prep Wave 1 STAR / prep hybrid contracts", () => {
  it("generate-star-answer stages python draft then AI polish via runAi", () => {
    const source = readFunction("generate-star-answer");
    expect(source).toContain('operation: "star_builder"');
    expect(source).toContain('operation: "star_evidence"');
    expect(source).toContain("callPythonProcess");
    expect(source).toContain("pythonStarDraft");
    expect(source).toContain("Defer success to runAi");
    expect(source).not.toContain("STAR AI polish failed; using python draft");
    expect(source).toContain("hybridResult.response");
  });

  it("polish-star-section stages python section then AI polish", () => {
    const source = readFunction("polish-star-section");
    expect(source).toContain('operation: "star_builder"');
    expect(source).toContain('operation: "star_evidence"');
    expect(source).toContain("pythonSectionDraft");
    expect(source).toContain("textToPolish");
    expect(source).toContain("hybridResult.response");
  });

  it("prep-tool star_method uses star_evidence then AI polish", () => {
    const source = readFunction("prep-tool");
    expect(source).toContain("pythonStarMethodDraft");
    expect(source).toContain('operation: "star_evidence"');
    expect(source).toContain("formatStarDraftFromPython");
  });

  it("prep-tool system_design uses hybrid system_design with python and AI tiers", () => {
    const source = readFunction("prep-tool");
    expect(source).toContain('operation: "system_design"');
    expect(source).toContain("buildSystemDesignTemplate");
    expect(source).toContain("formatSystemDesignFromPython");
    expect(source).toContain("callPythonProcess");
    expect(source).toContain("executeHybridOperation");
  });
});
