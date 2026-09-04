import { test, expect, loginAsTestUser } from "../playwright-fixture";
import { expectDashboardReady } from "./helpers/auth-flow";

test.describe("Dashboard / navigation polish (WS20)", () => {
  test("dashboard loads with independent section content", async ({ page }) => {
    await loginAsTestUser(page);
    await expectDashboardReady(page);

    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    // Session activity / empty feed should render without blanking the page
    await expect(page.locator("body")).not.toBeEmpty();
    // Activity readiness must not be labeled as interview score
    await expect(page.getByText(/activity readiness/i).first()).toBeVisible({
      timeout: 15_000,
    });
  });

  test("primary nav routes resolve without blank pages", async ({ page }) => {
    await loginAsTestUser(page);

    const routes = [
      "/app/dashboard",
      "/app/sessions",
      "/app/answers",
      "/app/documents",
      "/app/settings",
      "/app/settings/data",
    ] as const;

    for (const path of routes) {
      await page.goto(path, { waitUntil: "domcontentloaded" });
      await expect(page.locator("body")).toBeVisible();
      await expect(page.getByText(/something went wrong/i)).toHaveCount(0);
      // Should stay authenticated in /app/*
      await expect(page).toHaveURL(new RegExp(path.replace(/\//g, "\\/")));
    }
  });

  test("mobile viewport does not overflow dashboard horizontally", async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 });
    await loginAsTestUser(page);
    await expectDashboardReady(page);

    const overflow = await page.evaluate(() => {
      const doc = document.documentElement;
      return doc.scrollWidth > doc.clientWidth + 2;
    });
    expect(overflow).toBe(false);
  });
});
