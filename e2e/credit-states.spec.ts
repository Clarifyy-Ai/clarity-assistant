import { test, expect, loginAsTestUser } from "../playwright-fixture";
import {
  mockGovExamGenerateRoutes,
  navigateToGovExamReview,
} from "./helpers/gov-exam-mocks";

const CREATE_EXAM_PAPER_CREDIT_COST = 3;

test.describe("Credit-state fixtures", () => {
  test("ZERO credit raw_prompt is 402 not 400 and dashboard shows exhausted copy", async ({
    page,
  }) => {
    await loginAsTestUser(page, { credits: 0, planId: "pro" });
    const result = await page.evaluate(async () => {
      const res = await fetch("https://qzgvjrvtkwlzxpmlddkx.supabase.co/functions/v1/prep-tool", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tool_id: "raw_prompt", input: "hello" }),
      });
      const json = await res.json();
      return { status: res.status, json };
    });
    expect(result.status).toBe(402);
    expect(JSON.stringify(result.json)).not.toMatch(/INVALID_TOOL/i);

    await page.goto("/app/dashboard", { waitUntil: "domcontentloaded" });
    await expect(page.getByText(/out of credits/i).first()).toBeVisible({ timeout: 15_000 });
  });

  test("ZERO_CREDIT_01: gov exam Generate gated at review (qa.zero@ fixture)", async ({
    page,
  }) => {
    await loginAsTestUser(page, { credits: 0, planId: "pro" });
    await mockGovExamGenerateRoutes(page);

    let createCalls = 0;
    await page.route("**/functions/v1/create-exam-paper", async (route) => {
      if (route.request().method() === "OPTIONS") {
        await route.fulfill({ status: 204, headers: { "access-control-allow-origin": "*" } });
        return;
      }
      createCalls += 1;
      await route.fulfill({
        status: 402,
        contentType: "application/json",
        headers: { "access-control-allow-origin": "*" },
        body: JSON.stringify({
          code: "INSUFFICIENT_CREDITS",
          error: "You need 3 credits, but only 0 are available.",
          balance: 0,
          cost: CREATE_EXAM_PAPER_CREDIT_COST,
        }),
      });
    });

    await navigateToGovExamReview(page, "quick", {
      reviewAction: "Top up to generate",
      expectEnabled: false,
    });

    await expect(
      page.getByText(
        new RegExp(
          `You need ${CREATE_EXAM_PAPER_CREDIT_COST} credits to generate this paper, but you only have 0`,
        ),
      ),
    ).toBeVisible({ timeout: 15_000 });
    const topUpButton = page.getByRole("button", { name: "Top up to generate" });
    await expect(topUpButton).toBeVisible();
    await expect(topUpButton).toBeDisabled();
    await expect(page.getByRole("button", { name: "Generate Practice Paper" })).toHaveCount(0);

    await page.getByRole("button", { name: /Upgrade \/ top up/i }).click();
    await expect(page.getByText(/out of credits|credits/i).first()).toBeVisible({
      timeout: 10_000,
    });
    expect(createCalls).toBe(0);
  });

  test("LOW credit shows remaining-credits warning, not exhausted", async ({ page }) => {
    await loginAsTestUser(page, { credits: 5, planId: "free" });
    await page.goto("/app/dashboard", { waitUntil: "domcontentloaded" });
    await expect(page.getByText(/5 credits left/i).first()).toBeVisible({ timeout: 15_000 });
    await expect(page.getByText(/out of credits/i)).toHaveCount(0);
  });

  test("EXACT 12 credits runs generate_questions once then 402s", async ({ page }) => {
    await loginAsTestUser(page, { credits: 12, planId: "pro" });
    const first = await page.evaluate(async () => {
      const res = await fetch(
        "https://qzgvjrvtkwlzxpmlddkx.supabase.co/functions/v1/generate-questions",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ count: 1 }),
        },
      );
      return res.status;
    });
    expect(first).toBe(200);
    const second = await page.evaluate(async () => {
      const res = await fetch(
        "https://qzgvjrvtkwlzxpmlddkx.supabase.co/functions/v1/generate-questions",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ count: 1 }),
        },
      );
      return res.status;
    });
    expect(second).toBe(402);
  });

  test("SUFFICIENT balance does not show exhausted or low banner", async ({ page }) => {
    await loginAsTestUser(page, { credits: 500, planId: "pro" });
    await page.goto("/app/dashboard", { waitUntil: "domcontentloaded" });
    await expect(page.getByText(/out of credits/i)).toHaveCount(0);
    await expect(page.getByText(/credits left/i)).toHaveCount(0);
  });

  test("PAST_DUE shows payment action required on billing", async ({ page }) => {
    await loginAsTestUser(page, {
      credits: 80,
      planId: "pro",
      subscriptionStatus: "past_due",
    });
    await page.goto("/app/settings/billing", { waitUntil: "domcontentloaded" });
    await expect(page.getByText(/Payment action required/i)).toBeVisible({ timeout: 20_000 });
  });
});
