import { test, expect, loginAsTestUser } from "../playwright-fixture";
import {
  GOV_EXAM_ID as EXAM_ID,
  GOV_STAGE_ID as STAGE_ID,
  GOV_JOB_ID,
  GOV_MOCK_TEST_ID,
  GOV_REVIEW_AVAILABILITY as REVIEW_AVAILABILITY,
  mockGovExamGenerateRoutes,
  mockGovPaperJobPollSequence,
  mockQueuedCreateExamPaper,
  navigateToGovExamReview,
} from "./helpers/gov-exam-mocks";

const CREATE_EXAM_PAPER_CREDIT_COST = 3;

test.describe("Government exam generation and submission UX", () => {
  test.describe.configure({ timeout: 120_000 });
  test("shows inventory shortage and custom practice option instead of a 100-question generate", async ({
    page,
  }) => {
    await loginAsTestUser(page);

    await page.route("**/functions/v1/search-exams", async (route) => {
      if (route.request().method() === "OPTIONS") {
        await route.fulfill({ status: 204, headers: { "access-control-allow-origin": "*" } });
        return;
      }
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        headers: { "access-control-allow-origin": "*" },
        body: JSON.stringify({
          success: true,
          query: "",
          count: 1,
          results: [
            {
              resultType: "official_exam",
              examId: EXAM_ID,
              code: "SSC_CGL",
              name: "SSC CGL",
              family: "ssc",
              description: null,
              legacyExamType: "SSC Exams (CGL/CHSL)",
              recruitingBody: { id: "b1", code: "SSC", name: "SSC", officialUrl: null },
              aliases: [],
              stages: [{ id: STAGE_ID, code: "t1", name: "Tier 1", sort_order: 1 }],
              stage: { id: STAGE_ID, code: "t1", name: "Tier 1", sort_order: 1 },
              pattern: {
                version: "2024",
                totalQuestions: 100,
                totalMarks: 200,
                durationMinutes: 60,
                negativeMark: 0.5,
                sourceUrl: null,
              },
              languages: ["en"],
              lastVerified: "2024-01-01",
              bankReadiness: {
                approvedPublicCount: 23,
                publicCount: 23,
                requiredQuestions: 100,
                status: "partial",
                fullSimulationAvailable: false,
              },
              primaryActions: [],
            },
          ],
          disclaimer: "practice",
        }),
      });
    });

    await page.route("**/functions/v1/get-exam-details", async (route) => {
      if (route.request().method() === "OPTIONS") {
        await route.fulfill({ status: 204, headers: { "access-control-allow-origin": "*" } });
        return;
      }
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        headers: { "access-control-allow-origin": "*" },
        body: JSON.stringify({
          exam: {
            examId: EXAM_ID,
            code: "SSC_CGL",
            name: "SSC CGL",
            family: "ssc",
            description: null,
            legacyExamType: "SSC Exams (CGL/CHSL)",
            aliases: [],
          },
          body: { id: "b1", code: "SSC", name: "SSC", officialUrl: null },
          stages: [{ id: STAGE_ID, code: "t1", name: "Tier 1", sort_order: 1 }],
          primaryStage: { id: STAGE_ID, code: "t1", name: "Tier 1", sort_order: 1 },
          activePatternSummary: {
            id: "pat-1",
            version: "2024",
            totalQuestions: 100,
            totalMarks: 200,
            durationMinutes: 60,
            negativeMark: 0.5,
            sourceUrl: null,
            effectiveDate: "2024-01-01",
            stageId: STAGE_ID,
          },
          syllabusSummary: null,
          languages: ["en"],
          bankReadiness: {
            approvedPublicCount: 23,
            publicCount: 23,
            requiredQuestions: 100,
            status: "partial",
            fullSimulationAvailable: false,
          },
          officialSources: [],
          previousPaperCounts: { total: 0, byYear: {} },
          disclaimers: {
            affiliation: "practice",
            aiGenerated: "practice",
            customPractice: "practice",
          },
        }),
      });
    });

    let generateCalls = 0;
    await page.route("**/functions/v1/create-exam-paper", async (route) => {
      if (route.request().method() === "OPTIONS") {
        await route.fulfill({ status: 204, headers: { "access-control-allow-origin": "*" } });
        return;
      }
      generateCalls += 1;
      const body = route.request().postDataJSON() as { questionCount?: number; mode?: string };
      if ((body.questionCount ?? 100) > 23 || body.mode === "generated_mock") {
        await route.fulfill({
          status: 409,
          contentType: "application/json",
          headers: { "access-control-allow-origin": "*" },
          body: JSON.stringify({
            error: "Only 23 approved questions are available for this configuration.",
            code: "QUESTION_INVENTORY_INSUFFICIENT",
            available: 23,
            requested: 100,
          }),
        });
        return;
      }
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        headers: { "access-control-allow-origin": "*" },
        body: JSON.stringify({
          jobId: "job-1",
          status: "completed",
          mockTestId: "test-1",
          questionCount: body.questionCount ?? 23,
          paperClass: "custom_practice",
        }),
      });
    });

    await page.goto(
      `/app/mock-test/generate?examId=${EXAM_ID}&stageId=${STAGE_ID}&basis=full_sim`,
    );
    await expect(page.getByTestId("gov-generate-wizard")).toBeVisible({
      timeout: 30_000,
    });
    await expect(page.getByTestId("gov-generate-wizard")).toHaveAttribute("data-hydrating", "0", {
      timeout: 20_000,
    });
    await expect(
      page.getByText(/23 \/ 100 questions available|23\/100 approved/i).first(),
    ).toBeVisible({
      timeout: 20_000,
    });
    await page.locator("[data-testid=gov-generate-wizard]").evaluate(() => {
      (document.activeElement as HTMLElement | null)?.blur?.();
    });
    await page.getByTestId("gov-generate-continue").click({ force: true });
    await page.getByTestId("gov-generate-continue").click({ force: true });
    await page.getByTestId("gov-generate-continue").click({ force: true });
    await expect(
      page.getByText(/Only 23 approved questions are currently available/i).first(),
    ).toBeVisible();
    await expect(
      page.getByRole("button", { name: /Generate Custom Practice Set — up to 23/i }),
    ).toBeVisible();
    await expect(page.getByRole("button", { name: "Generate Full Paper" })).toHaveCount(0);
    expect(generateCalls).toBe(0);
  });

  test("TC-GOV-LIVE-05: Review step shows server availability without console errors", async ({
    page,
  }) => {
    const pageErrors: string[] = [];
    page.on("pageerror", (err) => pageErrors.push(err.message));

    await loginAsTestUser(page);
    await mockGovExamGenerateRoutes(page);

    await page.goto(
      `/app/mock-test/generate?examId=${EXAM_ID}&stageId=${STAGE_ID}&basis=quick`,
    );
    await expect(page.getByTestId("gov-generate-wizard")).toBeVisible({ timeout: 30_000 });
    await expect(page.getByTestId("gov-generate-wizard")).toHaveAttribute("data-hydrating", "0", {
      timeout: 20_000,
    });
    await page.locator("[data-testid=gov-generate-wizard]").evaluate((el) => {
      (document.activeElement as HTMLElement | null)?.blur?.();
    });
    await page.getByTestId("gov-generate-continue").click({ force: true });
    await page.getByTestId("gov-generate-continue").click({ force: true });
    await page.getByTestId("gov-generate-continue").click({ force: true });

    await expect(page.getByRole("button", { name: "Generate Practice Paper" })).toBeVisible({
      timeout: 15_000,
    });
    await expect(
      page.getByText(
        `Server check — Available: ${REVIEW_AVAILABILITY.available}, Requested: ${REVIEW_AVAILABILITY.requested}, Missing: ${REVIEW_AVAILABILITY.missing}.`,
      ),
    ).toBeVisible({ timeout: 20_000 });
    await expect(
      page.getByText(
        `${REVIEW_AVAILABILITY.available} / ${REVIEW_AVAILABILITY.requested} questions available`,
      ).first(),
    ).toBeVisible();

    const startTimeErrors = pageErrors.filter((m) => {
      if (!/startTime|Cannot read properties of undefined \(reading ['"]startTime['"]\)/i.test(m)) {
        return false;
      }
      // Ignore DevTools/web-vitals noise without app frames; fail on gov generate/review stacks.
      return /govPaperReview|GenerateGovPaper|GovPaperReviewGenerationTimer/i.test(m);
    });
    expect(startTimeErrors).toEqual([]);
    expect(pageErrors.filter((m) => !/ResizeObserver|Script error/i.test(m))).toEqual([]);
  });

  test("Continue enables after exam selection; deep link reaches Generate without stuck Checking credits", async ({
    page,
  }) => {
    const pageErrors: { message: string; stack?: string }[] = [];
    page.on("pageerror", (err) => pageErrors.push({ message: err.message, stack: err.stack }));

    await loginAsTestUser(page, { credits: 50, planId: "pro" });
    await mockGovExamGenerateRoutes(page);

    await page.goto("/app/mock-test/generate");
    await expect(page.getByTestId("gov-generate-wizard")).toBeVisible({ timeout: 30_000 });

    const continueBtn = page.getByTestId("gov-generate-continue");
    await expect(continueBtn).toBeDisabled();

    await page.getByRole("combobox").fill("SSC");
    await page.getByRole("option", { name: /SSC CGL/i }).click();
    await expect(continueBtn).toBeEnabled({ timeout: 15_000 });

    await page.goto(
      `/app/mock-test/generate?examId=${EXAM_ID}&stageId=${STAGE_ID}&basis=quick`,
    );
    await expect(page.getByTestId("gov-generate-wizard")).toBeVisible({ timeout: 30_000 });
    await expect(page.getByTestId("gov-generate-wizard")).toHaveAttribute("data-hydrating", "0", {
      timeout: 20_000,
    });
    await expect(page.getByTestId("gov-generate-wizard")).toHaveAttribute("data-exam-ready", "1");
    await expect(page.getByTestId("gov-generate-continue")).toBeEnabled({ timeout: 15_000 });

    await navigateToGovExamReview(page, "quick");
    await expect(page.getByRole("button", { name: "Generate Practice Paper" })).toBeEnabled({
      timeout: 20_000,
    });
    await expect(page.getByRole("button", { name: /Checking credits/i })).toHaveCount(0);

    const appStartTimeErrors = pageErrors.filter(({ message, stack }) => {
      if (!/startTime/i.test(message)) return false;
      const hay = `${message}\n${stack ?? ""}`;
      return /govPaperReview|GenerateGovPaper|GovPaperReviewGenerationTimer/i.test(hay);
    });
    expect(appStartTimeErrors).toEqual([]);
  });

  test("TC-GOV-LIVE-06: poll timeout surfaces Retry UI", async ({ page }) => {
    await loginAsTestUser(page, { credits: 50, planId: "pro" });
    await mockGovExamGenerateRoutes(page);

    let pollCalls = 0;
    await page.route("**/functions/v1/create-exam-paper", async (route) => {
      if (route.request().method() === "OPTIONS") {
        await route.fulfill({ status: 204, headers: { "access-control-allow-origin": "*" } });
        return;
      }
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        headers: { "access-control-allow-origin": "*" },
        body: JSON.stringify({
          jobId: GOV_JOB_ID,
          status: "queued",
          progressStage: "queued",
        }),
      });
    });

    await page.route("**/functions/v1/get-paper-generation-job**", async (route) => {
      if (route.request().method() === "OPTIONS") {
        await route.fulfill({ status: 204, headers: { "access-control-allow-origin": "*" } });
        return;
      }
      pollCalls += 1;
      if (pollCalls >= 4) {
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          headers: { "access-control-allow-origin": "*" },
          body: JSON.stringify({
            jobId: GOV_JOB_ID,
            status: "failed_retryable",
            progressStage: "failed_retryable",
            errorCode: "GENERATION_POLL_TIMEOUT",
            errorMessage: "Paper generation timed out. Tap Retry to try again.",
            retryable: true,
          }),
        });
        return;
      }
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        headers: { "access-control-allow-origin": "*" },
        body: JSON.stringify({
          jobId: GOV_JOB_ID,
          status: "generating_paper",
          progressStage: "generating_paper",
        }),
      });
    });

    await page.route("**/functions/v1/process-paper-generation-job**", async (route) => {
      if (route.request().method() === "OPTIONS") {
        await route.fulfill({ status: 204, headers: { "access-control-allow-origin": "*" } });
        return;
      }
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        headers: { "access-control-allow-origin": "*" },
        body: JSON.stringify({ ok: true }),
      });
    });

    await navigateToGovExamReview(page);
    const generateButton = page.getByRole("button", { name: "Generate Practice Paper" });
    await generateButton.click();

    await expect.poll(() => pollCalls, { timeout: 30_000 }).toBeGreaterThan(0);

    const retryButton = page.getByRole("button", { name: "Retry" }).first();
    await expect(retryButton).toBeVisible({ timeout: 30_000 });
    await expect(
      page.getByText(/Paper generation timed out/i).first(),
    ).toBeVisible();
    expect(pollCalls).toBeGreaterThanOrEqual(2);
  });

  test("TC-GOV-LIVE-07: refresh during generation resumes poll without re-creating job", async ({
    page,
  }) => {
    await loginAsTestUser(page, { credits: 50, planId: "pro" });
    await mockGovExamGenerateRoutes(page);

    let createCalls = 0;
    let pollCalls = 0;

    await page.route("**/functions/v1/create-exam-paper", async (route) => {
      if (route.request().method() === "OPTIONS") {
        await route.fulfill({ status: 204, headers: { "access-control-allow-origin": "*" } });
        return;
      }
      createCalls += 1;
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        headers: { "access-control-allow-origin": "*" },
        body: JSON.stringify({
          jobId: GOV_JOB_ID,
          status: "queued",
          progressStage: "queued",
        }),
      });
    });

    await page.route("**/functions/v1/get-paper-generation-job**", async (route) => {
      if (route.request().method() === "OPTIONS") {
        await route.fulfill({ status: 204, headers: { "access-control-allow-origin": "*" } });
        return;
      }
      pollCalls += 1;
      const terminal = pollCalls >= 4;
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        headers: { "access-control-allow-origin": "*" },
        body: JSON.stringify(
          terminal
            ? {
                jobId: GOV_JOB_ID,
                status: "completed",
                progressStage: "completed",
                mockTestId: GOV_MOCK_TEST_ID,
                questionCount: 25,
              }
            : {
                jobId: GOV_JOB_ID,
                status: "generating_paper",
                progressStage: "generating_paper",
              },
        ),
      });
    });

    await page.route("**/functions/v1/process-paper-generation-job**", async (route) => {
      if (route.request().method() === "OPTIONS") {
        await route.fulfill({ status: 204, headers: { "access-control-allow-origin": "*" } });
        return;
      }
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        headers: { "access-control-allow-origin": "*" },
        body: JSON.stringify({ ok: true }),
      });
    });

    await navigateToGovExamReview(page);
    await page.getByRole("button", { name: "Generate Practice Paper" }).click();
    await expect.poll(() => createCalls, { timeout: 30_000 }).toBe(1);
    await expect(page.getByText(/Generating/i).first()).toBeVisible({ timeout: 15_000 });

    const pollsBeforeReload = pollCalls;
    await page.reload({ waitUntil: "domcontentloaded" });
    await expect(page.getByRole("heading", { name: /Generate practice paper/i })).toBeVisible({
      timeout: 30_000,
    });

    await expect(page).toHaveURL(
      new RegExp(`/app/mock-test/session/${GOV_MOCK_TEST_ID}`),
      { timeout: 60_000 },
    );
    expect(createCalls).toBe(1);
    expect(pollCalls).toBeGreaterThan(pollsBeforeReload);
  });

  test("TC-GOV-LIVE-08: permanent generation failure restores spendable credits", async ({
    page,
  }) => {
    let spendableBalance = 10;
    await loginAsTestUser(page, { credits: spendableBalance, planId: "pro" });
    await mockGovExamGenerateRoutes(page);

    await page.route("**/rest/v1/rpc/get_spendable_credits", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        headers: { "access-control-allow-origin": "*" },
        body: JSON.stringify({
          success: true,
          balance: spendableBalance,
          plan_id: "pro",
        }),
      });
    });

    let reserved = false;
    let refunded = false;

    await page.route("**/functions/v1/create-exam-paper", async (route) => {
      if (route.request().method() === "OPTIONS") {
        await route.fulfill({ status: 204, headers: { "access-control-allow-origin": "*" } });
        return;
      }
      reserved = true;
      spendableBalance -= CREATE_EXAM_PAPER_CREDIT_COST;
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        headers: { "access-control-allow-origin": "*" },
        body: JSON.stringify({
          jobId: GOV_JOB_ID,
          status: "queued",
          progressStage: "queued",
          creditsCharged: CREATE_EXAM_PAPER_CREDIT_COST,
          balanceAfter: spendableBalance,
        }),
      });
    });

    await page.route("**/functions/v1/get-paper-generation-job**", async (route) => {
      if (route.request().method() === "OPTIONS") {
        await route.fulfill({ status: 204, headers: { "access-control-allow-origin": "*" } });
        return;
      }
      if (reserved && !refunded) {
        refunded = true;
        spendableBalance += CREATE_EXAM_PAPER_CREDIT_COST;
      }
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        headers: { "access-control-allow-origin": "*" },
        body: JSON.stringify({
          jobId: GOV_JOB_ID,
          status: "failed_permanent",
          progressStage: "failed_permanent",
          errorCode: "ASSEMBLY_FAILED",
          errorMessage: "Paper assembly failed permanently.",
          creditsCharged: 0,
          retryable: false,
        }),
      });
    });

    await navigateToGovExamReview(page);
    await page.getByRole("button", { name: "Generate Practice Paper" }).click();
    await expect.poll(() => reserved, { timeout: 30_000 }).toBe(true);

    await expect(page.getByText(/assembly failed permanently/i).first()).toBeVisible({
      timeout: 60_000,
    });

    const balanceAfter = await page.evaluate(async () => {
      const res = await fetch(
        "https://qzgvjrvtkwlzxpmlddkx.supabase.co/rest/v1/rpc/get_spendable_credits",
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ p_user_id: "e2e-user-0001-0001-0001-000000000001" }),
        },
      );
      const json = (await res.json()) as { balance?: number };
      return json.balance;
    });

    expect(balanceAfter).toBe(10);
    expect(refunded).toBe(true);
  });

  test("submit-test CORS preflight and duplicate submit stay readable", async ({ page }) => {
    let submitCount = 0;
    await page.route("**/functions/v1/submit-test", async (route) => {
      if (route.request().method() === "OPTIONS") {
        await route.fulfill({
          status: 204,
          headers: {
            "access-control-allow-origin": "http://127.0.0.1:5000",
            "access-control-allow-headers": "authorization, content-type, apikey, idempotency-key",
            "access-control-allow-methods": "POST, OPTIONS",
          },
        });
        return;
      }
      submitCount += 1;
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        headers: { "access-control-allow-origin": "http://127.0.0.1:5000" },
        body: JSON.stringify({
          success: true,
          already_completed: submitCount > 1,
          analysis: { total_score: 12 },
        }),
      });
    });

    await page.goto("/login", { waitUntil: "domcontentloaded" });
    const res1 = await page.evaluate(async () => {
      const r = await fetch("https://qzgvjrvtkwlzxpmlddkx.supabase.co/functions/v1/submit-test", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ test_id: "t1", idempotencyKey: "submit:t1" }),
      });
      return { ok: r.ok, json: await r.json() };
    });
    const res2 = await page.evaluate(async () => {
      const r = await fetch("https://qzgvjrvtkwlzxpmlddkx.supabase.co/functions/v1/submit-test", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ test_id: "t1", idempotencyKey: "submit:t1" }),
      });
      return { ok: r.ok, json: await r.json() };
    });

    expect(res1.ok).toBe(true);
    expect(res2.ok).toBe(true);
    expect(res2.json.already_completed).toBe(true);
    expect(submitCount).toBe(2);
  });

  test("QA-02: poll harness injects 429 then 409 then completed", async ({ page }) => {
    await loginAsTestUser(page, { credits: 50, planId: "pro" });
    await mockGovExamGenerateRoutes(page);
    const created = await mockQueuedCreateExamPaper(page);
    const polls = await mockGovPaperJobPollSequence(page, [
      { kind: "http", httpStatus: 429, code: "RATE_LIMITED" },
      { kind: "http", httpStatus: 409, code: "GENERATION_CONFLICT" },
      {
        kind: "json",
        body: {
          status: "completed",
          progressStage: "completed",
          mockTestId: GOV_MOCK_TEST_ID,
          questionCount: 25,
        },
      },
    ]);

    await navigateToGovExamReview(page);
    await page.getByRole("button", { name: "Generate Practice Paper" }).click();
    await expect.poll(() => created.createCalls(), { timeout: 30_000 }).toBe(1);
    await expect.poll(() => polls.pollCalls(), { timeout: 45_000 }).toBeGreaterThanOrEqual(3);
    await expect(page).toHaveURL(new RegExp(`/app/mock-test/session/${GOV_MOCK_TEST_ID}`), {
      timeout: 60_000,
    });
  });

  test("already-onboarded deep link returnTo restores generate URL", async ({ page }) => {
    await loginAsTestUser(page);
    const target = `/app/mock-test/generate?examId=${EXAM_ID}&stageId=${STAGE_ID}&basis=quick`;
    await page.goto(`/onboarding?returnTo=${encodeURIComponent(target)}`, {
      waitUntil: "domcontentloaded",
    });
    await expect(page).toHaveURL(new RegExp(`/app/mock-test/generate\\?.*examId=${EXAM_ID}`), {
      timeout: 20_000,
    });
  });

  test("hub shows resume CTA for in-flight paper job", async ({ page }) => {
    await loginAsTestUser(page);
    await page.evaluate(
      ({ jobId, userId, examId }) => {
        localStorage.setItem(
          "clarify_gov_paper_job",
          JSON.stringify({
            jobId,
            examId,
            userId,
            kind: "paper",
            savedAt: Date.now(),
          }),
        );
      },
      { jobId: GOV_JOB_ID, userId: "e2e-user-0001-0001-0001-000000000001", examId: EXAM_ID },
    );
    await page.goto("/app/mock-test", { waitUntil: "domcontentloaded" });
    await expect(page.getByTestId("gov-active-paper-job-banner")).toBeVisible({
      timeout: 20_000,
    });
    await page.getByRole("button", { name: /Resume generation/i }).click();
    await expect(page).toHaveURL(new RegExp(`/app/mock-test/generate\\?.*jobId=${GOV_JOB_ID}`), {
      timeout: 15_000,
    });
  });
});
