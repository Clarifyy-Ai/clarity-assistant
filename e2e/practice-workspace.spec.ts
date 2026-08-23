/**
 * Practice Workspace: skip / end session / refresh restore (WS2 + WS5).
 */
import { test, expect } from "../playwright-fixture";
import {
  loginAsTestUser,
  dismissCookieBanner,
  dismissWalkthrough,
  E2E_TEST_USER,
} from "./helpers/auth-flow";
import type { Page, Route } from "@playwright/test";

test.describe.configure({ timeout: 90_000 });

const DRAFT_ID = "e2e-practice-draft-0001-0001-0001-000000000001";
const QUESTIONS = [
  { id: "q1", question: "Tell me about a challenging project.", question_text: "Tell me about a challenging project.", topic: "behavioral", difficulty: "medium", type: "behavioural" },
  { id: "q2", question: "How do you handle conflicting priorities?", question_text: "How do you handle conflicting priorities?", topic: "behavioral", difficulty: "medium", type: "behavioural" },
  { id: "q3", question: "Describe a time you mentored someone.", question_text: "Describe a time you mentored someone.", topic: "behavioral", difficulty: "medium", type: "behavioural" },
];

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

function wantsSingular(route: Route): boolean {
  const accept = (route.request().headers()["accept"] ?? "").toLowerCase();
  return accept.includes("vnd.pgrst.object");
}

function fulfillJson(route: Route, status: number, body: unknown) {
  return route.fulfill({
    status,
    contentType: "application/json",
    headers: cors(route),
    body: JSON.stringify(body),
  });
}

/** Match PostgREST singular Accept used by .single() / .maybeSingle(). */
function fulfillRows(route: Route, status: number, rows: unknown[]) {
  if (wantsSingular(route) || route.request().headers()["accept"]?.includes("object")) {
    if (rows.length === 0) {
      // maybeSingle empty → 406 → client maps to null
      return route.fulfill({
        status: 406,
        contentType: "application/json",
        headers: cors(route),
        body: JSON.stringify({ message: "JSON object requested, multiple (or no) rows returned" }),
      });
    }
    return fulfillJson(route, status, rows[0]);
  }
  return fulfillJson(route, status, rows);
}

