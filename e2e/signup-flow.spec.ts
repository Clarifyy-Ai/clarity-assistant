/**
 * Signup → onboarding → mock → debrief → upgrade (critical path)
 *
 * Auth-heavy steps use Playwright route mocks (see e2e/helpers/supabase-mock.ts).
 *
 * Run locally (Windows-friendly):
 *   1. Copy .env.example to .env.local and set VITE_* values
 *   2. npx playwright install chromium
 *   3. npm run test:e2e
 *   4. Optional UI mode: npx playwright test --ui
 */
import {
  test,
  expect,
  setupSupabaseMocks,
  fillSignupForm,
  fillLoginForm,
  dismissCookieBanner,
} from "../playwright-fixture";

test.describe("Signup page (public)", () => {
  test("signup page loads", async ({ page }) => {
    await page.goto("/signup", { waitUntil: "domcontentloaded" });
    await expect(page).toHaveTitle(/Create account/i, { timeout: 15_000 });
  });
});

test.describe("Signup → email verification [T-0893]", () => {
  test("creates account and shows check-your-email confirmation", async ({
    page,
  }) => {
    await setupSupabaseMocks(page);
    const uniqueEmail = `e2e.signup.${Date.now()}@example.com`;

    await page.goto("/signup", { waitUntil: "domcontentloaded" });
    await dismissCookieBanner(page);
    await fillSignupForm(page, {
      fullName: "Signup E2E User",
      email: uniqueEmail,
      password: "TestPass1!",
    });

    await page.getByRole("button", { name: "Create account" }).click();

    await expect(page.getByRole("heading", { name: "Check your email" })).toBeVisible({
      timeout: 15_000,
    });
    await expect(page.getByText(uniqueEmail)).toBeVisible();
  });

  test("shows error when email is already registered [T-0569]", async ({
    page,
  }) => {
    const registered = new Set<string>(["existing@example.com"]);
    await setupSupabaseMocks(page, { registeredEmails: registered });

    await page.goto("/signup", { waitUntil: "domcontentloaded" });
    await dismissCookieBanner(page);
    await fillSignupForm(page, {
      fullName: "Duplicate User",
      email: "existing@example.com",
      password: "TestPass1!",
    });

    await page.getByRole("button", { name: "Create account" }).click();

    await expect(page.getByRole("alert")).toContainText(/already registered/i, {
      timeout: 15_000,
    });
  });
});

test.describe.skip("Onboarding wizard (requires authenticated session)", () => {
  test("completes onboarding steps after signup", async ({ page }) => {
    // TODO: seed session via storageState after email verification mock
    await page.goto("/onboarding");
  });
});

test.describe.skip("Mock interview session (requires onboarded user)", () => {
  test("starts mock session from dashboard", async ({ page }) => {
    // TODO: mock credits check + AI endpoints for full session start
    await page.goto("/app/mock");
  });
});

test.describe.skip("Debrief review (requires completed mock session)", () => {
  test("opens debrief list and detail", async ({ page }) => {
    await page.goto("/app/debrief");
  });
});

test.describe.skip("Upgrade flow (requires free-plan user)", () => {
  test("opens upgrade modal from plan gate", async ({ page }) => {
    await page.goto("/app/settings/billing");
  });
});
