/**
 * Regression tests for previously fixed bugs (see git history).
 * Ref: T-0902 — Previously fixed bugs do not reappear
 *
 * Commits referenced:
 * - 6b937eb fix(auth): production-ready Auth module
 * - 7b29c01 Fix overlay compliance, mock interview, live copilot E2E
 * - 0cbc1d4 fix: production hardening (loading states)
 * - d417b82 fix(M7/M8/M9): Stealth Overlay, Audio & Live Co-Pilot fixes
 */
import {
  test,
  expect,
  setupSupabaseMocks,
  fillSignupForm,
  fillLoginForm,
  dismissCookieBanner,
} from "../playwright-fixture";

test.describe("Auth regressions [6b937eb, T-0688]", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/");
    await page.evaluate(() => {
      localStorage.removeItem("clarify_login_lock");
      localStorage.removeItem("clarify_login_attempts");
    });
  });

  test("signup submit stays disabled until terms accepted", async ({ page }) => {
    await setupSupabaseMocks(page);
    await page.goto("/signup", { waitUntil: "domcontentloaded" });
    await dismissCookieBanner(page);

    await fillSignupForm(page, {
      fullName: "Terms Test",
      email: "terms.test@example.com",
      password: "TestPass1!",
      acceptTerms: false,
    });

    await expect(
      page.getByRole("button", { name: "Create account" })
    ).toBeDisabled();
  });

  test("login lockout after five failed attempts", async ({ page }) => {
    await setupSupabaseMocks(page);
    await page.goto("/login", { waitUntil: "domcontentloaded" });
    await dismissCookieBanner(page);

    for (let attempt = 0; attempt < 4; attempt += 1) {
      await fillLoginForm(page, "bad@example.com", "wrong-password");
      await page.getByRole("button", { name: "Sign in" }).click();
      await expect(page.getByText(/Invalid login credentials/i)).toBeVisible({
        timeout: 10_000,
      });
    }

    await fillLoginForm(page, "bad@example.com", "wrong-password");
    await page.getByRole("button", { name: "Sign in" }).click();
    await expect(page.getByText(/Too many failed attempts/i)).toBeVisible({
      timeout: 10_000,
    });

    await expect(
      page.getByRole("button", { name: /Locked/i })
    ).toBeDisabled({ timeout: 10_000 });
  });
});

test.describe("Overlay & route guard regressions [7b29c01]", () => {
  test("live overlay redirects unauthenticated users to login", async ({
    page,
  }) => {
    await page.goto("/app/live/overlay", { waitUntil: "domcontentloaded" });
    await expect(page).toHaveURL(/\/login/, { timeout: 15_000 });
  });
});

test.describe("Documents regressions [3ff63de]", () => {
  test("resume upload zone lists DOC and TXT support", async ({ page }) => {
    await setupSupabaseMocks(page);
    await page.goto("/login");
    await dismissCookieBanner(page);
    await fillLoginForm(page, "e2e.test@example.com", "TestPass1!");
    await page.getByRole("button", { name: "Sign in" }).click();
    await page.waitForURL(/\/app\/dashboard/, { timeout: 20_000 });

    await page.goto("/app/documents", { waitUntil: "domcontentloaded" });
    await expect(page.getByText(/PDF, DOCX, DOC or TXT/i)).toBeVisible({
      timeout: 15_000,
    });
  });
});

test.describe("Protected route hydration [0cbc1d4, Issue 14]", () => {
  test("unauthenticated /app access never shows dashboard heading", async ({
    page,
  }) => {
    await page.goto("/app/dashboard", { waitUntil: "domcontentloaded" });
    await expect(page).toHaveURL(/\/login/, { timeout: 15_000 });
    await expect(page.getByRole("heading", { name: "Welcome back" })).toBeVisible();
  });
});
