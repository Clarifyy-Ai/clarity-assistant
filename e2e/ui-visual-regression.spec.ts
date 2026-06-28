import {
  test,
  expect,
  dismissCookieBanner,
  setupSupabaseMocks,
} from "../playwright-fixture";

const DESKTOP_VIEWPORT = { width: 1280, height: 720 };

async function waitForPublicPage(page: import("@playwright/test").Page) {
  await page.waitForLoadState("networkidle");
}

test.describe("UI visual regression @1280px", () => {
  test.beforeEach(async ({ page }) => {
    await page.setViewportSize(DESKTOP_VIEWPORT);
    await setupSupabaseMocks(page);
  });

  test("login page matches snapshot", async ({ page }) => {
    await page.goto("/login", { waitUntil: "load" });
    await dismissCookieBanner(page);
    await waitForPublicPage(page);

    await expect(
      page.getByRole("heading", { name: "Welcome back" })
    ).toBeVisible({ timeout: 30_000 });
    await expect(page.locator('input[name="email"]')).toBeVisible();
    await expect(page.getByRole("button", { name: "Sign in" })).toBeVisible();

    await expect(page).toHaveScreenshot("login.png", {
      maxDiffPixelRatio: 0.05,
      animations: "disabled",
    });
  });

  test("help page matches snapshot", async ({ page }) => {
    await page.goto("/help", { waitUntil: "load" });
    await dismissCookieBanner(page);
    await waitForPublicPage(page);

    await expect(
      page.getByRole("heading", { name: "Help Center", level: 1 })
    ).toBeVisible({ timeout: 30_000 });
    await expect(page.getByPlaceholder(/search help articles/i)).toBeVisible({
      timeout: 15_000,
    });

    await expect(page).toHaveScreenshot("help.png", {
      maxDiffPixelRatio: 0.05,
      animations: "disabled",
    });
  });
});
