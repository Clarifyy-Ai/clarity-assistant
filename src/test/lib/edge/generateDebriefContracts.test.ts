import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../..");
const functionsDir = path.join(root, "supabase/functions");
const migrationsDir = path.join(root, "supabase/migrations");

function readFunction(name: string): string {
  return fs.readFileSync(path.join(functionsDir, name, "index.ts"), "utf8");
}

function readMigration(name: string): string {
  return fs.readFileSync(path.join(migrationsDir, name), "utf8");
}

describe("generate-debrief — idempotency contracts", () => {
  const source = readFunction("generate-debrief");

  it("returns persisted debrief before hybrid AI when one already exists", () => {
    const handlerStart = source.indexOf("Deno.serve");
    const handler = source.slice(handlerStart);
    const existingIdx = handler.indexOf("if (existingDebrief)");
    const enqueueIdx = handler.indexOf("insertSessionDebriefJob");
    expect(existingIdx).toBeGreaterThan(0);
    expect(enqueueIdx).toBeGreaterThan(existingIdx);
    expect(source).toContain('.from("session_debriefs")');
    expect(source).toContain("idempotent: true");
  });

  it("uses runDatabase preflight inside the background executeHybridOperation path", () => {
    expect(source).toContain("runDatabase:");
    expect(source).toContain('operation: "session_debrief"');
    const processIdx = source.indexOf("async function processSessionDebriefJob");
    const runHybridIdx = source.indexOf("async function runDebriefHybrid");
    const hybridIdx = source.indexOf("await executeHybridOperation");
    const runDbIdx = source.indexOf("runDatabase:");
    const runAiIdx = source.indexOf("runAi:");
    expect(processIdx).toBeGreaterThan(0);
    expect(runHybridIdx).toBeGreaterThan(0);
    expect(hybridIdx).toBeGreaterThan(0);
    expect(runHybridIdx).toBeLessThan(hybridIdx);
    expect(source.slice(processIdx)).toContain("runDebriefHybrid");
    expect(runDbIdx).toBeGreaterThan(0);
    expect(runAiIdx).toBeGreaterThan(runDbIdx);
  });

  it("persistDebrief handles unique-index race by re-fetching", () => {
    expect(source).toContain("async function persistDebrief");
    expect(source).toMatch(/duplicate|unique/i);
  });

  it("migration enforces unique (session_id, user_id) on session_debriefs", () => {
    const migration = readMigration("20260902280000_session_debriefs_session_user_unique.sql");
    expect(migration).toContain("idx_session_debriefs_session_user");
    expect(migration).toContain("(session_id, user_id)");
  });
});

describe("generate-debrief — NOT_SCORED contracts", () => {
  const source = readFunction("generate-debrief");

  it("returns 422 eligibility codes when no answers and no transcript", () => {
    const handlerStart = source.indexOf("Deno.serve");
    const handler = source.slice(handlerStart);
    expect(source).toContain("classifyDebriefEligibility");
    expect(source).toContain("NOT_SCORED");
    expect(source).toContain("hasScorableAnswers");
    expect(source).toContain("hasTranscriptContent");
    const eligibilityIdx = handler.indexOf("classifyDebriefEligibility");
    const enqueueIdx = handler.indexOf("insertSessionDebriefJob");
    expect(eligibilityIdx).toBeGreaterThan(0);
    expect(enqueueIdx).toBeGreaterThan(eligibilityIdx);
  });

  it("checks transcript content from session_transcripts", () => {
    expect(source).toContain('.from("session_transcripts")');
    expect(source).toContain("hasTranscriptContent");
  });

  it("fail-closed: deterministic and python runners return null", () => {
    expect(source).toMatch(/runDeterministic:\s*async\s*\(\)\s*=>\s*null/);
    expect(source).toMatch(/runPython:\s*async\s*\(\)\s*=>\s*null/);
    expect(source).not.toContain("Stayed engaged through the practice session");
    expect(source).not.toContain('overall_grade: sanitizeText(input.overall_grade, 10) || "C"');
    expect(source).toContain("validateDebriefEvidence");
    expect(source).toContain("evaluation_input_snapshot");
  });
});
