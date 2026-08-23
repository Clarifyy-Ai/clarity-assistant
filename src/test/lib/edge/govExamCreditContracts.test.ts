import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../..");

function readFn(name: string): string {
  return fs.readFileSync(path.join(root, "supabase/functions", name, "index.ts"), "utf8");
}

describe("gov exam credit/inventory contracts", () => {
  it("create-exam-paper checks inventory and attempt limits before charging", () => {
    const src = readFn("create-exam-paper");
    expect(src).toContain("countEligibleGovQuestions");
    expect(src).toContain("checkGovExamAttemptLimit");
    expect(src).toContain("creditDenialResponse");
    // Inventory shortfalls are now resolved by the generation plan, which either
    // routes to AI or blocks with QUESTION_INVENTORY_INSUFFICIENT.
    expect(src).toContain("blockedPlanPayload");
    expect(src).toContain("attemptLimitPayload");
    expect(fs.readFileSync(path.join(root, "supabase/functions/_shared/govQuestionInventory.ts"), "utf8")).toContain(
      "QUESTION_INVENTORY_INSUFFICIENT",
    );
    expect(fs.readFileSync(path.join(root, "supabase/functions/_shared/govAttemptLimits.ts"), "utf8")).toContain(
      "MAX_ATTEMPTS_REACHED",
    );
    const inventoryIdx = src.indexOf("countEligibleGovQuestions");
    const creditIdx = src.indexOf("deductCreditsAtomic(");
    expect(inventoryIdx).toBeGreaterThan(0);
    expect(creditIdx).toBeGreaterThan(inventoryIdx);
    expect(src).not.toMatch(/error:\s*"Insufficient credits"[\s\S]{0,80}code:\s*"INSUFFICIENT_CREDITS"/);
  });

  it("generate-topic-practice does not charge before inventory is known", () => {
    const src = readFn("generate-topic-practice");
    const inventoryIdx = src.indexOf("countEligibleGovQuestions");
    const creditIdx = src.indexOf("deductCreditsAtomic(");
    expect(inventoryIdx).toBeGreaterThan(0);
    expect(creditIdx).toBeGreaterThan(inventoryIdx);
    expect(src).toContain("creditDenialResponse");
    expect(src).not.toContain("fillUntilCount");
  });

  it("deduct-credits does not map every failure to PAYMENT_REQUIRED", () => {
    const src = readFn("deduct-credits");
    expect(src).toContain("buildCreditDenialBody");
    expect(src).not.toMatch(/isInsufficient \? "PAYMENT_REQUIRED"/);
  });

  it("select-test-questions returns MAX_ATTEMPTS_REACHED instead of 402", () => {
    const src = readFn("select-test-questions");
    expect(src).toContain("checkGovExamAttemptLimit");
    expect(src).toContain("attemptLimitPayload");
    expect(src).toMatch(/status:\s*429/);
  });

  it("paper jobs treat unique idempotency conflicts as replays, not refunds", () => {
    const createSrc = readFn("create-exam-paper");
    const topicSrc = readFn("generate-topic-practice");
    expect(createSrc).toContain("isUniqueViolation");
    expect(topicSrc).toContain("isUniqueViolation");
    expect(createSrc).toContain("idempotentReplay");
  });

  it("submit-test uses shared CORS and is idempotent on completed tests", () => {
    const src = readFn("submit-test");
    expect(src).toContain("withBrowserCors");
    expect(src).toContain("already_completed");
    expect(src).toContain("claim_and_complete_test");
    expect(src).toContain("idempotencyKey");
  });
});
