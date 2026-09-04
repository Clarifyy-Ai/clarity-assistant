/**
 * Community + Coding Lab regression for TC-COM-002/003 and TC-COD-004/005/006 contracts.
 * Language UI exposes JS/TS practice only; secure multi-language sandbox remains PARTIAL.
 * TC-COD-005 hard path uses a 501 mock for non-executable languages.
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

const communityReportMetrics = { postCount: 0 };

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
  const reports: Record<string, unknown>[] = [];
  communityReportMetrics.postCount = 0;
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
      if (method === "GET") {
        const existing = reports.find(
          (r) =>
            r.target_id === POST_ID &&
            r.target_type === "post" &&
            r.reporter_id === "e2e-user-0001-0001-0001-000000000001",
        );
        return fulfillJson(route, 200, existing ? (wantsObject(route) ? existing : [existing]) : []);
      }
      if (method === "POST") {
        communityReportMetrics.postCount += 1;
        const body = route.request().postDataJSON() as Record<string, unknown>;
        const duplicate = reports.some(
          (r) =>
            r.reporter_id === body.reporter_id &&
            r.target_type === body.target_type &&
            r.target_id === body.target_id,
        );
        if (duplicate) {
          return fulfillJson(route, 409, {
            code: "23505",
            message: 'duplicate key value violates unique constraint "community_reports_one_per_reporter_target"',
          });
        }
        const row = {
          id: `e2e-report-${reports.length + 1}`,
          status: "open",
          ...body,
        };
        reports.push(row);
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

    if (url.includes("/functions/v1/moderate-content")) {
      if (method === "POST") {
        const body = route.request().postDataJSON() as { action?: string; target_id?: string };
        if (body.action === "mark_post_reported" && body.target_id) {
          const post = posts.find((p) => p.id === body.target_id);
          if (post && post.status !== "HIDDEN") post.status = "REPORTED";
        }
        return fulfillJson(route, 200, { success: true });
      }
      return fulfillJson(route, 200, { success: true });
    }

    if (url.includes("/functions/v1/score-coding-submission")) {
      if (method === "POST") {
        const body = route.request().postDataJSON() as { sample_only?: boolean };
        return fulfillJson(route, 200, {
          status: body.sample_only ? "passed" : "failed",
          score: body.sample_only ? 100 : 0,
          execution_status: body.sample_only ? "passed" : "failed",
          passed_tests: body.sample_only ? 1 : 0,
          failed_tests: body.sample_only ? 0 : 1,
          case_results: [
            {
              id: "case-1",
              name: "sample",
              passed: Boolean(body.sample_only),
              actual: body.sample_only ? 6 : 0,
              input_preview: "[1,2,3]",
              ...(body.sample_only ? {} : { error: "Expected 6, got 0", error_kind: "wrong_answer" }),
            },
          ],
          message: body.sample_only ? "Sample: 1 passed, 0 failed." : "Sample: 0 passed, 1 failed.",
        });
      }
      return fulfillJson(route, 200, { ok: true });
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
    await expect(page.getByRole("heading", { name: /^Community$/i })).toBeVisible({
      timeout: 20_000,
    });
    await expect(page.getByRole("heading", { name: /Ask a question/i })).toBeVisible({
      timeout: 15_000,
    });
    await expect(page.getByRole("button", { name: /Publish question|Publish post/i })).toBeVisible();
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

  test("TC-MOD-013: duplicate report is idempotent without duplicate POST", async ({ page }) => {
    await loginAsTestUser(page);
    await expectDashboardReady(page);

    await page.goto(`/app/community/${POST_ID}`, { waitUntil: "domcontentloaded" });
    const submit = page.getByRole("button", { name: /Submit report/i });
    await expect(submit).toBeVisible({ timeout: 20_000 });

    await submit.click();
    await expect(page.getByText(/Report submitted for moderation/i)).toBeVisible({
      timeout: 10_000,
    });

    communityReportMetrics.postCount = 0;
    await submit.click();
    await expect(page.getByText(/You already reported this post/i)).toBeVisible({
      timeout: 10_000,
    });
    expect(communityReportMetrics.postCount).toBe(0);
  });

  test("TC-MOD-013: rapid double-click issues one report request", async ({ page }) => {
    await loginAsTestUser(page);
    await expectDashboardReady(page);

    communityReportMetrics.postCount = 0;

    await page.goto(`/app/community/${POST_ID}`, { waitUntil: "domcontentloaded" });
    const submit = page.getByRole("button", { name: /Submit report/i });
    await expect(submit).toBeVisible({ timeout: 20_000 });

    await submit.dblclick();
    await expect(page.getByText(/Report submitted for moderation/i)).toBeVisible({
      timeout: 10_000,
    });
    expect(communityReportMetrics.postCount).toBeLessThanOrEqual(1);
  });

  test("TC-COD-004: coding assessment exposes solve guidance and JS/TS language select", async ({
    page,
  }) => {
    const pageErrors: string[] = [];
    page.on("pageerror", (err) => pageErrors.push(err.message));

    await loginAsTestUser(page);
    await expectDashboardReady(page);

    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto(`/app/coding/${QUESTION_ID}`, { waitUntil: "domcontentloaded" });
    const editor = page.locator("#code-editor");
    await expect(editor).toBeVisible({ timeout: 20_000 });
    await expect
      .poll(async () => editor.inputValue(), { timeout: 15_000 })
      .toMatch(/function solve\(input\)/);
    await expect(page.getByRole("button", { name: /Reset code/i })).toBeVisible();
    await expect(page.getByRole("button", { name: /Submit assessment/i })).toBeVisible();
    await expect(page.getByText(/solve\(input\)/i).first()).toBeVisible();
    await expect(page.getByTestId("coding-workspace")).toBeVisible();
    await expect(page.getByTestId("coding-problem-panel")).toBeVisible();
    await expect(page.getByTestId("coding-editor-panel")).toBeVisible();

    const lang = page.locator("#coding-language");
    await expect(lang).toBeVisible();
    await expect(lang).toBeEnabled();
    const options = await lang.locator("option").allTextContents();
    expect(options).toHaveLength(2);
    expect(options.some((t) => /JavaScript/i.test(t))).toBe(true);
    expect(options.some((t) => /TypeScript/i.test(t))).toBe(true);
    expect(options.some((t) => /Python|\bJava\b/i.test(t))).toBe(false);
    expect(options.every((t) => /practice auto-scored|not a secure sandbox/i.test(t))).toBe(true);

    await lang.selectOption("typescript");
    await expect(lang).toHaveValue("typescript");
    await expect
      .poll(async () => editor.inputValue(), { timeout: 10_000 })
      .toMatch(/function solve\(input\)/);

    // Mobile: stacked workspace still usable
    await page.setViewportSize({ width: 390, height: 844 });
    await expect(page.getByTestId("coding-editor-textarea")).toBeVisible();
    const box = await page.getByTestId("coding-editor-textarea").boundingBox();
    expect(box?.width ?? 0).toBeGreaterThan(200);

    const startTimeNoise = pageErrors.filter((m) =>
      /Cannot read properties of undefined \(reading ['"]startTime['"]\)|Cannot read property 'startTime' of undefined/i.test(
        m,
      ),
    );
    // DevTools/web-vitals startTime noise is ignored; fail only if coding frames appear.
    expect(
      startTimeNoise.filter((m) => /CodingAssessment|coding-language|score-coding/i.test(m)),
    ).toEqual([]);
  });

  test("TC-COD-005: unsupported language 501 surfaces clear error (no silent hang)", async ({
    page,
  }) => {
    await loginAsTestUser(page);
    await expectDashboardReady(page);

    await page.route("**/functions/v1/score-coding-submission**", async (route) => {
      if (route.request().method() === "OPTIONS") {
        await route.fulfill({ status: 204, headers: cors(route) });
        return;
      }
      await fulfillJson(route, 501, {
        success: false,
        error: "This language is not configured for secure execution.",
        code: "NOT_CONFIGURED",
        execution_status: "unsupported",
        approved_languages: ["javascript"],
      });
    });

    await page.goto(`/app/coding/${QUESTION_ID}`, { waitUntil: "domcontentloaded" });
    await expect(page.locator("#code-editor")).toBeVisible({ timeout: 20_000 });
    await page.getByRole("button", { name: /Run sample/i }).click();

    await expect(
      page.getByText(/This language is not configured for secure execution/i),
    ).toBeVisible({ timeout: 15_000 });
  });

  test("TC-COD-006: sample run shows per-case results from server", async ({ page }) => {
    let sampleLanguage: string | null = null;
    await page.route("**/functions/v1/score-coding-submission**", async (route) => {
      if (route.request().method() === "OPTIONS") {
        await route.fulfill({ status: 204, headers: cors(route) });
        return;
      }
      try {
        const body = route.request().postDataJSON() as { language?: string; sample_only?: boolean };
        if (body.sample_only) sampleLanguage = String(body.language ?? "");
      } catch {
        /* ignore */
      }
      await route.fallback();
    });

    await loginAsTestUser(page);
    await expectDashboardReady(page);

    await page.goto(`/app/coding/${QUESTION_ID}`, { waitUntil: "domcontentloaded" });
    const lang = page.locator("#coding-language");
    await expect(lang).toBeEnabled({ timeout: 20_000 });
    await lang.selectOption("typescript");
    await page.getByRole("button", { name: /Run sample/i }).click();
    await expect(page.getByTestId("coding-sample-case-results")).toBeVisible({
      timeout: 20_000,
    });
    await expect(page.getByText("Pass")).toBeVisible();
    expect(sampleLanguage).toBe("typescript");
  });

  test("TC-MOD-014: report marks post as REPORTED via moderate-content", async ({ page }) => {
    await loginAsTestUser(page, { isAdmin: true });
    await expectDashboardReady(page);

    await page.goto(`/app/community/${POST_ID}`, { waitUntil: "domcontentloaded" });
    await page.getByRole("button", { name: /Submit report/i }).click();
    await expect(page.getByText(/Report submitted for moderation/i)).toBeVisible({
      timeout: 10_000,
    });

    await page.goto("/app/community", { waitUntil: "domcontentloaded" });
    await expect(page.getByText("Reported")).toBeVisible({ timeout: 15_000 });
  });
});
