import { expect, test, type Page, type Route } from "@playwright/test";
import { E2E_TEST_USER, loginAsTestUser } from "./helpers/auth-flow";

const COMPANY = "Acme Corp";
const COMPANY_PATH = `/app/companies/acme-corp?name=${encodeURIComponent(COMPANY)}`;
const JOB_ID = "11111111-1111-4111-8111-111111111111";

const BRIEF = {
  overview:
    "Acme Corp builds industrial automation hardware and sells to mid-market manufacturers across three continents.",
  industry: "Industrial automation",
  tags: ["Hardware", "B2B"],
  interview_process: ["Recruiter screen", "Systems design", "Onsite loop"],
  questions: ["Tell me about a launch you owned.", "How do you debug a flaky sensor?"],
  values: ["Customer obsession", "Bias for action"],
  tips: ["Quantify throughput wins", "Reference their 2026 factory rollout"],
  watch_outs: ["Avoid vague ownership claims"],
};

type EdgeOutcome =
  | { kind: "success"; delayMs?: number }
  | { kind: "provider_unavailable" }
  | { kind: "insufficient_credits" }
  | { kind: "persist_failure" }
  | { kind: "long_latency" };

type Harness = {
  edgeCalls: () => number;
  startCalls: () => number;
  idempotencyKeys: () => string[];
  setOutcome: (outcome: EdgeOutcome) => void;
  savedRow: () => Record<string, unknown> | null;
};

function corsHeaders(route: Route): Record<string, string> {
  const origin = route.request().headers()["origin"] ?? "http://127.0.0.1:5000";
  return {
    "access-control-allow-origin": origin,
    "access-control-allow-credentials": "true",
    "access-control-expose-headers": "x-request-id, x-correlation-id",
    vary: "Origin",
  };
}

function json(route: Route, body: unknown, status = 200) {
  return route.fulfill({
    status,
    contentType: "application/json",
    headers: corsHeaders(route),
    body: JSON.stringify(body),
  });
}

/**
 * Routes registered here win over the shared Supabase mock because Playwright
 * evaluates the most recently registered handler first.
 */