async function installPracticeRoutes(
  page: Page,
  opts?: { restoreDraft?: boolean },
): Promise<void> {
  const state = {
    draft: opts?.restoreDraft
      ? {
          id: DRAFT_ID,
          user_id: E2E_TEST_USER.id,
          role: "Software Engineer",
          difficulty: "medium",
          interview_type: "Behavioral",
          started_at: new Date().toISOString(),
          ended_at: null,
          notes: "",
          answers: [
            { answer: "" },
            { answer: "I skipped thinking about this earlier." },
            { answer: "" },
          ],
          scores: null,
          created_at: new Date().toISOString(),
          status: "active",
          current_index: 1,
          question_order: QUESTIONS,
          skipped: [true, false, false],
          mode: "Behavioral",
          question_source: "local",
          elapsed_seconds: 42,
          expires_at: new Date(Date.now() + 86_400_000).toISOString(),
          version: 3,
        }
      : (null as Record<string, unknown> | null),
  };

  await page.route("**/rest/v1/practice_workspace_sessions**", async (route) => {
    const method = route.request().method();
    if (method === "OPTIONS") {
      return route.fulfill({ status: 204, headers: cors(route), body: "" });
    }
    if (method === "GET") {
      const url = route.request().url();
      if (url.includes("status=eq.active") || url.includes("status%3Deq.active")) {
        return fulfillRows(route, 200, state.draft ? [state.draft] : []);
      }
      return fulfillJson(route, 200, []);
    }
    if (method === "POST") {
      const body = route.request().postDataJSON() as Record<string, unknown>;
      state.draft = {
        id: DRAFT_ID,
        user_id: E2E_TEST_USER.id,
        created_at: new Date().toISOString(),
        started_at: new Date().toISOString(),
        ended_at: null,
        scores: null,
        notes: "",
        version: 1,
        status: "active",
        current_index: 0,
        skipped: [false, false, false, false],
        question_order: QUESTIONS,
        ...body,
      };
      // .insert().select().single() expects one object
      return fulfillJson(route, 201, {
        id: DRAFT_ID,
        version: 1,
      });
    }
    if (method === "PATCH" || method === "PUT") {
      const body = (route.request().postDataJSON() as Record<string, unknown>) ?? {};
      if (state.draft) {
        state.draft = {
          ...state.draft,
          ...body,
          version: Number(state.draft.version ?? 1) + (body.version ? 0 : 1),
        };
        if (typeof body.version === "number") {
          state.draft.version = body.version;
        }
      }
      // persist uses .maybeSingle(); finish may update status
      if (body.status === "completed" || body.status === "expired") {
        const completed = state.draft;
        state.draft = null;
        return fulfillRows(route, 200, completed ? [completed] : []);
      }
      return fulfillRows(route, 200, state.draft ? [state.draft] : []);
    }
    return fulfillJson(route, 200, []);
  });

  // Playable bank empty → local fallback in app code
  await page.route("**/rest/v1/questions_playable**", async (route) => {
    if (route.request().method() === "OPTIONS") {
      return route.fulfill({ status: 204, headers: cors(route), body: "" });
    }
    return fulfillJson(route, 200, []);
  });

  await page.route("**/rest/v1/questions**", async (route) => {
    if (route.request().method() === "OPTIONS") {
      return route.fulfill({ status: 204, headers: cors(route), body: "" });
    }
    return fulfillJson(route, 200, []);
  });
}

async function openWorkspace(page: Page, opts?: { restoreDraft?: boolean }) {
  await loginAsTestUser(page);
  // Register after shared auth mocks so these handlers take precedence.
  await installPracticeRoutes(page, opts);
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      await page.goto("/app/practice-workspace", { waitUntil: "domcontentloaded" });
      break;
    } catch (err) {
      if (attempt === 2) throw err;
      await page.waitForTimeout(500);
    }
  }
  await dismissCookieBanner(page);
  await dismissWalkthrough(page);
}

test.describe("Practice Workspace", () => {
  test.describe.configure({ retries: 1 });

  test("Skip then End Session does not crash and shows counts", async ({ page }) => {
    const pageErrors: string[] = [];
    page.on("pageerror", (err) => pageErrors.push(String(err)));

    await openWorkspace(page);

    await expect(page.getByRole("heading", { name: /Interview Practice Workspace/i })).toBeVisible({
      timeout: 20_000,
    });
    await page.getByTestId("practice-start-session").click();
    await expect(page.getByTestId("practice-question-text")).toBeVisible({ timeout: 20_000 });

    await page.getByTestId("practice-skip").click();
    await expect(page.getByTestId("practice-session-meta")).toContainText(/Skipped 1/i);

    await page.getByTestId("practice-end-session").click();
    await expect(page.getByText(/answered 0, skipped 1/i)).toBeVisible();
    await page.getByTestId("practice-end-confirm").click();

    await expect(page.getByTestId("practice-start-session")).toBeVisible({ timeout: 15_000 });
    expect(pageErrors.join("\n")).not.toMatch(/trim|Cannot read|undefined/i);
  });

  test("mid-session refresh restores question index and answers", async ({ page }) => {
    await openWorkspace(page, { restoreDraft: true });

    await expect(page.getByTestId("practice-question-text")).toBeVisible({ timeout: 20_000 });
    await expect(page.getByTestId("practice-question-text")).toContainText(/conflicting priorities/i);
    await expect(page.getByTestId("practice-session-meta")).toContainText(/Q2\//i);
    await expect(page.getByTestId("practice-answer-input")).toHaveValue(/skipped thinking/i);
  });
});
