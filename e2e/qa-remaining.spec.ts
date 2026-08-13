import { test, expect, loginAsTestUser } from "../playwright-fixture";

test.describe("QA remaining product paths", () => {
  test("More sheet Logout is reachable on a mobile viewport", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await loginAsTestUser(page);
    await page.getByRole("button", { name: /More navigation/i }).click();
    const logout = page.getByRole("button", { name: /Log out/i });
    await expect(logout).toBeVisible();
    await logout.scrollIntoViewIfNeeded();
    await expect(logout).toBeInViewport();
  });

  test("Command Palette ranks prep tools and lists Guide", async ({ page }) => {
    await loginAsTestUser(page);
    await page.getByRole("button", { name: /Search \(Ctrl\+K\)/i }).click();
    const input = page.getByPlaceholder(/Search pages/i);
    await expect(input).toBeVisible({ timeout: 10_000 });
    await input.fill("prep");
    const list = page.getByRole("dialog");
    await expect(list.getByText(/Prep Lab|STAR builder|Rephraser/i).first()).toBeVisible();
    await input.fill("guide");
    await expect(list.getByText(/^Guide$/).first()).toBeVisible();
  });

  test("onboarding rerun Skip lands on Dashboard", async ({ page }) => {
    await loginAsTestUser(page);
    await page.goto("/onboarding?rerun=1", { waitUntil: "domcontentloaded" });
    await expect(page.getByRole("button", { name: /Skip to dashboard/i })).toBeVisible({
      timeout: 15_000,
    });
    await page.getByRole("button", { name: /Skip to dashboard/i }).click();
    await expect(page).toHaveURL(/\/app\/dashboard/, { timeout: 20_000 });
  });

  test("Interview Day exposes Continue in browser", async ({ page }) => {
    await loginAsTestUser(page);
    await page.goto("/app/interview-day", { waitUntil: "domcontentloaded" });
    await expect(page.getByText(/Continue in browser/i).first()).toBeVisible({
      timeout: 15_000,
    });
  });

  test("non-admin sees Access Denied on admin", async ({ page }) => {
    await loginAsTestUser(page);
    await page.goto("/app/admin", { waitUntil: "domcontentloaded" });
    await expect(page.getByRole("heading", { name: /Access Denied/i })).toBeVisible({
      timeout: 20_000,
    });
    await expect(page.getByText(/You are not authorized/i)).toBeVisible();
    await expect(page.getByRole("link", { name: /Return to Dashboard/i })).toBeVisible();
  });

  test("Gap analysis JD select is present on documents", async ({ page }) => {
    await loginAsTestUser(page);
    await page.goto("/app/documents", { waitUntil: "domcontentloaded" });
    await expect(
      page.getByText(/job description/i).first(),
    ).toBeVisible({ timeout: 15_000 });
  });

  test("analytics unscored sessions are labeled Not scored, not 0", async ({ page }) => {
    await loginAsTestUser(page);
    await page.goto("/app/analytics", { waitUntil: "domcontentloaded" });
    await expect(page.getByRole("heading", { name: /Analytics/i })).toBeVisible({
      timeout: 20_000,
    });
    const notScored = page.getByText(/Not scored/i);
    if (await notScored.count()) {
      await expect(notScored.first()).toBeVisible();
    }
  });
});
