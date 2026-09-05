import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../..");

describe("gov inventory RPC v2 migration", () => {
  it("removes blanket public_pyp OR that counted all approved questions", () => {
    const sql = fs.readFileSync(
      path.join(root, "supabase/migrations/20260905140000_gov_exam_inventory_public_pyp_fix.sql"),
      "utf8",
    );
    expect(sql).toContain("gov_inventory_v2");
    expect(sql).not.toMatch(/p_source_policy\s*=\s*'public_pyp'\s*\n\s*OR q\.is_verified/);
    expect(sql).toContain("p_source_policy <> 'public_pyp'");
  });

  it("govQuestionInventory uses RPC for all examId paths including public_pyp", () => {
    const src = fs.readFileSync(
      path.join(root, "supabase/functions/_shared/govQuestionInventory.ts"),
      "utf8",
    );
    expect(src).toContain('p_source_policy: sourcePolicy');
    expect(src).not.toContain('sourcePolicy !== "public_pyp"');
    expect(src).toContain("RPC failed");
  });

  it("create-exam-paper passes sourcePolicyForMode matching availability check", () => {
    const inv = fs.readFileSync(
      path.join(root, "supabase/functions/_shared/govQuestionInventory.ts"),
      "utf8",
    );
    expect(inv).toContain("sourcePolicyForMode");
    const create = fs.readFileSync(
      path.join(root, "supabase/functions/create-exam-paper/index.ts"),
      "utf8",
    );
    expect(create).toContain("sourcePolicyForMode(mode)");
    const check = fs.readFileSync(
      path.join(root, "supabase/functions/check-exam-paper-availability/index.ts"),
      "utf8",
    );
    expect(check).toContain("sourcePolicyForMode(mode)");
  });
});
