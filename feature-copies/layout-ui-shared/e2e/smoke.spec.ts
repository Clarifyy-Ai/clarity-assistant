import { test, expect, loginAsTestUser } from "../playwright-fixture";

test.describe("Marketing & auth smoke", () => {
  test("landing page loads", async ({ page }) => {
    await page.goto("/", { waitUntil: "domcontentloaded" });
    await expect(page).toHaveTitle(/Clarify AI/i);
    await expect(page.getByRole("heading", { level: 1 })).toContainText(
      /Practice every interview/i,
      { timeout: 15_000 }
    );
  });

  test("pricing page loads", async ({ page }) => {
    await page.goto("/pricing", { waitUntil: "domcontentloaded" });
    await expect(page).toHaveTitle(/Pricing/i, { timeout: 15_000 });
    await expect(
      page.getByRole("heading", { name: /Simple, transparent pricing/i })
    ).toBeVisible({ timeout: 15_000 });
  });

  test("login page loads", async ({ page }) => {
    await page.goto("/login", { waitUntil: "domcontentloaded" });
    await expect(page).toHaveTitle(/Sign in/i, { timeout: 15_000 });
    await expect(
      page.getByRole("heading", { name: "Welcome back" })
    ).toBeVisible();
    await expect(page.getByRole("button", { name: "Sign in" })).toBeVisible();
  });

  test("signup page loads", async ({ page }) => {
    await page.goto("/signup", { waitUntil: "domcontentloaded" });
    await expect(page).toHaveTitle(/Create account/i, { timeout: 15_000 });
    await expect(
      page.getByRole("heading", { name: "Create your account" })
    ).toBeVisible();
  });

  test("help page loads", async ({ page }) => {
    await page.goto("/help", { waitUntil: "domcontentloaded" });
    await expect(page).toHaveTitle(/Help Center/i, { timeout: 15_000 });
  });
});

test.describe("Critical path — authenticated smoke [T-0896, T-0900]", () => {
  test("mock interview config page loads for signed-in user", async ({
    page,
  }) => {
    await loginAsTestUser(page);
    await page.goto("/app/mock", { waitUntil: "domcontentloaded" });
    await expect(page).toHaveURL(/\/app\/mock/, { timeout: 15_000 });
    // Old type picker shows "Behavioural"; wizard keeps PageHeader "Mock Interview"
    // plus step "Session Type". Match either so the smoke stays green across the rewrite.
    await expect(
      page
        .getByRole("heading", { name: /mock interview/i })
        .or(page.getByText(/^Session Type$/i))
        .or(page.getByText(/configure/i))
        .or(page.getByText("Behavioural")),
    ).toBeVisible({ timeout: 15_000 });
  });

  test("analytics page loads for signed-in user", async ({ page }) => {
    await loginAsTestUser(page);
    await page.goto("/app/analytics", { waitUntil: "domcontentloaded" });
    await expect(page.getByRole("heading", { name: /Analytics/i })).toBeVisible({
      timeout: 20_000,
    });
  });
});

test.describe("Critical path — route guards", () => {
  test("dashboard redirects unauthenticated users to login", async ({
    page,
  }) => {
    await page.goto("/app/dashboard", { waitUntil: "domcontentloaded" });
    await expect(page).toHaveURL(/\/login/, { timeout: 15_000 });
  });

  test("documents redirects unauthenticated users to login", async ({
    page,
  }) => {
    await page.goto("/app/documents", { waitUntil: "domcontentloaded" });
    await expect(page).toHaveURL(/\/login/, { timeout: 15_000 });
  });
});
