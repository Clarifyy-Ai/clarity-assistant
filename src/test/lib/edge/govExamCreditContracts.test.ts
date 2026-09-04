import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../..");

function readFn(name: string): string {
  return fs.readFileSync(path.join(root, "supabase/functions", name, "index.ts"), "utf8");
}

describe("gov exam credit/inventory contracts", () => {
  it("keeps availability free and separates official/PYQ inventory from mocks", () => {
    const src = readFn("check-exam-paper-availability");
    expect(src).toContain('sourcePolicy: mode === "official_previous" ? "public_pyp" : "approved_bank"');
    expect(src).toContain('mode !== "official_previous" && isPythonGovExamConfigured()');
    expect(src).toContain('inventoryClass:');
    expect(src).toContain("sourceCounts");
    expect(src).toContain("allowedFallback");
    expect(src).toContain('billable: false');
    expect(src).toContain('creditCost: 0');
    expect(src).toContain('creditsCharged: 0');
    expect(src).toContain('decideRoute({ operation: "gov_exam_assemble" })');
    expect(src).toContain("isPythonForceUnavailable");
    expect(src).not.toContain("reservePaperJobCredits");
  });

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
    const creditIdx = src.indexOf("createReservedPaperJob(");
    expect(inventoryIdx).toBeGreaterThan(0);
    expect(creditIdx).toBeGreaterThan(inventoryIdx);
    expect(src).toContain("createReservedPaperJob");
    const claimSrc = fs.readFileSync(
      path.join(root, "supabase/functions/_shared/claimJobCredits.ts"),
      "utf8",
    );
    expect(claimSrc).toContain("reserve_gov_paper_credits");
    expect(claimSrc).toContain("refundClaimedPaperCredits");
    expect(claimSrc).toContain("markJobCreditsReleased");
    expect(claimSrc).not.toMatch(
      /return claimJobCreditsForRefund\(db, jobId\)/,
    );
    expect(src).not.toMatch(/error:\s*"Insufficient credits"[\s\S]{0,80}code:\s*"INSUFFICIENT_CREDITS"/);
  });

  it("create-exam-paper prefetches spendable credits before job insert", () => {
    const src = readFn("create-exam-paper");
    expect(src).toContain("preflightSpendableCredits");
    const preflightIdx = src.indexOf("preflightSpendableCredits");
    const enqueueIdx = src.indexOf("createReservedPaperJob(db,");
    expect(preflightIdx).toBeGreaterThan(0);
    expect(preflightIdx).toBeLessThan(enqueueIdx);
    const claimSrc = fs.readFileSync(
      path.join(root, "supabase/functions/_shared/claimJobCredits.ts"),
      "utf8",
    );
    expect(claimSrc).toContain("get_spendable_credits");
    const preflightFn = claimSrc.slice(
      claimSrc.indexOf("preflightSpendableCredits"),
      claimSrc.indexOf("export async function finalizePaperJobCredits"),
    );
    expect(preflightFn).not.toContain("reserve_gov_paper_credits");
  });

  it("create-exam-paper refunds reserved credits when enqueue dispatch throws", () => {
    const src = readFn("create-exam-paper");
    expect(src).toContain("refundClaimedPaperCredits");
    expect(src).toContain("ENQUEUE_DISPATCH_FAILED");
    expect(src).toContain("scheduleWithWaitUntil");
  });

  it("get-paper-generation-job refunds via refundClaimedPaperCredits on terminal failure", () => {
    const src = readFn("get-paper-generation-job");
    expect(src).toContain("refundClaimedPaperCredits");
    expect(src).toContain("finalizePaperJobCredits");
    expect(src).not.toContain("releasePaperJobCredits");
    const releaseBranch = src.slice(
      src.indexOf('publicStatus === "completed"'),
      src.indexOf("return json(req", src.indexOf('publicStatus === "completed"')),
    );
    expect(releaseBranch).not.toContain('publicStatus === "failed_retryable"');
  });

  it("release_gov_paper_credits migration fails closed when refund_credits fails", () => {
    const migration = fs.readFileSync(
      path.join(root, "supabase/migrations/20260902231000_gov_paper_atomic_enqueue_and_sweeper.sql"),
      "utf8",
    );
    expect(migration).toContain("REFUND_FAILED");
    expect(migration).toContain("COALESCE((v_refund->>'success')::boolean, false) IS NOT TRUE");
  });

  it("generate-topic-practice refunds on inventory shortfall", () => {
    const src = readFn("generate-topic-practice");
    expect(src).toContain("refund_topic_practice_insufficient");
    expect(src).toContain("refundClaimedPaperCredits");
    expect(src).toContain("finalizePaperJobCredits");
    const inventoryIdx = src.indexOf("countEligibleGovQuestions");
    const creditIdx = src.indexOf("createReservedPaperJob(db,");
    expect(inventoryIdx).toBeGreaterThan(0);
    expect(creditIdx).toBeGreaterThan(inventoryIdx);
    expect(src).toContain("creditDenialResponse");
    expect(src).toContain("preflightSpendableCredits");
    const topicPreflightIdx = src.indexOf("preflightSpendableCredits");
    expect(topicPreflightIdx).toBeGreaterThan(0);
    expect(topicPreflightIdx).toBeLessThan(creditIdx);
    expect(src).toContain("pythonGovAvailability");
    expect(src).toContain("pythonGovProcessJob");
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
    expect(src).toContain("QUESTION_INVENTORY_INSUFFICIENT");
    expect(src).toContain("shouldInvokeAiFill");
    expect(src).toContain("fillUntilCount");
  });

  it("paper jobs treat unique idempotency conflicts as replays, not refunds", () => {
    const createSrc = readFn("create-exam-paper");
    const topicSrc = readFn("generate-topic-practice");
    expect(createSrc).toContain("createReservedPaperJob");
    expect(topicSrc).toContain("createReservedPaperJob");
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
    expect(src).toContain("save_owned_test_answer");
    expect(src).toContain("createUserScopedClient");
    expect(src).toContain("client_updated_at");
    expect(src).toContain("ATTEMPT_NOT_STARTED");
    expect(src).toContain("ATTEMPT_EXPIRED");
    expect(src).toContain("SUBMISSION_CONFLICT");
    expect(src).toContain("ATTEMPT_INVALIDATED");
  });
});

