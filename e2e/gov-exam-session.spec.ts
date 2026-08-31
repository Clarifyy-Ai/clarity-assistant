import { test, expect, loginAsTestUser } from "../playwright-fixture";
import type { Page, Route } from "@playwright/test";

const TEST_ID = "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeee1";
const Q1 = "11111111-1111-4111-8111-111111111111";
const Q2 = "22222222-2222-4222-8222-222222222222";

function fulfillJson(route: Route, status: number, body: unknown): Promise<void> {
  return route.fulfill({
    status,
    contentType: "application/json",
    headers: { "access-control-allow-origin": "*" },
    body: JSON.stringify(body),
  });
}

const QUESTIONS = [
  {
    id: Q1,
    question_text: "What is 2 + 2?",
    question_type: "MCQ",
    options: [
      { label: "A", text: "3" },
      { label: "B", text: "4" },
      { label: "C", text: "5" },
      { label: "D", text: "6" },
    ],
    subject: "Quant",
    topic: "Arithmetic",
    difficulty: "EASY",
    marks_positive: 2,
    marks_negative: 0.5,
  },
  {
    id: Q2,
    question_text: "Which is a prime number?",
    question_type: "MCQ",
    options: [
      { label: "A", text: "4" },
      { label: "B", text: "6" },
      { label: "C", text: "9" },
      { label: "D", text: "7" },
    ],
    subject: "Quant",
    topic: "Numbers",
    difficulty: "EASY",
    marks_positive: 2,
    marks_negative: 0.5,
  },
];

async function mockGovSession(page: Page): Promise<{ startCalls: number; saveCalls: number; submitCalls: number }> {
  const counters = { startCalls: 0, saveCalls: 0, submitCalls: 0 };
  let status = "DRAFT";
  const startedAt = new Date().toISOString();
  const expiresAt = new Date(Date.now() + 60 * 60_000).toISOString();

  await page.route("**/functions/v1/start-exam", async (route) => {
    if (route.request().method() === "OPTIONS") {
      await route.fulfill({ status: 204, headers: { "access-control-allow-origin": "*" } });
      return;
    }
    counters.startCalls += 1;
    status = "IN_PROGRESS";
    await fulfillJson(route, 200, {
      success: true,
      startedAt,
      expiresAt,
      status: "IN_PROGRESS",
      attemptPhase: "ACTIVE",
    });
  });

  await page.route("**/functions/v1/save-test-answer", async (route) => {
    if (route.request().method() === "OPTIONS") {
      await route.fulfill({ status: 204, headers: { "access-control-allow-origin": "*" } });
      return;
    }
    counters.saveCalls += 1;
    await fulfillJson(route, 200, { success: true, savedCount: 2, staleQuestionIds: [] });
  });

  await page.route("**/functions/v1/submit-test", async (route) => {
    if (route.request().method() === "OPTIONS") {
      await route.fulfill({ status: 204, headers: { "access-control-allow-origin": "*" } });
      return;
    }
    counters.submitCalls += 1;
    status = "COMPLETED";
    await fulfillJson(route, 200, {
      success: true,
      analysis: {
        total_score: 2,
        max_score: 4,
        accuracy: 100,
        time_analysis: {
          score_summary: { correct: 1, incorrect: 0, unanswered: 1, positive_marks: 2, negative_marks: 0 },
        },
      },
    });
  });

  await page.route("**/rest/v1/**", async (route) => {
    const url = route.request().url();
    const method = route.request().method();
    if (method === "OPTIONS") {
      await route.fulfill({ status: 204, headers: { "access-control-allow-origin": "*" } });
      return;
    }
    if (url.includes("/rest/v1/mock_tests") && method === "GET") {
      return fulfillJson(route, 200, [
        {
          id: TEST_ID,
          user_id: "e2e-user-0001-0001-0001-000000000001",
          test_name: "SSC CGL Tier 1 Mock",
          status,
          question_ids: [Q1, Q2],
          time_limit_minutes: 60,
          started_at: status === "DRAFT" ? null : startedAt,
          expires_at: status === "DRAFT" ? null : expiresAt,
          config: {
            gov_exam_id: "exam-1",
            marks_positive: 2,
            marks_negative: 0.5,
            total_marks: 4,
            paper_class: "custom_practice",
          },
        },
      ]);
    }
    if (url.includes("questions_playable") && method === "GET") {
      return fulfillJson(route, 200, QUESTIONS);
    }
    if (url.includes("test_responses") && method === "GET") {
      return fulfillJson(route, 200, []);
    }
    if (url.includes("gov_paper_questions_playable")) {
      return fulfillJson(route, 200, []);
    }
    if (url.includes("test_analyses") && method === "GET") {
      return fulfillJson(route, 200, [
        {
          test_id: TEST_ID,
          total_score: 2,
          max_score: 4,
          accuracy: 100,
          subject_breakdown: {},
          topic_breakdown: {},
          time_analysis: {
            score_summary: { correct: 1, incorrect: 0, unanswered: 1, positive_marks: 2, negative_marks: 0 },
          },
        },
      ]);
    }
    return route.fallback();
  });

  return counters;
}

test.describe("Government mock exam session", () => {
  test.describe.configure({ timeout: 90_000 });

  test("starts on the server, answers, marks for review, and submits", async ({ page }) => {
    await loginAsTestUser(page);
    const counters = await mockGovSession(page);
    await page.goto(`/app/mock-test/session/${TEST_ID}`, { waitUntil: "domcontentloaded" });

    await expect(page.getByRole("heading", { name: /SSC CGL Tier 1 Mock/i })).toBeVisible({
      timeout: 20_000,
    });
    await expect(page.getByText(/Negative marking/i)).toBeVisible();
    await page.getByRole("button", { name: /Start Test/i }).click();
    await expect(page.getByText(/What is 2 \+ 2/i)).toBeVisible({ timeout: 15_000 });
    expect(counters.startCalls).toBe(1);

    await page.getByText("4", { exact: true }).click();
    await page.getByRole("button", { name: /Mark for Review/i }).first().click();
    await expect(page.getByText(/prime number/i)).toBeVisible();
    await page.getByRole("listitem", { name: /Question 2/i }).click();
    await page.getByText("7", { exact: true }).click();

    await page.getByRole("button", { name: /Submit/i }).first().click();
    await page.getByRole("button", { name: /Yes, submit/i }).click();
    await expect(page).toHaveURL(/\/app\/mock-test\/results\//, { timeout: 20_000 });
    expect(counters.submitCalls).toBeGreaterThanOrEqual(1);
    expect(counters.saveCalls).toBeGreaterThanOrEqual(1);
  });
});
