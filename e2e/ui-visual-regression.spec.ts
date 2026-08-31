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

test.describe("Public + auth visual regression (plan viewports)", () => {
  test("login and help at every required width", async ({ page }) => {
    await setupSupabaseMocks(page);
    const routes = [
      { path: "/login", heading: /Welcome back/i },
      { path: "/forgot-password", heading: /Reset|Forgot|password/i },
      { path: "/help", heading: /Help Center/i },
      { path: "/", heading: /.+/ },
      { path: "/pricing", heading: /Pricing|Plans|Clarify/i },
      { path: "/contact-sales", heading: /Contact Sales/i },
      { path: "/share/invalid-token", heading: /unavailable|invalid|expired/i },
    ] as const;
    for (const route of routes) {
      for (const vp of DD_VIEWPORTS) {
        await page.setViewportSize(vp);
        await page.goto(route.path, { waitUntil: "domcontentloaded" });
        await dismissCookieBanner(page);
        await expect(page.getByRole("heading", { name: route.heading })).toBeVisible({
          timeout: 20_000,
        });
        if (vp.width === 360 || vp.width === 768 || vp.width === 1920) {
          await expect(page).toHaveScreenshot(
            `plan-${route.path.replace("/", "")}-${vp.width}.png`,
            SCREENSHOT_OPTS,
          );
        }
      }
    }
  });

  test("TC-PUB-014 company marketing pages render from footer routes", async ({ page }) => {
    await setupSupabaseMocks(page);
    await page.setViewportSize(DESKTOP_VIEWPORT);
    const routes = [
      { path: "/about", heading: /^About$/i },
      { path: "/industries", heading: /^Industries$/i },
      { path: "/cookies", heading: /^Cookies$/i },
      { path: "/faq", heading: /^FAQ$/i },
    ] as const;
    for (const route of routes) {
      await page.goto(route.path, { waitUntil: "domcontentloaded" });
      await dismissCookieBanner(page);
      await expect(page.getByRole("heading", { name: route.heading, level: 1 })).toBeVisible({
        timeout: 20_000,
      });
      await expect(page.getByRole("contentinfo").getByRole("link", { name: "About" })).toBeVisible();
      await expect(page.getByRole("contentinfo").getByRole("link", { name: "Industries" })).toBeVisible();
      await expect(page.getByRole("contentinfo").getByRole("link", { name: "Cookies" })).toBeVisible();
      await expect(page.getByRole("contentinfo").getByRole("link", { name: "FAQ" })).toBeVisible();
    }
  });

  test("Login Support FAB does not cover Sign in at 360px", async ({ page }) => {
    await setupSupabaseMocks(page);
    await page.setViewportSize({ width: 360, height: 800 });
    await page.goto("/login", { waitUntil: "domcontentloaded" });
    await dismissCookieBanner(page);
    const signIn = page.getByRole("button", { name: "Sign in" });
    const fab = page.getByRole("button", { name: /support|help|chat/i }).last();
    await expect(signIn).toBeVisible({ timeout: 15_000 });
    if (await fab.count()) {
      const signBox = await signIn.boundingBox();
      const fabBox = await fab.boundingBox();
      if (signBox && fabBox) {
        const overlap =
          signBox.x < fabBox.x + fabBox.width &&
          signBox.x + signBox.width > fabBox.x &&
          signBox.y < fabBox.y + fabBox.height &&
          signBox.y + signBox.height > fabBox.y;
        expect(overlap).toBe(false);
      }
    }
  });

  test("Help Support FAB does not overlap footer Login", async ({ page }) => {
    await setupSupabaseMocks(page);
    await page.setViewportSize({ width: 375, height: 812 });
    await page.goto("/help", { waitUntil: "domcontentloaded" });
    await dismissCookieBanner(page);
    const login = page.getByRole("link", { name: /^Login$/i }).last();
    const fab = page.locator("[class*='fixed']").filter({ has: page.getByRole("button") }).last();
    await expect(login).toBeVisible({ timeout: 15_000 });
    if (await fab.count()) {
      const loginBox = await login.boundingBox();
      const fabBox = await fab.boundingBox();
      if (loginBox && fabBox) {
        const overlap =
          loginBox.x < fabBox.x + fabBox.width &&
          loginBox.x + loginBox.width > fabBox.x &&
          loginBox.y < fabBox.y + fabBox.height &&
          loginBox.y + loginBox.height > fabBox.y;
        expect(overlap).toBe(false);
      }
    }
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
