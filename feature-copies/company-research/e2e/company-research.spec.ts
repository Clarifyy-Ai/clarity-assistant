import { expect, test, type Page, type Route } from "@playwright/test";
import { E2E_TEST_USER, loginAsTestUser } from "./helpers/auth-flow";

const COMPANY = "Acme Corp";
const COMPANY_PATH = `/app/companies/acme-corp?name=${encodeURIComponent(COMPANY)}`;

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
  | { kind: "persist_failure" };

type Harness = {
  edgeCalls: () => number;
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
  const idempotencyKeys: string[] = [];
  let savedRow: Record<string, unknown> | null = null;

  await page.route("**/rest/v1/company_research*", async (route) => {
    if (route.request().method() !== "GET") {
      // The client must never write this table — the Edge Function owns it.
      return route.fulfill({
        status: 403,
        contentType: "application/json",
        headers: corsHeaders(route),
        body: JSON.stringify({ message: "client writes are not allowed" }),
      });
    }
    return route.fulfill({
      status: 200,
      contentType: "application/json",
      headers: corsHeaders(route),
      body: JSON.stringify(savedRow ?? null),
    });
  });

  await page.route("**/functions/v1/company-research", async (route) => {
    if (route.request().method() === "OPTIONS") {
      return route.fulfill({ status: 204, headers: corsHeaders(route), body: "" });
    }
    edgeCalls += 1;
    const key = route.request().headers()["x-idempotency-key"];
    if (key) idempotencyKeys.push(key);

    if (outcome.kind === "insufficient_credits") {
      return route.fulfill({
        status: 402,
        contentType: "application/json",
        headers: corsHeaders(route),
        body: JSON.stringify({
          error: "You need 12 credits, but only 2 are available.",
          code: "INSUFFICIENT_CREDITS",
          balance: 2,
          required: 12,
        }),
      });
    }

    if (outcome.kind === "provider_unavailable") {
      return route.fulfill({
        status: 503,
        contentType: "application/json",
        headers: corsHeaders(route),
        body: JSON.stringify({
          success: false,
          error: "Company research is temporarily unavailable. Your credits were not charged.",
          code: "PROVIDER_UNAVAILABLE",
        }),
      });
    }

    if (outcome.kind === "persist_failure") {
      return route.fulfill({
        status: 503,
        contentType: "application/json",
        headers: corsHeaders(route),
        body: JSON.stringify({
          success: false,
          error: "Research was generated, but we couldn't save it. Please retry.",
          code: "DATABASE_UNAVAILABLE",
        }),
      });
    }

    if (outcome.delayMs) {
      await new Promise((resolve) => setTimeout(resolve, outcome.delayMs));
    }

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

    return route.fulfill({
      status: 200,
      contentType: "application/json",
      headers: corsHeaders(route),
      body: JSON.stringify({
        success: true,
        id: savedRow.id,
        persisted: true,
        brief: BRIEF,
      }),
    });
  });

  return {
    edgeCalls: () => edgeCalls,
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
    expect(harness.edgeCalls()).toBe(1);
    expect(harness.savedRow()).not.toBeNull();

    // Reload reads the saved row by canonical identity — no second charge.
    await page.reload();
    await expect(page.getByText(BRIEF.overview)).toBeVisible({ timeout: 20_000 });
    expect(harness.edgeCalls()).toBe(1);
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

    // Retry succeeds and renders the persisted brief.
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

  test("double-clicking refresh charges once and sends an idempotency key", async ({
    page,
  }) => {
    const harness = await installCompanyResearchHarness(page, {
      kind: "success",
      delayMs: 1_200,
    });

    await page.goto(COMPANY_PATH);
    await confirmGeneration(page);
    await expect(page.getByText(BRIEF.overview)).toBeVisible({ timeout: 20_000 });
    expect(harness.edgeCalls()).toBe(1);

    const refresh = page.getByRole("button", { name: /refresh/i }).first();
    // Dispatch both clicks in one browser turn so Playwright cannot serialize a
    // second click after the request finishes (disabled-button auto-wait).
    await refresh.evaluate((el) => {
      (el as HTMLButtonElement).click();
      (el as HTMLButtonElement).click();
    });

    await expect(page.getByText(BRIEF.overview)).toBeVisible({ timeout: 20_000 });
    await expect(refresh).toBeEnabled({ timeout: 20_000 });
    expect(harness.edgeCalls()).toBe(2);
    expect(harness.idempotencyKeys()).toHaveLength(2);
    for (const key of harness.idempotencyKeys()) {
      expect(key.length).toBeGreaterThan(8);
    }
    // Same intent ⇒ same key, so a repeat that slips past the client guard is
    // collapsed by the credit ledger instead of charging twice.
    expect(new Set(harness.idempotencyKeys()).size).toBe(1);
  });
});
