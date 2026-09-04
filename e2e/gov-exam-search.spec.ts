import { expect, test, type Page, type Route } from "@playwright/test";
import { loginAsTestUser } from "./helpers/auth-flow";

const HUB_PATH = "/app/mock-test";

type SearchOutcome = "results" | "empty" | "unavailable";

function corsHeaders(route: Route): Record<string, string> {
  const origin = route.request().headers()["origin"] ?? "http://127.0.0.1:5000";
  return {
    "access-control-allow-origin": origin,
    "access-control-allow-credentials": "true",
    vary: "Origin",
  };
}

const EXAM = {
  resultType: "official_exam",
  examId: "e2e-exam-ssc",
  code: "SSC_CGL",
  name: "SSC Combined Graduate Level",
  family: "ssc",
  description: "Tier 1 objective paper",
  legacyExamType: null,
  recruitingBody: { id: "ssc", code: "SSC", name: "Staff Selection Commission", officialUrl: null },
  aliases: ["SSC CGL"],
  stages: [{ id: "tier1", code: "tier1", name: "Tier 1", sort_order: 1 }],
  stage: { id: "tier1", code: "tier1", name: "Tier 1", sort_order: 1 },
  pattern: null,
  languages: [],
  lastVerified: null,
  primaryActions: ["view_exam", "generate_mock", "start_preparation"],
  bankReadiness: {
    approvedPublicCount: 0,
    publicCount: 0,
    requiredQuestions: 100,
    status: "empty",
    fullSimulationAvailable: false,
  },
};

/**
 * Registered after the shared mock so it takes precedence (Playwright runs the
 * most recently registered matching handler first).
 */
async function installSearchRoute(
  page: Page,
  initial: SearchOutcome,
): Promise<{ setOutcome: (next: SearchOutcome) => void; calls: () => number }> {
  let outcome = initial;
  let calls = 0;

  await page.route("**/functions/v1/search-exams", async (route) => {
    if (route.request().method() === "OPTIONS") {
      return route.fulfill({ status: 204, headers: corsHeaders(route), body: "" });
    }
    calls += 1;

    if (outcome === "unavailable") {
      return route.fulfill({
        status: 503,
        contentType: "application/json",
        headers: corsHeaders(route),
        body: JSON.stringify({
          success: false,
          code: "SEARCH_SERVICE_UNAVAILABLE",
          error: "Exam search is temporarily unavailable. Please try again.",
        }),
      });
    }

    const results = outcome === "results" ? [EXAM] : [];
    return route.fulfill({
      status: 200,
      contentType: "application/json",
      headers: corsHeaders(route),
      body: JSON.stringify({
        success: true,
        query: "",
        family: null,
        count: results.length,
        results,
        pagination: {
          page: 1,
          pageSize: 20,
          total: results.length,
          totalPages: results.length === 0 ? 0 : 1,
          hasMore: false,
        },
        isIndiaUser: true,
        disclaimer: "Career Pilot is an independent preparation platform.",
      }),
    });
  });

  return {
    setOutcome: (next) => {
      outcome = next;
    },
    calls: () => calls,
  };
}

async function submitSearch(page: Page, query: string): Promise<void> {
  const input = page.getByLabel("Search government exams");
  await input.waitFor({ state: "visible", timeout: 20_000 });
  await input.fill(query);
  await input.press("Enter");
}

