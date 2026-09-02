import {
  test,
  expect,
  setupSupabaseMocks,
  fillLoginForm,
  dismissCookieBanner,
  E2E_TEST_USER,
  loginAsTestUser,
  clearBrowserAuthState,
} from "../playwright-fixture";
import type { Page } from "@playwright/test";

async function mockOAuthProbeMisconfigured(page: Page): Promise<void> {
  await page.route("**/auth/v1/authorize**", async (route) => {
    return route.fulfill({
      status: 400,
      contentType: "application/json",
      body: JSON.stringify({
        error: "validation_failed",
        error_code: "validation_failed",
        msg: "Unsupported provider: provider is not enabled",
      }),
    });
  });
}

test.describe("Unverified login [AUTH-VERIFY]", () => {
  test("maps email_not_confirmed 400 to friendly copy and stays on login", async ({
    page,
  }) => {
    await setupSupabaseMocks(page, { emailConfirmed: false, onboarded: false });
    await clearBrowserAuthState(page);
    await dismissCookieBanner(page);
    await fillLoginForm(page, E2E_TEST_USER.email, E2E_TEST_USER.password);
    await page.getByRole("button", { name: "Sign in" }).click();

    await expect(page.getByText(/verify your email before continuing/i)).toBeVisible({
      timeout: 15_000,
    });
    await expect(page.getByText(/email_not_confirmed/i)).toHaveCount(0);
    await expect(page).toHaveURL(/\/verify-email/);
  });
});

test.describe("MFA challenge [AUTH-MFA]", () => {
  test("enrolled TOTP is challenged after password", async ({ page }) => {
    await loginAsTestUser(page, { mfaEnrolled: true });
    await expect(page.getByLabel(/Authenticator code/i)).toBeVisible();
    await expect(page).toHaveURL(/\/login/);
  });
});

test.describe("TC-PUB-013 OAuth CTA visibility + honest errors", () => {
  test("public signup CTA reaches auth entry without raw OAuth errors", async ({ page }) => {
    await setupSupabaseMocks(page);
    await mockOAuthProbeMisconfigured(page);
    await page.goto("/", { waitUntil: "domcontentloaded" });
    await dismissCookieBanner(page);

    await expect(page.getByRole("heading", { level: 1 })).toBeVisible({ timeout: 20_000 });

    const cta = page.getByRole("link", { name: "Get started free" }).first();
    await expect(cta).toBeVisible({ timeout: 20_000 });
    await cta.click();
    await expect(page).toHaveURL(/\/(signup|login)/, { timeout: 15_000 });
    await expect(page.getByText(/validation_failed/i)).toHaveCount(0);
  });

  test("login hides broken Google CTA when OAuth probe fails", async ({ page }) => {
    await setupSupabaseMocks(page);
    await mockOAuthProbeMisconfigured(page);
    await clearBrowserAuthState(page);
    await dismissCookieBanner(page);
    await page.goto("/login", { waitUntil: "domcontentloaded" });
    await expect(page.getByRole("heading", { name: "Welcome back" })).toBeVisible({
      timeout: 15_000,
    });

    const notConfigured = page.getByTestId("oauth-not-configured");
    const googleBtn = page.getByRole("button", { name: /continue with google/i });

    await page.waitForTimeout(2_000);

    if (await notConfigured.count()) {
      await expect(notConfigured).toBeVisible();
      await expect(notConfigured).toContainText(/not configured/i);
      await expect(googleBtn).toHaveCount(0);
    } else {
      // Fail-closed build (VITE_OAUTH_PROVIDERS=none): no broken OAuth CTA advertised.
      await expect(googleBtn).toHaveCount(0);
    }
    await expect(page.getByText(/validation_failed/i)).toHaveCount(0);
    await expect(page.getByText(/provider is not enabled/i)).toHaveCount(0);
  });

  test("signup shows honest OAuth status when probe fails", async ({ page }) => {
    await setupSupabaseMocks(page);
    await mockOAuthProbeMisconfigured(page);
    await page.goto("/signup", { waitUntil: "domcontentloaded" });
    await dismissCookieBanner(page);

    const notConfigured = page.getByTestId("oauth-not-configured");
    const googleBtn = page.getByRole("button", { name: /continue with google/i });
    await page.waitForTimeout(2_000);

    if (await notConfigured.count()) {
      await expect(notConfigured).toContainText(/not configured/i);
      await expect(googleBtn).toHaveCount(0);
    } else {
      await expect(googleBtn).toHaveCount(0);
    }
    await expect(page.getByText(/validation_failed/i)).toHaveCount(0);
  });
});

