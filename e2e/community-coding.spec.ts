/**
 * Community + Coding Lab regression for TC-COM-002/003 and TC-COD-004/005 UI contracts.
 */
import {
  test,
  expect,
  setupSupabaseMocks,
  clearBrowserAuthState,
  loginAsTestUser,
  expectDashboardReady,
} from "../playwright-fixture";
import type { Page, Route } from "@playwright/test";

test.describe.configure({ timeout: 90_000 });

const QUESTION_ID = "e2e-coding-q-0001-0001-0001-000000000001";
const POST_ID = "e2e-community-post-0001-0001-0001-000000000001";

function cors(route: Route): Record<string, string> {
  const origin = route.request().headers()["origin"] ?? "http://127.0.0.1:5000";
  return {
    "access-control-allow-origin": origin,
    "access-control-allow-credentials": "true",
    "access-control-allow-headers":
      "authorization, apikey, content-type, x-client-info, x-idempotency-key, x-request-id, prefer, accept",
    vary: "Origin",
  };
}

function fulfillJson(route: Route, status: number, body: unknown) {
  return route.fulfill({
    status,
    contentType: "application/json",
    headers: cors(route),
    body: JSON.stringify(body),
  });
}

function wantsObject(route: Route): boolean {
  const accept = (route.request().headers()["accept"] ?? "").toLowerCase();
  return accept.includes("vnd.pgrst.object");
}

async function installCommunityCodingMocks(page: Page) {
  const posts: Record<string, unknown>[] = [
    {
      id: POST_ID,
      user_id: "e2e-user-0001-0001-0001-000000000001",
      title: "How do you handle system design interviews?",
      body: "Looking for a structured approach.",
      tags: ["Interview"],
      category: "Interview",
      status: "PUBLISHED",
      locked: false,
      accepted_answer_id: null,
      created_at: new Date().toISOString(),
    },
  ];
  const answers: Record<string, unknown>[] = [];
  const question = {
    id: QUESTION_ID,
    title: "Sum the numbers",
    description: "Return the sum of an array via solve(input).",
    constraints: "input is number[]",
    sample_input: "[1,2,3]",
    sample_output: "6",
    starter_code: "function solve(input) {\n  return 0;\n}\n",
    language: "javascript",
    time_limit_ms: 800,
    max_submissions: 20,
    evaluation_mode: "javascript_solve",
    difficulty: "EASY",
    publish_status: "published",
  };

  // Registered after setupSupabaseMocks; handle our tables then fall back.
  await page.route("**/*supabase.co/**", async (route) => {
    const url = route.request().url();
    const method = route.request().method();

    if (url.includes("/rest/v1/community_posts")) {
      if (method === "OPTIONS") return fulfillJson(route, 200, {});
      if (method === "GET") {
        if (url.includes(`id=eq.${POST_ID}`)) {
          return fulfillJson(route, 200, wantsObject(route) ? posts[0] : [posts[0]]);
        }
        return fulfillJson(route, 200, posts);
      }
      if (method === "POST") {
        const body = route.request().postDataJSON() as Record<string, unknown>;
        const row = {
          id: "e2e-community-post-new",
          status: "PUBLISHED",
          created_at: new Date().toISOString(),
          ...body,
        };
        posts.unshift(row);
        return fulfillJson(route, 201, wantsObject(route) ? row : [row]);
      }
    }

    if (url.includes("/rest/v1/community_answers")) {
      if (method === "OPTIONS") return fulfillJson(route, 200, {});
      if (method === "GET") return fulfillJson(route, 200, answers);
      if (method === "POST") {
        const body = route.request().postDataJSON() as Record<string, unknown>;
        const row = {
          id: "e2e-answer-1",
          is_accepted: false,
          created_at: new Date().toISOString(),
          ...body,
        };
        answers.push(row);
        return fulfillJson(route, 201, wantsObject(route) ? row : [row]);
      }
    }

    if (url.includes("/rest/v1/community_reports")) {
      if (method === "OPTIONS") return fulfillJson(route, 200, {});
      if (method === "POST") {
        const row = { id: "e2e-report-1", status: "open" };
        return fulfillJson(route, 201, wantsObject(route) ? row : [row]);
      }
      return fulfillJson(route, 200, []);
    }

    if (url.includes("/rest/v1/coding_questions")) {
      if (method === "OPTIONS") return fulfillJson(route, 200, {});
      if (url.includes(`id=eq.${QUESTION_ID}`)) {
        return fulfillJson(route, 200, wantsObject(route) ? question : [question]);
      }
      return fulfillJson(route, 200, [question]);
    }

    if (url.includes("/rest/v1/coding_test_cases")) {
      return fulfillJson(route, 200, [
        {
          id: "case-1",
          name: "sample",
          input_json: [1, 2, 3],
          expected_json: 6,
          is_hidden: false,
        },
      ]);
    }

    if (url.includes("/rest/v1/coding_submissions")) {
      return fulfillJson(route, 200, []);
    }

    return route.fallback();
  });
}