test.describe("Gov exam search states", () => {
  test.beforeEach(async ({ page }) => {
    await loginAsTestUser(page);
  });

  test("shows matching exams on a successful search", async ({ page }) => {
    await installSearchRoute(page, "results");
    await page.goto(HUB_PATH);

    await expect(page.getByText(EXAM.name).first()).toBeVisible({ timeout: 20_000 });
  });

  test("an empty result set reads as no matches, not a failure", async ({ page }) => {
    await installSearchRoute(page, "empty");
    await page.goto(HUB_PATH);
    await submitSearch(page, "zzz-nonexistent-exam");

    await expect(page.getByTestId("gov-exam-search-empty")).toBeVisible({
      timeout: 20_000,
    });
    await expect(page.getByText(/temporarily unavailable/i)).toHaveCount(0);
  });

  test("an unavailable search service reads as unavailable, not empty", async ({ page }) => {
    const route = await installSearchRoute(page, "unavailable");
    await page.goto(HUB_PATH);
    await submitSearch(page, "ssc");

    await expect(
      page.getByText(/temporarily unavailable/i).first(),
    ).toBeVisible({ timeout: 20_000 });
    await expect(page.getByTestId("gov-exam-search-empty")).toHaveCount(0);
    expect(route.calls()).toBeGreaterThan(0);
  });

  test("recovers once the search service returns", async ({ page }) => {
    const route = await installSearchRoute(page, "unavailable");
    await page.goto(HUB_PATH);
    await submitSearch(page, "ssc");
    await expect(
      page.getByText(/temporarily unavailable/i).first(),
    ).toBeVisible({ timeout: 20_000 });

    route.setOutcome("results");
    await submitSearch(page, "ssc cgl");

    await expect(page.getByText(EXAM.name).first()).toBeVisible({ timeout: 20_000 });
    await expect(page.getByText(/temporarily unavailable/i)).toHaveCount(0);
  });

  test("View exam / Generate mock / Full sim navigate under mock-test (not dashboard)", async ({
    page,
  }) => {
    await installSearchRoute(page, "results");
    await page.goto(HUB_PATH);
    await expect(page.getByText(EXAM.name).first()).toBeVisible({ timeout: 20_000 });

    const view = page.getByTestId("gov-exam-view").first();
    await expect(view).toBeVisible();
    await view.click();
    await expect(page).toHaveURL(/\/app\/mock-test\/exam\/SSC_CGL/, { timeout: 20_000 });
    expect(page.url()).not.toMatch(/\/app\/dashboard/);

    await page.goto(HUB_PATH);
    await expect(page.getByText(EXAM.name).first()).toBeVisible({ timeout: 20_000 });
    await page.getByTestId("gov-exam-generate").first().click();
    await expect(page).toHaveURL(/\/app\/mock-test\/generate\?/, { timeout: 20_000 });
    expect(page.url()).toMatch(/examId=e2e-exam-ssc/);
    expect(page.url()).toMatch(/code=SSC_CGL/);
    expect(page.url()).not.toMatch(/\/app\/dashboard/);

    await page.goto(HUB_PATH);
    await expect(page.getByText(EXAM.name).first()).toBeVisible({ timeout: 20_000 });
    await page.getByTestId("gov-exam-full-sim").first().click();
    await expect(page).toHaveURL(/\/app\/mock-test\/generate\?/, { timeout: 20_000 });
    expect(page.url()).toMatch(/basis=full_sim/);
    expect(page.url()).toMatch(/code=SSC_CGL/);
    expect(page.url()).not.toMatch(/\/app\/dashboard/);
  });

  test("generate deep link preserves query after refresh", async ({ page }) => {
    await installSearchRoute(page, "results");
    await page.route("**/functions/v1/get-exam-details**", async (route) => {
      if (route.request().method() === "OPTIONS") {
        return route.fulfill({ status: 204, headers: corsHeaders(route), body: "" });
      }
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        headers: corsHeaders(route),
        body: JSON.stringify({
          success: true,
          exam: {
            examId: EXAM.examId,
            code: EXAM.code,
            name: EXAM.name,
            family: EXAM.family,
            description: EXAM.description,
            aliases: EXAM.aliases,
            legacyExamType: null,
          },
          body: EXAM.recruitingBody,
          stages: EXAM.stages,
          primaryStage: EXAM.stage,
          languages: ["en", "hi"],
          bankReadiness: EXAM.bankReadiness,
          activePatternSummary: null,
        }),
      });
    });

    const deep =
      "/app/mock-test/generate?examId=e2e-exam-ssc&stageId=tier1&code=SSC_CGL&basis=full_sim&language=en&questionCount=40";
    await page.goto(deep);
    await expect(page).toHaveURL(/\/app\/mock-test\/generate/, { timeout: 20_000 });
    expect(page.url()).not.toMatch(/\/app\/dashboard/);

    await page.reload();
    await expect(page).toHaveURL(/\/app\/mock-test\/generate/, { timeout: 20_000 });
    expect(page.url()).toMatch(/examId=e2e-exam-ssc/);
    expect(page.url()).toMatch(/code=SSC_CGL/);
    expect(page.url()).toMatch(/basis=full_sim/);
    expect(page.url()).toMatch(/language=en/);
    expect(page.url()).toMatch(/questionCount=40/);
  });

  test("invalid exam code stays on detail with not-found UI", async ({ page }) => {
    await page.route("**/functions/v1/get-exam-details**", async (route) => {
      if (route.request().method() === "OPTIONS") {
        return route.fulfill({ status: 204, headers: corsHeaders(route), body: "" });
      }
      return route.fulfill({
        status: 404,
        contentType: "application/json",
        headers: corsHeaders(route),
        body: JSON.stringify({
          success: false,
          code: "EXAM_NOT_FOUND",
          error: "Exam not found",
        }),
      });
    });

    await page.goto("/app/mock-test/exam/NOT_A_REAL_EXAM");
    await expect(page.getByTestId("gov-exam-detail")).toBeVisible({ timeout: 20_000 });
    await expect(page.getByTestId("gov-exam-detail-not-found")).toBeVisible({
      timeout: 20_000,
    });
    expect(page.url()).toMatch(/\/app\/mock-test\/exam\/NOT_A_REAL_EXAM/);
    expect(page.url()).not.toMatch(/\/app\/dashboard/);
  });
});

test.describe("Gov exam auth guard", () => {
  test.use({ storageState: { cookies: [], origins: [] } });

  test("unauthenticated generate deep link goes to login with returnTo", async ({ page }) => {
    await page.goto(
      "/app/mock-test/generate?examId=e2e-exam-ssc&code=SSC_CGL&basis=full_sim",
    );
    await expect(page).toHaveURL(/\/login/, { timeout: 20_000 });
    const url = new URL(page.url());
    const returnTo = url.searchParams.get("returnTo") ?? "";
    expect(decodeURIComponent(returnTo)).toMatch(/\/app\/mock-test\/generate/);
    expect(page.url()).not.toMatch(/\/app\/dashboard$/);
  });
});
