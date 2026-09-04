import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../..");

describe("prep-tool unknown / unpriced fail-closed", () => {
  const src = fs.readFileSync(
    path.join(root, "supabase/functions/prep-tool/index.ts"),
    "utf8",
  );
  const prepLab = fs.readFileSync(
    path.join(root, "src/pages/app/prep/PrepLab.tsx"),
    "utf8",
  );

  it("does not fall back to rephraser cost for unknown tool_id", () => {
    expect(src).not.toMatch(/TOOL_COSTS\[tool_id\]\s*\?\?\s*creditCost\("rephraser"\)/);
    expect(src).toContain('return errorResponse("Unknown tool.", "INVALID_TOOL", 400, req)');
    expect(src).toContain("getToolCost(tool_id)");
    expect(src).toMatch(/toolCost\s*==\s*null/);
  });

  it("does not allow soft UI tool ids without explicit TOOL_COSTS", () => {
    for (const id of [
      "jd_fit",
      "question_predict",
      "cover_letter",
      "salary_coach",
      "linkedin_headline",
      "culture_fit",
    ]) {
      expect(src).not.toMatch(new RegExp(`PREP_TOOL_IDS[\\s\\S]{0,200}"${id}"`));
      expect(src).not.toContain(`| "${id}"`);
    }
  });

  it("PrepLab refuses a default credit cost for unknown tools", () => {
    expect(prepLab).not.toContain("PREP_TOOL_DEFAULT_COST");
    expect(prepLab).toMatch(/function getPrepToolCost\(toolId: string\):\s*number\s*\|\s*null/);
    expect(prepLab).toContain("This prep tool is not available yet");
  });
});
