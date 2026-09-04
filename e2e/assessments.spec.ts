import { test, expect, loginAsTestUser, dismissCookieBanner, dismissWalkthrough } from "../playwright-fixture";
import type { Page, Route } from "@playwright/test";

const BACKEND_TEMPLATE = {
  id: "c6c64819-d48c-4e9b-a278-dd41aaba3e76",
  slug: "backend-developer",
  title: "Backend Developer Assessment",
  description: "Original backend and SQL items from the Clarify bank.",
  question_count: 6,
  duration_minutes: 18,
  passing_percentage: 60,
  marks_negative: 1,
  marks_positive: 4,
  difficulty_distribution: { EASY: 30, MEDIUM: 50, HARD: 20 },
  category_distribution: { Backend: 40, SQL: 40, Java: 20 },
  max_attempts: 5,
  is_published: true,
  is_active: true,
  strict_taxonomy: true,
  role_slug: "backend-developer",
};

const INVALID_TEMPLATE = {
  ...BACKEND_TEMPLATE,
  id: "00000000-0000-4000-8000-000000000099",
  slug: "invalid-template",
  title: "Invalid Template",
};

const EMPTY_TEMPLATE = {
  ...BACKEND_TEMPLATE,
  id: "00000000-0000-4000-8000-000000000098",
  slug: "empty-backend",
  title: "Empty Bank Assessment",
};

const LIMITED_TEMPLATE = {
  ...BACKEND_TEMPLATE,
  id: "00000000-0000-4000-8000-000000000097",
  slug: "limited-backend",
  title: "Limited Attempts Assessment",
};

const BACKEND_QUESTIONS = [
  {
    id: "q-backend-http",
    question_text: "Which HTTP status code means a resource was created?",
    question_type: "MCQ",
    options: [
      { label: "A", text: "200" },
      { label: "B", text: "201" },
      { label: "C", text: "204" },
      { label: "D", text: "304" },
    ],
    subject: "Backend",
    topic: "HTTP",
    category: "Backend",
    difficulty: "EASY",
    exam_type: "CLARIFY_ORIGINAL",
    marks_positive: 4,
    marks_negative: 1,
    has_image: false,
    image_url: null,
    latex_present: false,
    question_html: null,
    subtopic: null,
  },
  {
    id: "q-sql-having",
    question_text: "Which SQL clause filters groups after aggregation?",
    question_type: "MCQ",
    options: [
      { label: "A", text: "WHERE" },
      { label: "B", text: "HAVING" },
      { label: "C", text: "FROM" },
      { label: "D", text: "JOIN" },
    ],
    subject: "SQL",
    topic: "Aggregation",
    category: "SQL",
    difficulty: "MEDIUM",
    exam_type: "CLARIFY_ORIGINAL",
    marks_positive: 4,
    marks_negative: 1,
    has_image: false,
    image_url: null,
    latex_present: false,
    question_html: null,
    subtopic: null,
  },
];

function fulfillJson(route: Route, status: number, body: unknown): Promise<void> {
  return route.fulfill({
    status,
    contentType: "application/json",
    headers: { "access-control-allow-origin": "*" },
    body: JSON.stringify(body),
  });
}

