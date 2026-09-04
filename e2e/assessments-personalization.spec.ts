/**
 * Assessments personalization — Setup → Review → Start with mocked assemble-assessment.
 */
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

const DATA_ANALYST_TEMPLATE = {
  ...BACKEND_TEMPLATE,
  id: "a1a1a1a1-a1a1-41a1-81a1-a1a1a1a1a1a1",
  slug: "data-analyst",
  title: "Data Analyst Assessment",
  role_slug: "data-analyst",
  category_distribution: { SQL: 45, Aptitude: 30, Python: 25 },
};

const GENERAL_TEMPLATE = {
  ...BACKEND_TEMPLATE,
  id: "b2b2b2b2-b2b2-42b2-82b2-b2b2b2b2b2b2",
  slug: "general-aptitude",
  title: "General Aptitude Assessment",
  role_slug: "general-aptitude",
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
];

function fulfillJson(route: Route, status: number, body: unknown): Promise<void> {
  return route.fulfill({
    status,
    contentType: "application/json",
    headers: { "access-control-allow-origin": "*" },
    body: JSON.stringify(body),
  });
}

type AssembleBody = {
  template_id?: string;
  role_slug?: string;
  force_general?: boolean;
  setup?: Record<string, unknown>;
};

async function mockPersonalizationApis(page: Page): Promise<{
  assembleBodies: AssembleBody[];
}> {
  const assembleBodies: AssembleBody[] = [];
  const attemptId = "e2e-personalized-attempt-1";

  await page.route("**/*supabase.co/**", async (route) => {
    const url = route.request().url();
    const method = route.request().method();

    if (method === "OPTIONS" && (
      url.includes("/functions/v1/assemble-assessment") ||
      url.includes("/functions/v1/check-assessment-availability")
    )) {
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
      const all = [BACKEND_TEMPLATE, DATA_ANALYST_TEMPLATE, GENERAL_TEMPLATE];
      const slugMatch = url.match(/slug=eq\.([^&]+)/);
      if (slugMatch) {
        const slug = decodeURIComponent(slugMatch[1]);
        const matched = all.filter((t) => t.slug === slug);
        return fulfillJson(route, 200, matched);
      }
      return fulfillJson(route, 200, all);
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
      const items = ids.map((id) => ({
        success: true,
        template_id: id,
        requested: 6,
        available: 12,
        shortage: 0,
        attempts_used: 0,
        max_attempts: 5,
        startable: true,
        code: null,
      }));
      return fulfillJson(route, 200, { success: true, items });
    }

    if (url.includes("/functions/v1/assemble-assessment") && method === "POST") {
      let body: AssembleBody = {};
      try {
        body = route.request().postDataJSON() as AssembleBody;
      } catch {
        /* ignore */
      }
      assembleBodies.push(body);

      const role = String(body.role_slug || body.setup?.role_slug || "backend-developer");
      const forceGeneral = body.force_general === true || body.setup?.force_general === true;
      const personalized = !forceGeneral && role !== "general-aptitude";

      const whySelected =
        role === "data-analyst"
          ? "This assessment focuses on skills important for your Data Analyst target role (objective: role readiness)."
          : role === "backend-developer"
            ? "This assessment focuses on skills important for your Backend Engineer target role (objective: role readiness)."
            : "This is a general assessment. It was not personalized to a target role or résumé.";

      return fulfillJson(route, 200, {
        test_id: attemptId,
        question_count: 1,
        duration_minutes: 18,
        reused: false,
        template_slug: role === "data-analyst" ? "data-analyst" : forceGeneral ? "general-aptitude" : "backend-developer",
        personalized,
        why_selected: whySelected,
      });
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
          config: {
            source: "exam_template",
            template_id: BACKEND_TEMPLATE.id,
            template_slug: "backend-developer",
            role_slug: "backend-developer",
            assessment_objective: "role_readiness",
            personalized: true,
          },
          started_at: null,
        },
      ]);
    }

    if (url.includes("/rest/v1/questions_playable") && method === "GET") {
      return fulfillJson(route, 200, BACKEND_QUESTIONS);
    }

    return route.fallback();
  });

  return { assembleBodies };
}

async function openSetup(page: Page) {
  await loginAsTestUser(page);
  const mocks = await mockPersonalizationApis(page);
  await page.goto("/app/assessments/setup", { waitUntil: "domcontentloaded" });
  await dismissCookieBanner(page);
  await dismissWalkthrough(page);
  return mocks;
}