test.describe("Community + Coding Lab module regression", () => {
  test.beforeEach(async ({ page }) => {
    await setupSupabaseMocks(page);
    await installCommunityCodingMocks(page);
    await clearBrowserAuthState(page);
  });

  test("TC-COM-002/003: create post, reply, and report UI are available", async ({ page }) => {
    await loginAsTestUser(page);
    await expectDashboardReady(page);

    await page.goto("/app/community", { waitUntil: "domcontentloaded" });
    await expect(page.getByRole("heading", { name: /Questions & Answers/i })).toBeVisible({
      timeout: 20_000,
    });
    await expect(page.getByRole("heading", { name: /Create a post/i })).toBeVisible({
      timeout: 15_000,
    });
    await expect(page.getByRole("button", { name: /Publish post/i })).toBeVisible();
    await expect(page.getByText(/no create-post action/i)).toHaveCount(0);

    await page.goto(`/app/community/${POST_ID}`, { waitUntil: "domcontentloaded" });
    await expect(page.getByRole("heading", { name: /Your answer/i })).toBeVisible({
      timeout: 20_000,
    });
    await expect(page.getByRole("button", { name: /Post answer/i })).toBeVisible();
    await expect(page.getByRole("heading", { name: /Report this post/i })).toBeVisible();
    await expect(page.getByRole("button", { name: /Submit report/i })).toBeVisible();
    await expect(page.getByText(/Interactions deferred/i)).toHaveCount(0);
  });

  test("TC-COD-004/005: coding assessment exposes solve guidance and language labels", async ({
    page,
  }) => {
    await loginAsTestUser(page);
    await expectDashboardReady(page);

    await page.goto(`/app/coding/${QUESTION_ID}`, { waitUntil: "domcontentloaded" });
    const editor = page.locator("#code-editor");
    await expect(editor).toBeVisible({ timeout: 20_000 });
    await expect
      .poll(async () => editor.inputValue(), { timeout: 15_000 })
      .toMatch(/function solve\(input\)/);
    await expect(page.getByRole("button", { name: /Reset code/i })).toBeVisible();
    await expect(page.getByRole("button", { name: /Submit assessment/i })).toBeVisible();
    await expect(page.getByText(/solve\(input\)/i).first()).toBeVisible();

    const lang = page.locator("#coding-language");
    await expect(lang).toBeVisible();
    const options = await lang.locator("option").allTextContents();
    expect(options.some((t) => /TypeScript/i.test(t) && /pending review/i.test(t))).toBe(true);
    expect(options.some((t) => /Python/i.test(t) && /pending review/i.test(t))).toBe(true);
    expect(options.some((t) => /Java/i.test(t) && /pending review/i.test(t))).toBe(true);
  });
});
