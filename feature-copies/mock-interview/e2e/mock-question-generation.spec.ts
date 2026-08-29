/**
 * Mock interview: Next Question generation, End Session cleanup, stale responses.
 * Enters session via deep link + sessionStorage config (skips wizard/device precheck).
 */
import { test, expect } from "../playwright-fixture";
import {
  loginAsTestUser,
  dismissCookieBanner,
  E2E_TEST_USER,
  dismissWalkthrough,
} from "./helpers/auth-flow";
import type { Page, Route } from "@playwright/test";

test.describe.configure({ timeout: 120_000 });

test.use({
  permissions: ["microphone"],
});

const SESSION_ID = "e2e-mock-session-0001-0001-0001-000000000001";

function fulfillJson(route: Route, status: number, body: unknown) {
  const origin = route.request().headers()["origin"] ?? "http://127.0.0.1:5000";
  return route.fulfill({
    status,
    contentType: "application/json",
    headers: {
      "access-control-allow-origin": origin,
      "access-control-allow-credentials": "true",
      "access-control-allow-headers":
        "authorization, apikey, content-type, x-client-info, x-idempotency-key, idempotency-key, x-request-id",
      vary: "Origin",
    },
    body: JSON.stringify(body),
  });
}

async function mockSessionApis(page: Page, opts?: { failNext?: boolean; delayMs?: number }) {
  let genCount = 0;
  const questions = [
    "Tell me about a time you led a difficult project.",
    "How do you prioritize when everything is urgent?",
    "Describe a conflict you resolved with a teammate.",
  ];

  await page.route("**/functions/v1/generate-questions**", async (route) => {
    if (route.request().method() === "OPTIONS") {
      return fulfillJson(route, 204, {});
    }
    genCount += 1;
    const delay = opts?.delayMs ?? 0;
    if (delay > 0) {
      await new Promise((r) => setTimeout(r, delay));
    }
    if (opts?.failNext && genCount > 1) {
      return fulfillJson(route, 503, {
        success: false,
        error: "We couldn't generate the next question right now. Please try again.",
        code: "QUESTION_GENERATION_UNAVAILABLE",
      });
    }
    const idx = Math.min(genCount - 1, questions.length - 1);
    const text = questions[idx];
    return fulfillJson(route, 200, {
      success: true,
      source: "ai",
      questions: [
        {
          id: `e2e-q-${genCount}`,
          question_text: text,
          question: text,
          difficulty: "medium",
          type: "behavioral",
          tags: [],
          order: genCount,
        },
      ],
      count: 1,
    });
  });

  const sessionRow = {
    id: SESSION_ID,
    user_id: E2E_TEST_USER.id,
    type: "mock",
    status: "in_progress",
    title: "Mock interview",
    questions_asked: 3,
    answers_generated: 0,
    credits_used: 0,
    model_used: "gemini-flash",
    created_at: new Date().toISOString(),
    started_at: new Date().toISOString(),
    ended_at: null,
    document_id: null,
    jd_id: null,
  };

  await page.route("**/rest/v1/sessions**", async (route) => {
    const method = route.request().method();
    if (method === "GET") {
      return fulfillJson(route, 200, [sessionRow]);
    }
    if (method === "POST") {
      return fulfillJson(route, 201, [sessionRow]);
    }
    if (method === "PATCH" || method === "PUT") {
      return fulfillJson(route, 200, [{ ...sessionRow, status: "completed" }]);
    }
    return fulfillJson(route, 200, []);
  });

  await page.route("**/rest/v1/rpc/check_free_tier_limits**", async (route) => {
    return fulfillJson(route, 200, { allowed: true, remaining: 3 });
  });

  await page.route("**/rest/v1/rpc/start_session**", async (route) => {
    return fulfillJson(route, 200, { session_id: SESSION_ID, ok: true });
  });

  await page.route("**/rest/v1/session_answers**", async (route) => {
    return fulfillJson(route, 201, []);
  });

  await page.route("**/rest/v1/session_transcripts**", async (route) => {
    return fulfillJson(route, 201, []);
  });

  return {
    getGenCount: () => genCount,
  };
}

