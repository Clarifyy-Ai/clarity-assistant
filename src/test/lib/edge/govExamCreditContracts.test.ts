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
    const creditIdx = src.indexOf("reservePaperJobCredits(");
    expect(inventoryIdx).toBeGreaterThan(0);
    expect(creditIdx).toBeGreaterThan(inventoryIdx);
    expect(src).toContain("credits_reserved");
    expect(src).toContain("reservePaperJobCredits");
    const claimSrc = fs.readFileSync(
      path.join(root, "supabase/functions/_shared/claimJobCredits.ts"),
      "utf8",
    );
    expect(claimSrc).toContain("reserve_gov_paper_credits");
    expect(src).not.toMatch(/error:\s*"Insufficient credits"[\s\S]{0,80}code:\s*"INSUFFICIENT_CREDITS"/);
  });

  it("generate-topic-practice does not charge before inventory is known", () => {
    const src = readFn("generate-topic-practice");
    const inventoryIdx = src.indexOf("countEligibleGovQuestions");
    const insertIdx = src.indexOf(".from(\"gov_paper_generation_jobs\")");
    const creditIdx = src.indexOf("reservePaperJobCredits(");
    expect(inventoryIdx).toBeGreaterThan(0);
    expect(insertIdx).toBeGreaterThan(inventoryIdx);
    expect(creditIdx).toBeGreaterThan(insertIdx);
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
    expect(src).toContain("ATTEMPT_NOT_STARTED");
    expect(src).toContain("snapshot_json");
    expect(src).toContain("scoringDefaults");
    expect(src).not.toMatch(/safeNumber\(question\.marks_negative,\s*1\)/);
  });

  it("start-exam is the client start path, uses DB clock, and gates India for gov exams", () => {
    const src = readFn("start-exam");
    expect(src).toContain("started_at");
    expect(src).toContain("expires_at");
    expect(src).toContain("alreadyStarted");
    expect(src).toContain("SUBMISSION_CONFLICT");
    expect(src).toContain("REGION_RESTRICTED");
    expect(src).toContain("start_owned_mock_test");
    expect(src).toContain("gov_exam_id");
  });

  it("save-test-answer rejects stale client_updated_at and expired attempts", () => {
    const src = readFn("save-test-answer");
    expect(src).toContain("client_updated_at");
    expect(src).toContain("staleQuestionIds");
    expect(src).toContain("ATTEMPT_NOT_STARTED");
    expect(src).toContain("ATTEMPT_EXPIRED");
    expect(src).toContain("SUBMISSION_CONFLICT");
  });
});

describe("gov exam runner client contracts", () => {
  it("TestSession starts and autosaves through start-exam / save-test-answer", () => {
    const session = fs.readFileSync(path.join(root, "src/pages/app/mock-test/TestSession.tsx"), "utf8");
    const api = fs.readFileSync(path.join(root, "src/lib/gov-exam/api.ts"), "utf8");
    expect(session).toContain("startExam(");
    expect(session).toContain("saveTestAnswers(");
    expect(session).not.toContain("startExamAttempt");
    expect(session).not.toContain("saveAttemptAnswers");
    expect(api).toContain('fetchEdgeJson("start-exam"');
    expect(api).toContain('fetchEdgeJson("save-test-answer"');
  });
});
