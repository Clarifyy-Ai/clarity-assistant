import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../..");

describe("hybrid assertBeforeCharge hook", () => {
  const hybrid = fs.readFileSync(
    path.join(root, "supabase/functions/_shared/hybridExecute.ts"),
    "utf8",
  );

  it("defines assertBeforeCharge on HybridExecuteInput", () => {
    expect(hybrid).toContain("assertBeforeCharge?: () => void | Promise<void>");
  });

  it("runs assertBeforeCharge before deductCreditsAtomic in executeHybridOperation", () => {
    const execIdx = hybrid.indexOf("export async function executeHybridOperation");
    const prepareIdx = hybrid.indexOf("export async function prepareHybridStreamOperation");
    const slice = hybrid.slice(execIdx, prepareIdx);
    const assertIdx = slice.indexOf("input.assertBeforeCharge");
    const creditIdx = slice.indexOf("deductCreditsAtomic(");
    expect(assertIdx).toBeGreaterThan(0);
    expect(creditIdx).toBeGreaterThan(assertIdx);
  });

  it("runs assertBeforeCharge before deductCreditsAtomic in prepareHybridStreamOperation", () => {
    const prepareIdx = hybrid.indexOf("export async function prepareHybridStreamOperation");
    const slice = hybrid.slice(prepareIdx);
    const assertIdx = slice.indexOf("input.assertBeforeCharge");
    const creditIdx = slice.indexOf("deductCreditsAtomic(");
    expect(assertIdx).toBeGreaterThan(0);
    expect(creditIdx).toBeGreaterThan(assertIdx);
  });

  it("generate-scorecard wires assertBeforeCharge for junk-answer guard", () => {
    const scorecard = fs.readFileSync(
      path.join(root, "supabase/functions/generate-scorecard/index.ts"),
      "utf8",
    );
    expect(scorecard).toContain("assertBeforeCharge:");
  });
});
