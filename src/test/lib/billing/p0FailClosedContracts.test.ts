import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../..");

describe("razorpay create-order fail-closed contract", () => {
  const src = fs.readFileSync(
    path.join(root, "supabase/functions/razorpay-create-order/index.ts"),
    "utf8",
  );

  it("does not return a provider order when internal persist fails", () => {
    expect(src).toContain("ORDER_PERSIST_FAILED");
    expect(src).toContain("status: \"pending\"");
    expect(src).not.toMatch(/payment_order_id:\s*row\?\.id\s*\?\?\s*null/);
    expect(src).not.toMatch(/console\.error\("\[razorpay-create-order\] insert"/);
  });

  it("records reconciliation when provider succeeds and durable update fails", () => {
    expect(src).toContain("reconciliation_required");
    expect(src).toContain("billing_reconciliation_incidents");
  });
});

describe("create-exam-paper AI-fill capability", () => {
  const src = fs.readFileSync(
    path.join(root, "supabase/functions/create-exam-paper/index.ts"),
    "utf8",
  );

  it("calls requireCapability before credit deduction for AI modes", () => {
    expect(src).toMatch(/requireCapability\s*\(/);
    expect(src).toContain("gov_exam_ai_fill");
    const capIdx = src.lastIndexOf("requireCapability(");
    const creditIdx = src.lastIndexOf("deductCreditsAtomic(");
    expect(capIdx).toBeGreaterThan(0);
    expect(creditIdx).toBeGreaterThan(capIdx);
  });

  it("keeps official previous papers outside the AI-fill gate", () => {
    expect(src).toContain("official_previous");
    expect(src).toContain('generated_mock');
    expect(src).toContain("aiFillModes");
  });
});