async function installCompanyResearchHarness(
  page: Page,
  initialOutcome: EdgeOutcome = { kind: "success" },
): Promise<Harness> {
  let outcome = initialOutcome;
  let edgeCalls = 0;
  let startCalls = 0;
  const idempotencyKeys: string[] = [];
  let savedRow: Record<string, unknown> | null = null;
  let jobStatus = "queued";
  let jobError: { code: string; message: string } | null = null;
  let jobBrief: typeof BRIEF | null = null;
  let startedAt = 0;

  const settleJob = () => {
    if (jobStatus !== "queued" && jobStatus !== "processing") return;
    const waitMs = outcome.kind === "long_latency" ? 2_400 : outcome.kind === "success" && outcome.delayMs ? outcome.delayMs : 200;
    if (Date.now() - startedAt < waitMs) {
      jobStatus = "processing";
      return;
    }
    if (outcome.kind === "provider_unavailable") {
      jobStatus = "failed";
      jobError = {
        code: "PROVIDER_UNAVAILABLE",
        message: "Company research is temporarily unavailable. Your credits were not charged.",
      };
      jobBrief = null;
      savedRow = null;
      return;
    }
    if (outcome.kind === "persist_failure") {
      jobStatus = "failed";
      jobError = {
        code: "DATABASE_FAILURE",
        message: "Research was generated, but we couldn't save it. Please retry.",
      };
      jobBrief = null;
      savedRow = null;
      return;
    }
    jobStatus = "completed";
    jobError = null;
    jobBrief = BRIEF;
    savedRow = {
      id: "e2e-company-research-1",
      user_id: E2E_TEST_USER.id,
      company_name: COMPANY,
      company_name_normalized: "acme corp",
      role_title: null,
      overview: BRIEF.overview,
      culture: BRIEF.values.join("; "),
      prep_tips: BRIEF.tips.join("; "),
      raw_data: BRIEF,
      created_at: new Date().toISOString(),
    };
  };

  await page.route("**/rest/v1/company_research*", async (route) => {
    const url = route.request().url();
    if (url.includes("company_research_jobs")) {
      if (route.request().method() !== "GET") {
        return json(route, { message: "client writes are not allowed" }, 403);
      }
      settleJob();
      return json(route, {
        id: JOB_ID,
        status: jobStatus,
        progress_stage: jobStatus,
        research_id: savedRow?.id ?? null,
        brief: jobBrief,
        source: jobStatus === "completed" ? "ai" : null,
        error_code: jobError?.code ?? null,
        error_message: jobError?.message ?? null,
        retryable: jobStatus !== "completed",
        credits_released_at: jobStatus === "failed" ? new Date().toISOString() : null,
      });
    }
    if (route.request().method() !== "GET") {
      return json(route, { message: "client writes are not allowed" }, 403);
    }
    return json(route, savedRow ?? null);
  });

  await page.route("**/functions/v1/company-research", async (route) => {
    if (route.request().method() === "OPTIONS") {
      return route.fulfill({ status: 204, headers: corsHeaders(route), body: "" });
    }
    edgeCalls += 1;
    const key = route.request().headers()["x-idempotency-key"];
    let body: Record<string, unknown> = {};
    try {
      const parsed = route.request().postDataJSON();
      if (parsed && typeof parsed === "object") body = parsed as Record<string, unknown>;
    } catch {
      body = {};
    }
    const action = String(body.action ?? "start");

    if (action === "status") {
      settleJob();
      return json(route, {
        success: true,
        data: {
          jobId: JOB_ID,
          status: jobStatus,
          persisted: jobStatus === "completed",
          brief: jobBrief,
          errorCode: jobError?.code ?? null,
          errorMessage: jobError?.message ?? null,
          retryable: true,
        },
      });
    }

    if (action === "cancel") {
      jobStatus = "cancelled";
      jobError = { code: "CANCELLED", message: "Brief generation was cancelled. Credits were not charged." };
      jobBrief = null;
      savedRow = null;
      return json(route, {
        success: true,
        data: { jobId: JOB_ID, status: "cancelled", errorCode: "CANCELLED", retryable: true },
      });
    }

    if (action === "process") {
      jobStatus = jobStatus === "queued" ? "processing" : jobStatus;
      settleJob();
      return json(route, {
        success: true,
        data: { jobId: JOB_ID, status: jobStatus, accepted: true, async: true },
      }, 202);
    }

    if (action === "retry") {
      jobStatus = "queued";
      jobError = null;
      jobBrief = null;
      savedRow = null;
      startedAt = Date.now();
      return json(route, {
        success: true,
        data: { jobId: JOB_ID, status: "queued", accepted: true, async: true, persisted: false },
      }, 202);
    }

    startCalls += 1;
    if (key) idempotencyKeys.push(key);

    if (outcome.kind === "insufficient_credits") {
      return json(route, {
        error: "You need 12 credits, but only 2 are available.",
        code: "INSUFFICIENT_CREDITS",
        balance: 2,
        required: 12,
      }, 402);
    }

    jobStatus = "queued";
    jobError = null;
    jobBrief = null;
    savedRow = null;
    startedAt = Date.now();
    settleJob();

    return json(route, {
      success: true,
      data: {
        jobId: JOB_ID,
        status: jobStatus === "completed" ? "completed" : "queued",
        accepted: true,
        async: jobStatus !== "completed",
        persisted: jobStatus === "completed",
        brief: jobBrief,
      },
    }, jobStatus === "completed" ? 200 : 202);
  });

  return {
    edgeCalls: () => edgeCalls,
    startCalls: () => startCalls,
    idempotencyKeys: () => [...idempotencyKeys],
    setOutcome: (next) => {
      outcome = next;
    },
    savedRow: () => savedRow,
  };
}

async function confirmGeneration(page: Page): Promise<void> {
  await page
    .getByRole("button", { name: /Generate brief \(\d+ credits\)/ })
    .click();
  await page.getByRole("button", { name: /Spend \d+ credits/ }).click();
}

