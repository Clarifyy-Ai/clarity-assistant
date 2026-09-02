import { expect, type Page } from "@playwright/test";

export const GOV_EXAM_ID = "11111111-1111-4111-8111-111111111111";
export const GOV_STAGE_ID = "22222222-2222-4222-8222-222222222222";
export const GOV_JOB_ID = "33333333-3333-4333-8333-333333333333";
export const GOV_MOCK_TEST_ID = "44444444-4444-4444-8444-444444444444";

export const GOV_REVIEW_AVAILABILITY = {
  available: 50,
  requested: 25,
  missing: 0,
  customPracticeMax: 50,
} as const;

function corsHeaders(): Record<string, string> {
  return { "access-control-allow-origin": "*" };
}

async function fulfillOptions(route: {
  request: () => { method: () => string };
  fulfill: (opts: object) => Promise<void>;
}): Promise<boolean> {
  if (route.request().method() === "OPTIONS") {
    await route.fulfill({ status: 204, headers: corsHeaders() });
    return true;
  }
  return false;
}

export async function mockGovExamGenerateRoutes(
  page: Page,
  options?: {
    availability?: typeof GOV_REVIEW_AVAILABILITY;
    basis?: "quick" | "full_sim";
  },
): Promise<void> {
  const availability = options?.availability ?? GOV_REVIEW_AVAILABILITY;
  const bankCount = options?.basis === "full_sim" ? 23 : availability.available;

  await page.route("**/functions/v1/search-exams", async (route) => {
    if (await fulfillOptions(route)) return;
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      headers: corsHeaders(),
      body: JSON.stringify({
        success: true,
        query: "",
        count: 1,
        results: [
          {
            resultType: "official_exam",
            examId: GOV_EXAM_ID,
            code: "SSC_CGL",
            name: "SSC CGL",
            family: "ssc",
            description: null,
            legacyExamType: "SSC Exams (CGL/CHSL)",
            recruitingBody: { id: "b1", code: "SSC", name: "SSC", officialUrl: null },
            aliases: [],
            stages: [{ id: GOV_STAGE_ID, code: "t1", name: "Tier 1", sort_order: 1 }],
            stage: { id: GOV_STAGE_ID, code: "t1", name: "Tier 1", sort_order: 1 },
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
              approvedPublicCount: bankCount,
              publicCount: bankCount,
              requiredQuestions: 100,
              status: bankCount >= 100 ? "ready" : "partial",
              fullSimulationAvailable: bankCount >= 100,
            },
            primaryActions: [],
          },
        ],
        disclaimer: "practice",
      }),
    });
  });

  await page.route("**/functions/v1/get-exam-details", async (route) => {
    if (await fulfillOptions(route)) return;
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      headers: corsHeaders(),
      body: JSON.stringify({
        exam: {
          examId: GOV_EXAM_ID,
          code: "SSC_CGL",
          name: "SSC CGL",
          family: "ssc",
          description: null,
          legacyExamType: "SSC Exams (CGL/CHSL)",
          aliases: [],
        },
        body: { id: "b1", code: "SSC", name: "SSC", officialUrl: null },
        stages: [{ id: GOV_STAGE_ID, code: "t1", name: "Tier 1", sort_order: 1 }],
        primaryStage: { id: GOV_STAGE_ID, code: "t1", name: "Tier 1", sort_order: 1 },
        activePatternSummary: {
          id: "pat-1",
          version: "2024",
          totalQuestions: 100,
          totalMarks: 200,
          durationMinutes: 60,
          negativeMark: 0.5,
          sourceUrl: null,
          effectiveDate: "2024-01-01",
          stageId: GOV_STAGE_ID,
        },
        syllabusSummary: null,
        languages: ["en"],
        bankReadiness: {
          approvedPublicCount: bankCount,
          publicCount: bankCount,
          requiredQuestions: 100,
          status: bankCount >= 100 ? "ready" : "partial",
          fullSimulationAvailable: bankCount >= 100,
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

  await page.route("**/functions/v1/get-exam-pattern", async (route) => {
    if (await fulfillOptions(route)) return;
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      headers: corsHeaders(),
      body: JSON.stringify({
        examId: GOV_EXAM_ID,
        stageId: GOV_STAGE_ID,
        pattern: {
          id: "pat-1",
          version: "2024",
          totalQuestions: 100,
          totalMarks: 200,
          durationMinutes: 60,
          negativeMark: 0.5,
          sourceUrl: null,
          effectiveDate: "2024-01-01",
          languages: ["en"],
          sections: [],
        },
      }),
    });
  });

  await page.route("**/functions/v1/check-exam-paper-availability", async (route) => {
    if (await fulfillOptions(route)) return;
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      headers: corsHeaders(),
      body: JSON.stringify({
        success: true,
        examId: GOV_EXAM_ID,
        stageId: GOV_STAGE_ID,
        language: "en",
        mode: "custom_mock",
        requested: availability.requested,
        available: availability.available,
        missing: availability.missing,
        fullMockAllowed: availability.available >= 100,
        customPracticeMax: availability.customPracticeMax,
        aiFillAllowed: false,
        blocked: false,
        blockCode: null,
        message: "ok",
        generationPlan: {
          kind: "bank_only",
          generator: "edge_assembler",
          bankQuestions: availability.available,
          aiQuestions: 0,
          requested: availability.requested,
          paperClass: "custom_practice",
        },
      }),
    });
  });
}

/** Walk the generate wizard to the review step (step 3). */
export async function navigateToGovExamReview(
  page: Page,
  basis: "quick" | "full_sim" = "quick",
  options?: { reviewAction?: string | RegExp; expectEnabled?: boolean },
): Promise<void> {
  await page.goto(
    `/app/mock-test/generate?examId=${GOV_EXAM_ID}&stageId=${GOV_STAGE_ID}&basis=${basis}`,
  );
  await expect(page.getByRole("heading", { name: /Generate practice paper/i })).toBeVisible({
    timeout: 30_000,
  });
  await page.getByRole("button", { name: "Continue" }).click();
  await page.getByRole("button", { name: "Continue" }).click();
  await page.getByRole("button", { name: "Continue" }).click();
  const reviewAction = options?.reviewAction ?? "Generate Practice Paper";
  const reviewButton = page.getByRole("button", { name: reviewAction });
  await expect(reviewButton).toBeVisible({ timeout: 15_000 });
  if (options?.expectEnabled !== false) {
    await expect(reviewButton).toBeEnabled({ timeout: 15_000 });
  }
}
