import { test, expect, loginAsTestUser } from "../playwright-fixture";

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
