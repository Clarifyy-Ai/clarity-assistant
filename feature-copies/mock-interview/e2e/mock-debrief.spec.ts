import { test, expect } from "../playwright-fixture";

test.describe("Mock test debrief smoke", () => {
  test("mock hub and debrief routes are reachable when logged out redirects to login", async ({
    page,
  }) => {
    await page.goto("/app/mock-test");
    await expect(page).toHaveURL(/\/login/);

    await page.goto("/app/debrief");
    await expect(page).toHaveURL(/\/login/);
  });

  test("marketing mock-test CTA path exists on landing", async ({ page }) => {
    await page.goto("/");
    await expect(
      page.getByRole("link", { name: /Get started free/i }).first()
    ).toBeVisible();
  });
});
