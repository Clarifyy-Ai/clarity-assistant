import { test, expect, loginAsTestUser } from "../playwright-fixture";
import { expectDashboardReady, dismissWalkthrough } from "./helpers/auth-flow";
import type { Page } from "@playwright/test";

/**
 * BUG-21: Debriefs list must discover eligible completed sessions (incl. rehearsal),
 * and surface processing / failed / plan-restricted / empty states correctly.
 */

async function openDebriefs(page: Page) {
  await page.goto("/app/debriefs", { waitUntil: "domcontentloaded", timeout: 60_000 });
  await expect(page.getByTestId("page-header-title")).toHaveText(/Debriefs/i, {
    timeout: 45_000,
  });
  await dismissWalkthrough(page);
}

test.describe("Debriefs list states (BUG-21)", () => {
  test.describe.configure({ timeout: 120_000 });

  test("Pro: completed rehearsal shows Ready to generate", async ({ page }) => {
    await loginAsTestUser(page, {
      planId: "pro",
      debriefListMode: "pending-rehearsal",
    });
    await expectDashboardReady(page);
    await openDebriefs(page);
    await expect(page.getByText("Ready to generate")).toBeVisible({ timeout: 20_000 });
    await expect(page.getByText(/No eligible sessions yet/i)).toHaveCount(0);
  });

  test("Max: completed debrief is listed", async ({ page }) => {
    await loginAsTestUser(page, {
      planId: "enterprise",
      debriefListMode: "completed",
    });
    await expectDashboardReady(page);
    await openDebriefs(page);
    await expect(page.getByText("Focus: Structure")).toBeVisible({ timeout: 20_000 });
  });

  test("processing job shows Processing badge", async ({ page }) => {
    await loginAsTestUser(page, {
      planId: "pro",
      debriefListMode: "processing",
    });
    await expectDashboardReady(page);
    await openDebriefs(page);
    await expect(page.getByText("Processing").first()).toBeVisible({ timeout: 20_000 });
    await expect(page.getByRole("button", { name: /Refresh status/i })).toBeVisible();
  });

  test("failed job shows retry CTA", async ({ page }) => {
    await loginAsTestUser(page, {
      planId: "pro",
      debriefListMode: "failed",
    });
    await expectDashboardReady(page);
    await openDebriefs(page);
    await expect(page.getByText("Failed").first()).toBeVisible({ timeout: 20_000 });
    await expect(page.getByRole("button", { name: /Retry debrief/i })).toBeVisible();
  });

  test("no session shows empty eligible state", async ({ page }) => {
    await loginAsTestUser(page, {
      planId: "pro",
      debriefListMode: "empty",
    });
    await expectDashboardReady(page);
    await openDebriefs(page);
    await expect(page.getByText(/No eligible sessions yet/i)).toBeVisible({
      timeout: 20_000,
    });
  });

  test("plan restriction shows upgrade explanation", async ({ page }) => {
    await loginAsTestUser(page, {
      planId: "free",
      debriefListMode: "plan-restricted",
    });
    await expectDashboardReady(page);
    await openDebriefs(page);
    await expect(
      page.getByText(/Debriefs are not included in your current plan/i),
    ).toBeVisible({ timeout: 20_000 });
    await expect(page.getByRole("button", { name: /View plans/i })).toBeVisible();
  });
});
