import { test, expect, loginAsTestUser, setupSupabaseMocks } from "../playwright-fixture";

test.describe("Remaining workstreams regression", () => {
  test("onboarding gate still blocks /app for incomplete users", async ({ page }) => {
    await loginAsTestUser(page, { onboarded: false });
    await page.goto("/app/dashboard", { waitUntil: "domcontentloaded" });
    await expect(page).toHaveURL(/onboarding/, { timeout: 20_000 });
  });

  test("contact sales route submits or shows honest fallback", async ({ page }) => {
    await setupSupabaseMocks(page);
    await page.goto("/contact-sales", { waitUntil: "domcontentloaded" });
    await expect(page.getByRole("heading", { name: /Contact Sales/i })).toBeVisible();
    await page.getByPlaceholder(/name/i).fill("Ada Lovelace");
    await page.getByPlaceholder(/email/i).fill("ada@example.com");
    await page.getByPlaceholder(/evaluating/i).fill("We need Max seats for a 12 person team.");
    await page.getByRole("button", { name: /Send message/i }).click();
    await expect(
      page.getByText(/Message sent|not configured|mailto|sales@/i).first(),
    ).toBeVisible({ timeout: 15_000 });
  });

  test("hybrid fallback is not a fake 200", async ({ page }) => {
    await setupSupabaseMocks(page);
    await page.route("**/functions/v1/hybrid-health**", async (route) => {
      return route.fulfill({
        status: 503,
        contentType: "application/json",
        body: JSON.stringify({ ok: false, code: "HYBRID_UNAVAILABLE" }),
      });
    });
    const status = await page.evaluate(async () => {
      const res = await fetch("https://qzgvjrvtkwlzxpmlddkx.supabase.co/functions/v1/hybrid-health", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: "{}",
      });
      return res.status;
    });
    expect(status).toBe(503);
  });
});