test.describe("Company research persistence", () => {
  test.beforeEach(async ({ page }) => {
    await loginAsTestUser(page, { planId: "pro" });
  });

  test("generating a brief persists it and survives a reload", async ({ page }) => {
    const harness = await installCompanyResearchHarness(page);

    await page.goto(COMPANY_PATH);
    await confirmGeneration(page);

    await expect(page.getByText(BRIEF.overview)).toBeVisible({ timeout: 20_000 });
    expect(harness.startCalls()).toBe(1);
    expect(harness.savedRow()).not.toBeNull();

    await page.reload();
    await expect(page.getByText(BRIEF.overview)).toBeVisible({ timeout: 20_000 });
    expect(harness.startCalls()).toBe(1);
  });

  test("provider failure shows a retry instead of an empty brief", async ({ page }) => {
    const harness = await installCompanyResearchHarness(page, {
      kind: "provider_unavailable",
    });

    await page.goto(COMPANY_PATH);
    await confirmGeneration(page);

    await expect(
      page.getByText(/temporarily unavailable/i).first(),
    ).toBeVisible({ timeout: 20_000 });
    await expect(page.getByText(BRIEF.overview)).toHaveCount(0);

    harness.setOutcome({ kind: "success" });
    await page.getByRole("button", { name: /try again|retry/i }).first().click();
    await expect(page.getByText(BRIEF.overview)).toBeVisible({ timeout: 20_000 });
  });

  test("a persist failure never shows an unsaved brief", async ({ page }) => {
    await installCompanyResearchHarness(page, { kind: "persist_failure" });

    await page.goto(COMPANY_PATH);
    await confirmGeneration(page);

    await expect(
      page.getByText(/couldn't save it/i).first(),
    ).toBeVisible({ timeout: 20_000 });
    await expect(page.getByText(BRIEF.overview)).toHaveCount(0);
  });

  test("insufficient credits surfaces the credit message, not a generic failure", async ({
    page,
  }) => {
    await installCompanyResearchHarness(page, { kind: "insufficient_credits" });

    await page.goto(COMPANY_PATH);
    await confirmGeneration(page);

    await expect(
      page.getByText(/only 2 are available|enough credits/i).first(),
    ).toBeVisible({ timeout: 20_000 });
    await expect(page.getByText(BRIEF.overview)).toHaveCount(0);
  });

  test("refresh reloads the saved brief without charging credits", async ({ page }) => {
    const harness = await installCompanyResearchHarness(page);

    await page.goto(COMPANY_PATH);
    await confirmGeneration(page);
    await expect(page.getByText(BRIEF.overview)).toBeVisible({ timeout: 20_000 });
    expect(harness.startCalls()).toBe(1);

    const refresh = page.getByRole("button", { name: /^Refresh$/i }).first();
    await refresh.click();

    await expect(page.getByText(BRIEF.overview)).toBeVisible({ timeout: 20_000 });
    await expect(refresh).toBeEnabled({ timeout: 20_000 });
    expect(harness.startCalls()).toBe(1);
  });

  test("regenerate charges credits and sends an idempotency key", async ({ page }) => {
    const harness = await installCompanyResearchHarness(page, {
      kind: "success",
      delayMs: 400,
    });

    await page.goto(COMPANY_PATH);
    await confirmGeneration(page);
    await expect(page.getByText(BRIEF.overview)).toBeVisible({ timeout: 20_000 });
    expect(harness.startCalls()).toBe(1);

    await page.getByRole("button", { name: /regenerate/i }).first().click();
    await page.getByRole("button", { name: /Spend \d+ credits/ }).click();

    await expect(page.getByText(BRIEF.overview)).toBeVisible({ timeout: 20_000 });
    expect(harness.startCalls()).toBe(2);
    expect(harness.idempotencyKeys().length).toBeGreaterThan(0);
  });

  test("long provider latency still saves the brief without a hard timeout", async ({ page }) => {
    const harness = await installCompanyResearchHarness(page, { kind: "long_latency" });

    await page.goto(COMPANY_PATH);
    await confirmGeneration(page);

    await expect(page.getByRole("button", { name: /cancel generation/i })).toBeVisible({
      timeout: 10_000,
    });
    await expect(page.getByText(BRIEF.overview)).toBeVisible({ timeout: 20_000 });
    expect(harness.savedRow()).not.toBeNull();
    expect(harness.startCalls()).toBe(1);
  });
});
