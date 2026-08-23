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

  it("resolves the capability-aware plan before credit deduction", () => {
    // The AI-fill gate lives in decideGenerationPlan, which is fed hasCapability.
    expect(src).toMatch(/decideGenerationPlan\s*\(/);
    expect(src).toMatch(/hasCapability\s*\(/);
    expect(src).toContain("gov_exam_ai_fill");

    const planIdx = src.lastIndexOf("decideGenerationPlan(");
    const creditIdx = src.lastIndexOf("deductCreditsAtomic(");
    expect(planIdx).toBeGreaterThan(0);
    expect(creditIdx).toBeGreaterThan(planIdx);
  });

  it("refuses a blocked plan before spending credits", () => {
    const blockedIdx = src.indexOf('plan.kind === "blocked"');
    const creditIdx = src.lastIndexOf("deductCreditsAtomic(");
    expect(blockedIdx).toBeGreaterThan(0);
    expect(creditIdx).toBeGreaterThan(blockedIdx);
    expect(src).toContain("blockedPlanPayload");
  });

  it("keeps official previous papers outside the AI-fill gate", () => {
    const planSrc = fs.readFileSync(
      path.join(root, "supabase/functions/_shared/govGenerationPlan.ts"),
      "utf8",
    );
    // official_previous is deliberately absent from the AI-eligible set, so a
    // reproduction of a real paper can never be padded with generated questions.
    const eligible = planSrc.match(/AI_ELIGIBLE_MODES = new Set\(\[([^\]]*)\]\)/);
    expect(eligible).not.toBeNull();
    expect(eligible![1]).toContain("generated_mock");
    expect(eligible![1]).not.toContain("official_previous");
  });
});
