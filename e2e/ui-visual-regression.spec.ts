import {
  test,
  expect,
  dismissCookieBanner,
  setupSupabaseMocks,
  loginAsTestUser,
} from "../playwright-fixture";
import type { Page } from "@playwright/test";

const DESKTOP_VIEWPORT = { width: 1280, height: 720 };

/** DD-003..011 layout widths from Wave 3 plan. */
const DD_VIEWPORTS = [
  { width: 360, height: 800 },
  { width: 375, height: 812 },
  { width: 414, height: 896 },
  { width: 768, height: 1024 },
  { width: 1366, height: 768 },
  { width: 1440, height: 900 },
  { width: 1920, height: 1080 },
] as const;

const SCREENSHOT_OPTS = {
  maxDiffPixelRatio: 0.05,
  animations: "disabled" as const,
};

async function waitForPublicPage(page: Page) {
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

    await expect(page).toHaveScreenshot("login.png", SCREENSHOT_OPTS);
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

    await expect(page).toHaveScreenshot("help.png", SCREENSHOT_OPTS);
  });
});

test.describe("DD layout visual regression (multi-width)", () => {
  test("verify-certificate (public) landmarks + screenshots", async ({ page }) => {
    await setupSupabaseMocks(page);

    for (const vp of DD_VIEWPORTS) {
      await page.setViewportSize(vp);
      await page.goto("/verify-certificate", { waitUntil: "domcontentloaded" });
      await dismissCookieBanner(page);

      await expect(page.getByTestId("dd-layout-root")).toBeVisible({ timeout: 20_000 });
      await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
      await expect(page.getByLabel(/certificate id/i)).toBeVisible();
      await expect(page.getByRole("button", { name: /^Verify$/i })).toBeVisible();

      await expect(page).toHaveScreenshot(`dd-verify-certificate-${vp.width}.png`, SCREENSHOT_OPTS);
    }
  });

  test("auth DD hubs landmarks + screenshots", async ({ page }) => {
    await loginAsTestUser(page, { planId: "pro" });

    const routes = [
      { path: "/app/analytics", name: "analytics", testId: "page-width-root" },
      { path: "/app/settings/billing", name: "billing", testId: "dd-layout-root" },
      { path: "/app/prep/coding-hints", name: "coding-hints", testId: "dd-layout-root" },
      { path: "/app/prep/system-design", name: "system-design", testId: "dd-layout-root" },
      { path: "/app/coding", name: "coding-lab", testId: null },
    ] as const;

    for (const route of routes) {
      for (const vp of DD_VIEWPORTS) {
        await page.setViewportSize(vp);
        await page.goto(route.path, { waitUntil: "domcontentloaded" });
        await dismissCookieBanner(page);

        await expect(page).not.toHaveURL(/\/login/, { timeout: 20_000 });
        if (route.testId) {
          await expect(page.getByTestId(route.testId)).toBeVisible({ timeout: 25_000 });
        } else {
          await expect(page.getByRole("heading", { level: 1 })).toBeVisible({ timeout: 25_000 });
        }

        // Full-page shots only on one mobile + one desktop width to limit artifact size.
        if (vp.width === 375 || vp.width === 1440) {
          await expect(page).toHaveScreenshot(
            `dd-${route.name}-${vp.width}.png`,
            SCREENSHOT_OPTS,
          );
        }
      }
    }
  });
});
