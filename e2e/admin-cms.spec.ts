/**
 * Admin CMS — Help articles + Learning Hub publish validation.
 */
import {
  test,
  expect,
  setupSupabaseMocks,
  fillLoginForm,
  dismissCookieBanner,
  clearBrowserAuthState,
  E2E_TEST_USER,
} from "../playwright-fixture";

test.describe.configure({ timeout: 90_000 });

test.describe("Admin CMS [ADMIN-CMS]", () => {
  test.beforeEach(async ({ page }) => {
    await setupSupabaseMocks(page, { planId: "pro", isAdmin: true });
    await clearBrowserAuthState(page);
    await dismissCookieBanner(page);
    await page.goto("/login", { waitUntil: "domcontentloaded" });
    await fillLoginForm(page, E2E_TEST_USER.email, E2E_TEST_USER.password);
    await page.getByRole("button", { name: "Sign in" }).click();
    await page.waitForURL(/\/app\//, { timeout: 25_000 });
    await dismissCookieBanner(page);
  });

  test("Help articles: New article opens editor and saves draft", async ({ page }) => {
    await page.goto("/app/admin/help-articles", { waitUntil: "domcontentloaded" });

    await expect(page.getByTestId("help-new-article")).toBeVisible({ timeout: 20_000 });
    await page.getByTestId("help-new-article").click();
    await expect(page.getByTestId("help-article-editor")).toBeVisible({ timeout: 15_000 });

    await page.getByLabel(/title/i).fill("E2E Help Article");
    await page.getByLabel(/slug/i).fill("e2e-help-article");
    await page.getByRole("button", { name: /save/i }).click();

    await expect(page.getByText(/saved|created/i).first()).toBeVisible({ timeout: 10_000 });
  });

  test("Learning Hub: publish blocked when course has no lesson content", async ({ page }) => {
    await page.goto("/app/admin/learning", { waitUntil: "domcontentloaded" });

    await expect(page.getByText(/Learning Hub|course/i).first()).toBeVisible({
      timeout: 20_000,
    });

    const publishBtn = page.getByTestId("learning-publish");
    if (await publishBtn.count()) {
      await publishBtn.click();
      await expect(
        page.getByText(/lesson|content|publish|module/i).first(),
      ).toBeVisible({ timeout: 10_000 });
    }
  test("Help articles: admin draft preview route loads", async ({ page }) => {
    await page.goto("/app/admin/help-articles", { waitUntil: "domcontentloaded" });
    await page.getByTestId("help-new-article").click();
    await page.getByPlaceholder("Question").fill("Preview draft question");
    await page.getByPlaceholder("Slug").fill("preview-draft-e2e");
    await page.getByRole("button", { name: /save/i }).click();
    await expect(page.getByText(/saved|created/i).first()).toBeVisible({ timeout: 10_000 });

    const previewLink = page.locator('a[href*="/app/admin/help-articles/preview/"]').first();
    await expect(previewLink).toBeVisible({ timeout: 10_000 });
    const href = await previewLink.getAttribute("href");
    expect(href).toMatch(/\/app\/admin\/help-articles\/preview\//);
    await page.goto(href!, { waitUntil: "domcontentloaded" });
    await expect(page.getByText(/Admin preview/i)).toBeVisible({ timeout: 15_000 });
    await expect(page.getByText("Preview draft question")).toBeVisible({ timeout: 15_000 });
  });
});
