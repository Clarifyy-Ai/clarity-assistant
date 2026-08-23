import {
  test,
  expect,
  setupSupabaseMocks,
  fillLoginForm,
  dismissCookieBanner,
  E2E_TEST_USER,
  expectDashboardReady,
  clickLogout,
  clearBrowserAuthState,
  loginAsTestUser,
} from "../playwright-fixture";

test.describe("Login flow [T-0894]", () => {
  test.beforeEach(async ({ page }) => {
    await setupSupabaseMocks(page);
    await clearBrowserAuthState(page);
  });

  test("signs in with mocked credentials and reaches dashboard", async ({
    page,
  }) => {
    await dismissCookieBanner(page);
    await fillLoginForm(page, E2E_TEST_USER.email, E2E_TEST_USER.password);
    await page.getByRole("button", { name: "Sign in" }).click();
    await expectDashboardReady(page);
    await expect(page.getByText("E2E Test User").first()).toBeVisible({
      timeout: 10_000,
    });
  });

  test("shows error for invalid credentials", async ({ page }) => {
    await dismissCookieBanner(page);
    await fillLoginForm(page, "bad@example.com", "wrong-password");
    await page.getByRole("button", { name: "Sign in" }).click();

    await expect(page.getByText(/Incorrect email or password/i)).toBeVisible({
      timeout: 15_000,
    });
    await expect(page).toHaveURL(/\/login/);
  });
});

test.describe("Logout [T-0901]", () => {
  test("logs out from settings and returns to login", async ({ page }) => {
    await loginAsTestUser(page);
    await page.goto("/app/settings", { waitUntil: "domcontentloaded" });
    await clickLogout(page);
    await expect(page).toHaveURL(/\/login/, { timeout: 15_000 });
    await expect(page.locator('input[name="email"]').first()).toBeVisible({
      timeout: 15_000,
    });
    await expect(
      page.getByRole("heading", { name: /Welcome back|Sign in/i }),
    ).toBeVisible({ timeout: 15_000 });
  });
});
