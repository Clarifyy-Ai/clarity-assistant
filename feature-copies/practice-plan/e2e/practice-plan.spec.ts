import {
  test,
  expect,
  setupSupabaseMocks,
  fillLoginForm,
  E2E_TEST_USER,
  expectDashboardReady,
  clearBrowserAuthState,
  loginAsTestUser,
} from "../playwright-fixture";

test.describe("Practice plan persistence [T-11]", () => {
  test.beforeEach(async ({ page }) => {
    await setupSupabaseMocks(page);
    await clearBrowserAuthState(page);
  });

  test("toggle completion persists after refresh", async ({ page }) => {
    await loginAsTestUser(page);
    await expectDashboardReady(page);

    await page.goto("/app/plan", { waitUntil: "domcontentloaded" });
    await expect(page.getByRole("heading", { name: /practice plan/i })).toBeVisible({
      timeout: 20_000,
    });

    const markComplete = page.getByRole("button", { name: "Mark complete" }).first();
    await expect(markComplete).toBeVisible({ timeout: 20_000 });
    await markComplete.click();
    await expect(page.getByText("Saved").first()).toBeVisible({ timeout: 10_000 });

    await page.reload({ waitUntil: "domcontentloaded" });
    await expect(page.getByRole("button", { name: "Mark incomplete" }).first()).toBeVisible({
      timeout: 20_000,
    });
  });

  test("STAR builder back returns to practice plan", async ({ page }) => {
    await loginAsTestUser(page);
    await expectDashboardReady(page);

    await page.goto("/app/plan", { waitUntil: "domcontentloaded" });
    await expect(page.getByRole("heading", { name: /practice plan/i })).toBeVisible({
      timeout: 20_000,
    });

    const openLinks = page.locator('a:has-text("Open")');
    const count = await openLinks.count();
    let clicked = false;
    for (let i = 0; i < count; i += 1) {
      const href = await openLinks.nth(i).getAttribute("href");
      if (href?.includes("star-builder")) {
        await openLinks.nth(i).click();
        clicked = true;
        break;
      }
    }
    if (!clicked) {
      await page.goto("/app/prep/star-builder?returnTo=%2Fapp%2Fplan", {
        waitUntil: "domcontentloaded",
      });
    }

    await expect(page.getByRole("heading", { name: /STAR Builder/i })).toBeVisible({
      timeout: 20_000,
    });
    await page.getByRole("button", { name: /Back to practice plan/i }).click();
    await expect(page).toHaveURL(/\/app\/plan/);
    await expect(page.getByRole("heading", { name: /practice plan/i })).toBeVisible();
  });

  test("AI polish 502 shows retry and keeps draft", async ({ page }) => {
    await page.route("**/functions/v1/prep-tool**", async (route) => {
      if (route.request().method() === "OPTIONS") {
        return route.fulfill({ status: 204, body: "" });
      }
      const origin = route.request().headers()["origin"] ?? "http://127.0.0.1:5000";
      return route.fulfill({
        status: 502,
        contentType: "application/json",
        headers: {
          "access-control-allow-origin": origin,
          "access-control-allow-credentials": "true",
        },
        body: JSON.stringify({
          error: "AI generation failed. Credits refunded.",
          code: "AI_PROVIDER_UNAVAILABLE",
        }),
      });
    });

    await fillLoginForm(page, E2E_TEST_USER.email, E2E_TEST_USER.password);
    await page.getByRole("button", { name: /sign in/i }).click();
    await expectDashboardReady(page);

    await page.goto("/app/prep/star-builder?returnTo=%2Fapp%2Fplan", {
      waitUntil: "domcontentloaded",
    });

    const situation = page.locator("textarea").first();
    await situation.fill("I led a migration at Acme.");
    await page.getByRole("button", { name: /AI Polish/i }).click();
    await expect(page.getByText(/temporarily unavailable/i)).toBeVisible({
      timeout: 15_000,
    });
    await expect(situation).toHaveValue(/migration at Acme/);
  });
});
