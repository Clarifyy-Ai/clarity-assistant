import { test, expect, loginAsTestUser, dismissCookieBanner } from "../playwright-fixture";

const DESKTOP_VIEWPORT = { width: 1280, height: 720 };

test.describe("UI visual smoke @1280px [T-0919]", () => {
  test.beforeEach(async ({ page }) => {
    await page.setViewportSize(DESKTOP_VIEWPORT);
  });

  test("login page renders key elements", async ({ page }) => {
    await page.goto("/login", { waitUntil: "domcontentloaded" });
    await dismissCookieBanner(page);

    await expect(page).toHaveTitle(/Sign in/i, { timeout: 15_000 });
    await expect(
      page.getByRole("heading", { name: "Welcome back" })
    ).toBeVisible();
    await expect(page.getByRole("button", { name: "Sign in" })).toBeVisible();
    await expect(page.locator('input[name="email"]')).toBeVisible();
    await expect(page.locator('input[name="password"]')).toBeVisible();
  });

  test("dashboard renders for authenticated user", async ({ page }) => {
    await loginAsTestUser(page);
    await page.goto("/app/dashboard", { waitUntil: "domcontentloaded" });

    await expect(page).toHaveURL(/\/app\/dashboard/, { timeout: 15_000 });
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible({
      timeout: 15_000,
    });
  });

  test("help page renders key elements", async ({ page }) => {
    await page.goto("/help", { waitUntil: "domcontentloaded" });
    await dismissCookieBanner(page);

    await expect(page).toHaveTitle(/Help Center/i, { timeout: 15_000 });
    await expect(
      page.getByRole("heading", { name: "Help Center", level: 1 })
    ).toBeVisible({ timeout: 15_000 });
    await expect(page.getByPlaceholder(/search/i)).toBeVisible({
      timeout: 15_000,
    });
  });
});