async function mockAssessmentApis(
  page: Page,
  options?: { maxAttempts?: boolean },
): Promise<{ startCalls: { count: number; testIds: string[] } }> {
  const startCalls = { count: 0, testIds: [] as string[] };
  const attemptId = "e2e-backend-attempt-1";

  await page.route("**/*supabase.co/**", async (route) => {
    const url = route.request().url();
    const method = route.request().method();

    if (method === "OPTIONS" && url.includes("/functions/v1/check-assessment-availability")) {
      return route.fulfill({
        status: 204,
        headers: {
          "access-control-allow-origin": "http://127.0.0.1:5000",
          "access-control-allow-methods": "GET,POST,OPTIONS",
          "access-control-allow-headers": "authorization,apikey,content-type,x-idempotency-key,idempotency-key",
        },
        body: "",
      });
    }

    if (method === "OPTIONS" && url.includes("/functions/v1/assemble-assessment")) {
      return route.fulfill({
        status: 204,
        headers: {
          "access-control-allow-origin": "http://127.0.0.1:5000",
          "access-control-allow-methods": "GET,POST,OPTIONS",
          "access-control-allow-headers": "authorization,apikey,content-type,x-idempotency-key,idempotency-key",
        },
        body: "",
      });
    }

    if (url.includes("/rest/v1/exam_templates") && method === "GET") {
      return fulfillJson(route, 200, [
        BACKEND_TEMPLATE,
        INVALID_TEMPLATE,
        EMPTY_TEMPLATE,
        LIMITED_TEMPLATE,
      ]);
    }

    if (url.includes("/functions/v1/assemble-assessment") && method === "POST") {
      startCalls.count += 1;
      let templateId = BACKEND_TEMPLATE.id;
      try {
        const body = route.request().postDataJSON() as { template_id?: string };
        templateId = body.template_id ?? templateId;
      } catch {
        /* ignore */
      }
      if (templateId === INVALID_TEMPLATE.id) {
        return fulfillJson(route, 404, {
          error: "That assessment template was not found.",
          code: "ASSESSMENT_NOT_FOUND",
        });
      }
      if (templateId === EMPTY_TEMPLATE.id) {
        return fulfillJson(route, 409, {
          error: "This assessment needs 6 eligible questions, but only 1 are available. It was not started.",
          code: "INSUFFICIENT_QUESTION_INVENTORY",
          details: { requested_count: 6, available_count: 1, template_slug: "empty-backend" },
        });
      }
      if (templateId === LIMITED_TEMPLATE.id || options?.maxAttempts) {
        return fulfillJson(route, 403, {
          error: "You have reached the maximum number of attempts for this assessment.",
          code: "MAX_ATTEMPTS_REACHED",
        });
      }
      startCalls.testIds.push(attemptId);
      return fulfillJson(route, 200, {
        test_id: attemptId,
        question_count: 2,
        duration_minutes: 18,
        reused: startCalls.count > 1,
        template_slug: "backend-developer",
      });
    }

    if (url.includes("/functions/v1/check-assessment-availability") && method === "POST") {
      let ids: string[] = [];
      try {
        const body = route.request().postDataJSON() as {
          template_ids?: string[];
          template_id?: string;
        };
        ids = body.template_ids ?? (body.template_id ? [body.template_id] : []);
      } catch {
        ids = [];
      }
      const items = ids.map((id) => {
        if (id === EMPTY_TEMPLATE.id) {
          return {
            success: true,
            template_id: id,
            requested: 6,
            available: 1,
            shortage: 5,
            attempts_used: 0,
            max_attempts: 5,
            startable: false,
            code: "INSUFFICIENT_QUESTION_INVENTORY",
          };
        }
        if (id === LIMITED_TEMPLATE.id || options?.maxAttempts) {
          return {
            success: true,
            template_id: id,
            requested: 6,
            available: 6,
            shortage: 0,
            attempts_used: 5,
            max_attempts: 5,
            startable: false,
            code: "MAX_ATTEMPTS_REACHED",
          };
        }
        if (id === INVALID_TEMPLATE.id) {
          return {
            success: false,
            template_id: id,
            requested: 6,
            available: 0,
            shortage: 6,
            startable: false,
            code: "ASSESSMENT_NOT_FOUND",
          };
        }
        return {
          success: true,
          template_id: id,
          requested: 6,
          available: 6,
          shortage: 0,
          attempts_used: 0,
          max_attempts: 5,
          startable: true,
          code: null,
        };
      });
      return fulfillJson(route, 200, { success: true, items });
    }

    if (url.includes("/rest/v1/mock_tests") && method === "GET") {
      return fulfillJson(route, 200, [
        {
          id: attemptId,
          user_id: "e2e-user-0001-0001-0001-000000000001",
          test_name: "Backend Developer Assessment",
          status: "DRAFT",
          question_ids: BACKEND_QUESTIONS.map((q) => q.id),
          time_limit_minutes: 18,
          config: { source: "exam_template", template_id: BACKEND_TEMPLATE.id, template_slug: "backend-developer" },
          started_at: null,
        },
      ]);
    }

    if (url.includes("/rest/v1/questions_playable") && method === "GET") {
      return fulfillJson(route, 200, BACKEND_QUESTIONS);
    }

    return route.fallback();
  });

  return { startCalls };
}