test.describe("Assessment personalization flow", () => {
  test("insufficient context shows fail-closed banner (not silent generic)", async ({ page }) => {
    await openSetup(page);
    await page.getByTestId("assessment-setup-role").selectOption("");
    await expect(page.getByTestId("assessment-readiness-banner")).toBeVisible();
    await expect(page.getByTestId("assessment-missing-fields")).toContainText(/Missing:/i);
    await expect(page.getByTestId("assessment-setup-continue")).toBeDisabled();
    await expect(page.getByTestId("assessment-force-general")).toBeVisible();
  });

  test("Setup → Review → Start posts setup with role_slug and personalization flags", async ({ page }) => {
    const { assembleBodies } = await openSetup(page);

    await page.getByTestId("assessment-setup-role").selectOption("backend-developer");
    await page.getByTestId("assessment-setup-objective").selectOption("role_readiness");
    await page.getByTestId("assessment-setup-experience").selectOption("mid");
    await page.getByTestId("assessment-setup-continue").click();

    await expect(page).toHaveURL(/\/app\/assessments\/review/, { timeout: 10_000 });
    await expect(page.getByTestId("assessment-review-card")).toBeVisible();
    await expect(page.getByTestId("assessment-why-selected")).toContainText(/Backend/i);

    await page.getByTestId("assessment-review-start").click();
    await expect(page).toHaveURL(/\/app\/assessments\/session\//, { timeout: 15_000 });

    expect(assembleBodies.length).toBeGreaterThanOrEqual(1);
    const body = assembleBodies[assembleBodies.length - 1];
    expect(body.role_slug).toBe("backend-developer");
    expect(body.force_general).toBeFalsy();
    expect(body.setup).toBeTruthy();
    expect(body.setup?.role_slug).toBe("backend-developer");
    expect(body.setup?.assessment_objective).toBe("role_readiness");
  });

  test("force_general path posts force_general true", async ({ page }) => {
    const { assembleBodies } = await openSetup(page);

    await page.getByTestId("assessment-force-general").click();
    await expect(page).toHaveURL(/\/app\/assessments\/review/, { timeout: 10_000 });
    await expect(page.getByText(/General assessment/i)).toBeVisible();

    await page.getByTestId("assessment-review-start").click();
    await expect(page).toHaveURL(/\/app\/assessments\/session\//, { timeout: 15_000 });

    const body = assembleBodies[assembleBodies.length - 1];
    expect(body.force_general === true || body.setup?.force_general === true).toBe(true);
  });

  test("Backend vs Data Analyst produce different why_selected / personalized responses", async ({ page }) => {
    const { assembleBodies } = await openSetup(page);

    // Backend path
    await page.getByTestId("assessment-setup-role").selectOption("backend-developer");
    await page.getByTestId("assessment-setup-objective").selectOption("role_readiness");
    await page.getByTestId("assessment-setup-experience").selectOption("mid");
    await page.getByTestId("assessment-setup-continue").click();
    await expect(page.getByTestId("assessment-why-selected")).toContainText(/Backend/i);
    await page.getByTestId("assessment-review-start").click();
    await expect(page).toHaveURL(/\/app\/assessments\/session\//, { timeout: 15_000 });

    const backendBody = assembleBodies[assembleBodies.length - 1];
    expect(backendBody.role_slug).toBe("backend-developer");

    // Data Analyst path (fresh setup)
    await page.goto("/app/assessments/setup", { waitUntil: "domcontentloaded" });
    await page.getByTestId("assessment-setup-role").selectOption("data-analyst");
    await page.getByTestId("assessment-setup-objective").selectOption("role_readiness");
    await page.getByTestId("assessment-setup-experience").selectOption("mid");
    await page.getByTestId("assessment-setup-continue").click();
    await expect(page.getByTestId("assessment-why-selected")).toContainText(/Data Analyst|sql|aptitude/i);
    await page.getByTestId("assessment-review-start").click();
    await expect(page).toHaveURL(/\/app\/assessments\/session\//, { timeout: 15_000 });

    const analystBody = assembleBodies[assembleBodies.length - 1];
    expect(analystBody.role_slug).toBe("data-analyst");
    expect(analystBody.role_slug).not.toBe(backendBody.role_slug);
  });
});
