import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../..");

describe("official PYQ block on create", () => {
  it("create-exam-paper rejects when inventory below required for official_previous", () => {
    const create = fs.readFileSync(
      path.join(root, "supabase/functions/create-exam-paper/index.ts"),
      "utf8",
    );
    expect(create).toContain("sourcePolicyForMode");
    expect(create).toMatch(/countEligibleGovQuestions|inventory/i);
    expect(create).toMatch(/official_previous|INSUFFICIENT|reject|block/i);
  });

  it("availability and create share sourcePolicyForMode", () => {
    const inv = fs.readFileSync(
      path.join(root, "supabase/functions/_shared/govQuestionInventory.ts"),
      "utf8",
    );
    expect(inv).toContain('mode === "official_previous" ? "public_pyp" : "approved_bank"');
  });
});
