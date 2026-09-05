import { test, expect } from "../playwright-fixture";
import { dismissCookieBanner } from "./helpers/auth-flow";

test.describe("Referral lifecycle (capture → signup UX)", () => {
  test("signup shows saved message (not false success) for ?ref=", async ({ page }) => {
    await page.route("**/functions/v1/validate-referral-code", async (route) => {
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          valid: true,
          programmeVersion: "referral-v1",
          code: "OK",
        }),
      });
    });

    await page.goto("/signup?ref=LIFE001", { waitUntil: "domcontentloaded" });
    await dismissCookieBanner(page);

    const banner = page.locator("text=Referral code LIFE001 saved");
    await expect(banner).toBeVisible({ timeout: 10_000 });
    await expect(banner).toContainText("verification");
    await expect(page.getByText(/bonus credits added/i)).toHaveCount(0);

    const stored = await page.evaluate(() => localStorage.getItem("clarify_ref"));
    expect(stored).toBe("LIFE001");
  });

  test("login signup link preserves referral code in URL", async ({ page }) => {
    await page.goto("/login?ref=LIFE002", { waitUntil: "networkidle" });
    await dismissCookieBanner(page);

    const signupLink = page.locator('a[href*="/signup"]').filter({ hasText: /get started free/i });
    await expect(signupLink).toHaveAttribute("href", /ref=LIFE002/, { timeout: 10_000 });
  });

  test("marketing capture persists ref for OAuth path", async ({ page }) => {
    await page.goto("/pricing?ref=OAUTH01", { waitUntil: "networkidle" });
    await dismissCookieBanner(page);

    await page.waitForFunction(
      () => localStorage.getItem("clarify_ref") === "OAUTH01",
      undefined,
      { timeout: 10_000 },
    );
    const stored = await page.evaluate(() => localStorage.getItem("clarify_ref"));
    expect(stored).toBe("OAUTH01");
  });
});
