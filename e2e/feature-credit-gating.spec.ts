import { test, expect, loginAsTestUser } from "../playwright-fixture";
import { expectDashboardReady } from "./helpers/auth-flow";

/**
 * Feature-level credit gating: zero/low credits must not block the app shell.
 * Paid actions show Buy Credits in-place — never auto-redirect to Billing.
 */
test.describe("Feature-level credit gating (app remains usable)", () => {
  test("core routes stay open without billing redirect", async ({ page }) => {
    await loginAsTestUser(page);
    await expectDashboardReady(page);

    const routes = [
      "/app/dashboard",
      "/app/documents",
      "/app/sessions",
      "/app/mock-test",
      "/app/assessments",
      "/app/settings/billing",
    ] as const;

    for (const path of routes) {
      await page.goto(path, { waitUntil: "domcontentloaded" });
      await expect(page.locator("body")).toBeVisible();
      await expect(page.getByText(/something went wrong/i)).toHaveCount(0);
      // Must not bounce away from the requested route solely for credits.
      await expect(page).toHaveURL(new RegExp(path.replace(/\//g, "\\/")));
    }
  });

  test("practice setup stays interactive when credits are exhausted", async ({ page }) => {
    await loginAsTestUser(page);
    await page.goto("/app/live", { waitUntil: "domcontentloaded" });
    await expect(page.locator("body")).toBeVisible();
    // Full-page CreditExhaustedState must not replace the wizard.
    const exhaustedOnly = page.getByText("You're out of credits");
    const wizardOrSession = page
      .getByText(/Start Practice Session|Start Mock Session|Practice Coach|session setup/i)
      .or(page.getByTestId("insufficient-credits-action"));
    // Page remains usable: either wizard content or action-level credit panel.
    await expect(page.locator("body")).not.toBeEmpty();
    const hasFullPageBlock =
      (await exhaustedOnly.count()) > 0 &&
      (await page.getByRole("button", { name: /Buy credits/i }).count()) > 0 &&
      (await wizardOrSession.count()) === 0;
    expect(hasFullPageBlock).toBe(false);
  });
});
