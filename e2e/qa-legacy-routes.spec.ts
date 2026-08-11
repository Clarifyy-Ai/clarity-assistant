import { test, expect } from "../playwright-fixture";

test.describe("QA Aug11 legacy + billing redirects", () => {
  test("answer-bank path does not 404", async ({ page }) => {
    const res = await page.goto("/app/answer-bank");
    expect(res?.status()).not.toBe(404);
    await expect(page).toHaveURL(/\/(login|app\/answers)/);
  });

  test("debriefs path does not 404", async ({ page }) => {
    const res = await page.goto("/app/debriefs");
    expect(res?.status()).not.toBe(404);
    await expect(page).toHaveURL(/\/(login|app\/debrief)/);
  });

  test("billing path redirects toward settings billing or login", async ({ page }) => {
    const res = await page.goto("/app/billing");
    expect(res?.status()).not.toBe(404);
    await expect(page).toHaveURL(/\/(login|app\/settings\/billing)/);
  });

  test("subscription path redirects toward settings billing or login", async ({ page }) => {
    const res = await page.goto("/app/subscription");
    expect(res?.status()).not.toBe(404);
    await expect(page).toHaveURL(/\/(login|app\/settings\/billing)/);
  });

  test("pricing paid CTA includes plan and interval", async ({ page }) => {
    await page.goto("/pricing");
    const annual = page.getByRole("button", { name: /annual/i }).first();
    if (await annual.isVisible()) {
      await annual.click();
    }
    const pro = page.locator('a[href*="plan=pro"]').first();
    await expect(pro).toBeVisible({ timeout: 15_000 });
    const href = await pro.getAttribute("href");
    expect(href).toMatch(/plan=pro/);
    expect(href).toMatch(/interval=/);
  });
});