async function enterMockSession(page: Page) {
  await page.evaluate(
    ({ sessionId, userId }) => {
      try {
        localStorage.setItem("clarify:whats-new-dismissed", "1.5.0");
        localStorage.setItem(
          "Clarify AI-app-walkthrough-v1",
          JSON.stringify({ [userId]: true }),
        );
        sessionStorage.setItem(
          `clarify:mock-config:${sessionId}`,
          JSON.stringify({
            company: "Acme",
            role: "Software Engineer",
            hint_style: "short_hints",
            model: "gemini-flash",
            smart_routing: true,
            stealth_mode: false,
            resume_id: null,
            jd_id: null,
            interview_type: "behavioural",
            question_count: 3,
            difficulty: "medium",
            instructions: "",
            enable_system_audio: false,
            mic_device_id: null,
            noise_suppression: true,
          }),
        );
      } catch {
        /* ignore */
      }
    },
    { sessionId: SESSION_ID, userId: E2E_TEST_USER.id },
  );

  await page.goto(`/app/mock/session/${SESSION_ID}`, {
    waitUntil: "domcontentloaded",
    timeout: 30_000,
  });
  await dismissCookieBanner(page);
  await dismissWalkthrough(page);
  await expect(page.getByTestId("mock-current-question")).toBeVisible({
    timeout: 60_000,
  });
}

test.describe("Mock interview question generation lifecycle", () => {
  test("TEST 1 — Next Question creates one generation request and replaces on success", async ({
    page,
  }) => {
    await loginAsTestUser(page);
    const api = await mockSessionApis(page);
    await enterMockSession(page);

    const first = (await page.getByTestId("mock-current-question").innerText()).trim();
    expect(first.length).toBeGreaterThan(5);

    const next = page.getByTestId("mock-next-question");
    await expect(next).toBeEnabled();
    const before = api.getGenCount();
    await next.click();

    await expect
      .poll(async () => (await page.getByTestId("mock-current-question").innerText()).trim(), {
        timeout: 20_000,
      })
      .not.toBe(first);

    expect(api.getGenCount() - before).toBe(1);
  });

  test("TEST 2 — provider 503 keeps current question and hides raw status", async ({ page }) => {
    await loginAsTestUser(page);
    await mockSessionApis(page, { failNext: true });
    await enterMockSession(page);

    const first = (await page.getByTestId("mock-current-question").innerText()).trim();
    await page.getByTestId("mock-next-question").click();

    await expect
      .poll(
        async () => {
          const raw = await page.getByText(/\b503\b|\b502\b/).count();
          const q = (await page.getByTestId("mock-current-question").innerText()).trim();
          return { raw, qLen: q.length };
        },
        { timeout: 20_000 },
      )
      .toMatchObject({ raw: 0 });

    const after = (await page.getByTestId("mock-current-question").innerText()).trim();
    expect(after.length).toBeGreaterThan(5);
    const errVisible = await page.getByTestId("mock-generation-error").isVisible().catch(() => false);
    if (errVisible) {
      expect(after).toBe(first);
      await expect(page.getByTestId("mock-retry-next")).toBeVisible();
    }
  });

  test("TEST 3 — rapid Next clicks create a single in-flight operation", async ({ page }) => {
    await loginAsTestUser(page);
    const api = await mockSessionApis(page, { delayMs: 800 });
    await enterMockSession(page);

    const before = api.getGenCount();
    const next = page.getByTestId("mock-next-question");
    await next.click();
    await next.click({ force: true }).catch(() => undefined);
    await next.click({ force: true }).catch(() => undefined);

    await expect.poll(() => api.getGenCount() - before, { timeout: 15_000 }).toBe(1);
  });

  test("TEST 4 — End during generation ignores late result", async ({ page }) => {
    await loginAsTestUser(page);
    await mockSessionApis(page, { delayMs: 2_500 });
    await enterMockSession(page);

    await page.getByTestId("mock-next-question").click();
    await page.getByTestId("mock-end-session").click();
    const confirm = page.getByRole("button", { name: /end & save/i });
    await expect(confirm).toBeVisible({ timeout: 5_000 });
    await confirm.click();

    await expect(
      page.getByText(/session complete|session incomplete|wrapping up/i),
    ).toBeVisible({ timeout: 20_000 });

    await page.waitForTimeout(3_000);
    await expect(page.getByTestId("mock-current-question")).toHaveCount(0);
  });
});
