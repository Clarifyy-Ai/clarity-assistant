/**
 * Learning Hub learner flow smoke (catalog + course detail).
 */
import { test, expect, loginAsTestUser, setupSupabaseMocks } from "../playwright-fixture";
import type { Route } from "@playwright/test";

const COURSE_ID = "e2e-learn-course-0001-0001-0001-000000000001";

test.describe.configure({ timeout: 90_000 });

test.describe("Learning Hub", () => {
  test.beforeEach(async ({ page }) => {
    await setupSupabaseMocks(page, { planId: "pro" });
    await page.route("**/*supabase.co/**", async (route: Route) => {
      const url = route.request().url();
      if (url.includes("/rest/v1/learning_courses") && route.request().method() === "GET") {
        return route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify([
            {
              id: COURSE_ID,
              title: "Interview Foundations",
              slug: "interview-foundations",
              description: "E2E course",
              publish_status: "published",
              unlock_mode: "sequential",
              duration_hours: 2,
            },
          ]),
        });
      }
      if (url.includes("/rest/v1/course_enrollments")) {
        return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify([]) });
      }
      if (url.includes("/rest/v1/learning_modules")) {
        return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify([]) });
      }
      if (url.includes("/rest/v1/learning_lessons")) {
        return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify([]) });
      }
      if (url.includes("/rest/v1/learning_quizzes")) {
        return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify([]) });
      }
      if (url.includes("/rest/v1/lesson_progress")) {
        return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify([]) });
      }
      if (url.includes("/rest/v1/quiz_progress")) {
        return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify([]) });
      }
      return route.fallback();
    });
  });

  test("published course appears in catalog", async ({ page }) => {
    await loginAsTestUser(page, { planId: "pro" });
    await page.goto("/app/learn", { waitUntil: "domcontentloaded" });
    await expect(page.getByText("Interview Foundations")).toBeVisible({ timeout: 20_000 });
  });
});