test.describe("Google OAuth callback [AUTH-OAUTH]", () => {
  test("provider-not-enabled maps to honest not-configured copy", async ({ page }) => {
    await page.goto(
      "/auth/callback?error=server_error&error_description=" +
        encodeURIComponent("Unsupported provider: provider is not enabled"),
      { waitUntil: "domcontentloaded" },
    );
    await expect(page).toHaveURL(/\/login/, { timeout: 15_000 });
    await expect(page.getByText(/not configured/i)).toBeVisible({ timeout: 15_000 });
    await expect(page.getByText(/provider is not enabled/i)).toHaveCount(0);
  });

  test("validation_failed maps to not-configured copy", async ({ page }) => {
    await page.goto(
      "/auth/callback?error=validation_failed&error_code=validation_failed",
      { waitUntil: "domcontentloaded" },
    );
    await expect(page).toHaveURL(/\/login/, { timeout: 15_000 });
    await expect(page.getByText(/not configured/i)).toBeVisible({ timeout: 15_000 });
    await expect(page.getByText(/validation_failed/i)).toHaveCount(0);
  });

  test("state mismatch maps to retry copy", async ({ page }) => {
    await page.goto(
      "/auth/callback?error=invalid_request&error_description=" +
        encodeURIComponent("OAuth state mismatch"),
      { waitUntil: "domcontentloaded" },
    );
    await expect(page).toHaveURL(/\/login/, { timeout: 15_000 });
    await expect(page.getByText(/session expired/i)).toBeVisible({ timeout: 15_000 });
  });
});

test.describe("Onboarding gate [ONBOARD-001]", () => {
  test("incomplete account cannot open protected app routes", async ({ page }) => {
    await loginAsTestUser(page, { onboarded: false, emailConfirmed: true });
    await expect(page).toHaveURL(/\/onboarding/, { timeout: 20_000 });

    await page.goto("/app/dashboard", { waitUntil: "domcontentloaded" });
    await expect(page).toHaveURL(/\/onboarding/, { timeout: 15_000 });
  });

  test("wizard Back/Next and browser Back retain step", async ({ page }) => {
    await loginAsTestUser(page, { onboarded: false, emailConfirmed: true });
    await expect(page).toHaveURL(/\/onboarding/);

    await page.getByRole("button", { name: /Software Engineer/i }).click();
    await page.getByRole("combobox").click();
    await page.getByRole("option", { name: /Mid-level/i }).click();
    const nameInput = page.locator('input[name="fullName"], input[placeholder*="name" i]').first();
    if (await nameInput.count()) {
      await nameInput.fill("Onboarding User");
    }

    const continueBtn = page.getByRole("button", { name: /Continue|Next/i }).first();
    if (await continueBtn.isEnabled()) {
      await continueBtn.click();
    }

    await page.getByRole("button", { name: /Back/i }).first().click();
    await expect(page.getByRole("button", { name: /Software Engineer/i })).toBeVisible({
      timeout: 10_000,
    });

    if (await continueBtn.isEnabled()) {
      await continueBtn.click();
    }
    await page.goBack();
    await expect(page.getByRole("button", { name: /Software Engineer/i })).toBeVisible({
      timeout: 10_000,
    });
  });
});

test.describe("Gov exam recovery browse", () => {
  test("mock-test stays reachable when account bootstrap is recovering", async ({ page }) => {
    await loginAsTestUser(page, { planId: "pro" });
    await page.goto("/app/mock-test", { waitUntil: "domcontentloaded" });
    await expect(page).not.toHaveURL(/\/login/, { timeout: 15_000 });
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible({ timeout: 20_000 });
  });
});
