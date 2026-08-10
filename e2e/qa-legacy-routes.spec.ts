import { test, expect } from "../playwright-fixture";

test.describe("QA roadmap legacy redirects", () => {
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
});