async function openAssessments(page: Page): Promise<{ startCalls: { count: number; testIds: string[] } }> {
  await loginAsTestUser(page);
  const startCalls = await mockAssessmentApis(page);
  await page.goto("/app/assessments", { waitUntil: "domcontentloaded" });
  await dismissCookieBanner(page);
  await dismissWalkthrough(page);
  return startCalls;
}

function startButton(page: Page, templateId: string) {
  return page.getByTestId(`start-assessment-${templateId}`);
}

test.describe("Backend Developer Assessment start", () => {
  test("starts once, loads backend-relevant questions, and excludes CSS/Flexbox", async ({ page }) => {
    const { startCalls } = await openAssessments(page);
    await expect(page.getByRole("heading", { name: "Backend Developer Assessment" })).toBeVisible({ timeout: 15_000 });
    await startButton(page, BACKEND_TEMPLATE.id).click({ force: true });
    await expect(page).toHaveURL(/\/app\/assessments\/session\//, { timeout: 15_000 });
    expect(startCalls.count).toBe(1);
    await expect(page.getByText(/HTTP status code/i)).toBeVisible({ timeout: 15_000 });
    await expect(page.getByText(/Flexbox/i)).toHaveCount(0);
    await expect(page.getByText(/CSS layout/i)).toHaveCount(0);
  });

  test("double-click Start does not create a second attempt", async ({ page }) => {
    const { startCalls } = await openAssessments(page);
    const start = startButton(page, BACKEND_TEMPLATE.id);
    await start.click({ clickCount: 2, force: true });
    await expect(page).toHaveURL(/\/app\/assessments\/session\//, { timeout: 15_000 });
    expect(startCalls.count).toBeLessThanOrEqual(1);
    expect(new Set(startCalls.testIds).size).toBeLessThanOrEqual(1);
  });

  test("invalid template shows a controlled error", async ({ page }) => {
    await openAssessments(page);
    const start = startButton(page, INVALID_TEMPLATE.id);
    await expect(start).toBeDisabled({ timeout: 10_000 });
    await expect(page.getByText(/not found|cannot be started/i)).toBeVisible({ timeout: 10_000 });
    await expect(page).not.toHaveURL(/\/app\/assessments\/session\//);
  });

  test("insufficient inventory does not start the assessment", async ({ page }) => {
    await openAssessments(page);
    const start = startButton(page, EMPTY_TEMPLATE.id);
    await expect(start).toBeDisabled({ timeout: 10_000 });
    await expect(page.getByText(/needs 6 eligible questions|not enough eligible questions/i)).toBeVisible({
      timeout: 10_000,
    });
    await expect(page).not.toHaveURL(/\/app\/assessments\/session\//);
  });

  test("attempt limit shows the limit message, not a payment error", async ({ page }) => {
    await openAssessments(page);
    const start = startButton(page, LIMITED_TEMPLATE.id);
    await expect(start).toBeDisabled({ timeout: 10_000 });
    await expect(page.getByText(/maximum number of attempts/i)).toBeVisible({ timeout: 10_000 });
    await expect(page.getByText(/pay|credit|upgrade/i)).toHaveCount(0);
    await expect(page).not.toHaveURL(/\/app\/assessments\/session\//);
  });
});
