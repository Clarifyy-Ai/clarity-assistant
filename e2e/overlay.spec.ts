import { test, expect } from "../playwright-fixture";

test.describe("Live overlay (public gate)", () => {
  test("redirects unauthenticated users to login", async ({ page }) => {
    await page.goto("/app/live/overlay", { waitUntil: "domcontentloaded" });
    await expect(page).toHaveURL(/\/login/, { timeout: 15_000 });
    await expect(
      page.getByRole("heading", { name: "Welcome back" })
    ).toBeVisible();
  });
});