describe("gov exam runner client contracts", () => {
  it("GovExamDetail persists and resumes topic-practice jobs without a second charge", () => {
    const page = fs.readFileSync(
      path.join(root, "src/pages/app/mock-test/GovExamDetail.tsx"),
      "utf8",
    );
    expect(page).toContain('kind: "topic_practice"');
    expect(page).toContain("saveActivePaperJob");
    expect(page).toContain('loadActivePaperJob(userId, "topic_practice")');
    expect(page).toContain("getPaperGenerationJob");
    expect(page).toContain("retryTopicPractice");
    expect(page).toContain("processPaperGenerationJob");
  });

  it("GenerateGovPaper gates generation on spendable credits", () => {
    const page = fs.readFileSync(
      path.join(root, "src/pages/app/mock-test/GenerateGovPaper.tsx"),
      "utf8",
    );
    expect(page).toContain("evaluateGovExamCreditGate");
    expect(page).toContain('kind: "paper"');
    expect(page).toContain("ensureSufficientCreditsForGeneration");
    expect(page).toContain("openUpgradeIfInsufficientCredits");
    expect(page).toContain("fetchSpendableCredits");
    const creditCheckIdx = page.indexOf("ensureSufficientCreditsForGeneration");
    const setBusyIdx = page.indexOf("setBusy(true)", creditCheckIdx);
    expect(creditCheckIdx).toBeGreaterThan(0);
    expect(setBusyIdx).toBeGreaterThan(creditCheckIdx);
  });

  it("GenerateGovPaper releases credits on all terminal failures via cancel-paper-generation-job", () => {
    const page = fs.readFileSync(
      path.join(root, "src/pages/app/mock-test/GenerateGovPaper.tsx"),
      "utf8",
    );
    const cancelFn = fs.readFileSync(
      path.join(root, "supabase/functions/cancel-paper-generation-job/index.ts"),
      "utf8",
    );

    const releaseFn = page.slice(
      page.indexOf("function releaseCreditsOnTerminalFailure"),
      page.indexOf("function examCategoryLabel"),
    );
    expect(releaseFn).toContain("cancelPaperGenerationJob(jobId)");
    // Must not gate release on poll-timeout only.
    expect(releaseFn).not.toContain("GENERATION_POLL_TIMEOUT");
    expect(releaseFn).not.toContain("isPaperJobPollTimeoutError");
    expect(releaseFn).not.toMatch(/if\s*\(\s*!timedOut\s*\)\s*return/);

    const failedRetryable = page.slice(
      page.indexOf('terminal === "failed_retryable"'),
      page.indexOf('terminal === "failed_permanent"'),
    );
    expect(failedRetryable).toContain("releaseCreditsOnTerminalFailure(current)");

    const failedPermanent = page.slice(
      page.indexOf('terminal === "failed_permanent"'),
      page.indexOf('terminal === "cancelled"'),
    );
    expect(failedPermanent).toContain("releaseCreditsOnTerminalFailure(current)");

    // Soft client poll exit must not cancel solely because the browser stopped polling.
    const stillRunningMarker =
      "Client poll window ended — durable job may still be running. Do not cancel credits.";
    expect(page).toContain(stillRunningMarker);
    const stillRunning = page.slice(
      page.indexOf(stillRunningMarker),
      page.indexOf(stillRunningMarker) + 500,
    );
    expect(stillRunning).not.toContain("releaseCreditsOnTerminalFailure");

    expect(cancelFn).toContain("refundClaimedPaperCredits");
    expect(cancelFn).toContain("refund_cancel_already_");
  });

  it("TestSession starts and autosaves through start-exam / save-test-answer", () => {
    const session = fs.readFileSync(path.join(root, "src/pages/app/mock-test/TestSession.tsx"), "utf8");
    const api = fs.readFileSync(path.join(root, "src/lib/gov-exam/api.ts"), "utf8");
    expect(session).toContain("startExam(");
    expect(session).toContain("saveTestAnswers(");
    expect(session).toContain("attemptAnswerPersistence");
    expect(session).not.toContain("startExamAttempt");
    expect(session).not.toContain("saveAttemptAnswers");
    expect(api).toContain('fetchEdgeJson("start-exam"');
    expect(api).toContain('fetchEdgeJson("save-test-answer"');
  });
});
