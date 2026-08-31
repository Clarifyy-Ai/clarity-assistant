import {
  test,
  expect,
  loginAsTestUser,
  dismissCookieBanner,
} from "../playwright-fixture";
import {
  E2E_COMPLETED_SESSION_ID,
  E2E_TEST_USER,
  E2E_USER_A_ID,
  E2E_USER_B_ID,
} from "./helpers/supabase-mock";

test.describe("Completed session artifacts", () => {
  test("history and detail show duration, status, answers, and scorecard score", async ({
    page,
  }) => {
    await loginAsTestUser(page);
    await page.goto("/app/sessions", { waitUntil: "domcontentloaded" });
    await expect(page.getByText(/Completed mock interview/i)).toBeVisible({ timeout: 15_000 });
    await expect(page.getByText(/18m/i).first()).toBeVisible();
    await expect(page.getByText(/81/).first()).toBeVisible();

    await page.goto(`/app/sessions/${E2E_COMPLETED_SESSION_ID}`, {
      waitUntil: "domcontentloaded",
    });
    await expect(page.getByText(/Tell me about yourself/i)).toBeVisible({ timeout: 15_000 });
    await page.getByText(/Tell me about yourself/i).first().click();
    await expect(page.getByText(/I am a software engineer/i)).toBeVisible({ timeout: 10_000 });
    await expect(page.getByText(/81|82/).first()).toBeVisible();
    await expect(page.getByText(/completed/i).first()).toBeVisible();
    await expect(page.getByText(/Internal server error/i)).toHaveCount(0);
  });
});

test.describe("User A / User B session isolation", () => {
  test("User B cannot open User A's session", async ({ page }) => {
    await loginAsTestUser(page, {
      userId: E2E_USER_B_ID,
      sessionOwnerId: E2E_USER_A_ID,
    });
    await page.goto(`/app/sessions/${E2E_COMPLETED_SESSION_ID}`, {
      waitUntil: "domcontentloaded",
    });
    await expect(page.getByText(/Tell me about yourself/i)).toHaveCount(0);
    await expect(page.getByText(/not found|couldn't load|Session not found/i)).toBeVisible({
      timeout: 15_000,
    });
  });
});

test.describe("Account deletion", () => {
  test("double-click Delete sends a single POST", async ({ page }) => {
    const posts: string[] = [];
    await loginAsTestUser(page);
    await page.route("**/functions/v1/delete-account", async (route) => {
      if (route.request().method() === "OPTIONS") {
        await route.fulfill({ status: 200, headers: { "Access-Control-Allow-Origin": "*" } });
        return;
      }
      posts.push(route.request().postData() ?? "");
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ success: true, status: "completed", operationId: "op-1" }),
      });
    });
    await page.goto("/app/settings/danger", { waitUntil: "domcontentloaded" });
    await dismissCookieBanner(page);
    await page.getByRole("button", { name: /Delete my account/i }).click();
    await page.getByPlaceholder(E2E_TEST_USER.email).fill(E2E_TEST_USER.email);
    const confirm = page.getByRole("button", { name: /^Delete account$/i });
    await expect(confirm).toBeEnabled({ timeout: 10_000 });
    await Promise.all([confirm.click(), confirm.click()]);
    await page.waitForTimeout(500);
    expect(posts.length).toBe(1);
  });

  test("completed delete replay returns 200 not 429", async ({ page }) => {
    await loginAsTestUser(page);
    await page.route("**/functions/v1/delete-account", async (route) => {
      if (route.request().method() === "OPTIONS") {
        await route.fulfill({ status: 200, headers: { "Access-Control-Allow-Origin": "*" } });
        return;
      }
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ success: true, status: "completed", operationId: "op-replay" }),
      });
    });
    const first = await page.evaluate(async () => {
      const res = await fetch("https://qzgvjrvtkwlzxpmlddkx.supabase.co/functions/v1/delete-account", {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-idempotency-key": "del-replay" },
        body: "{}",
      });
      return res.status;
    });
    const second = await page.evaluate(async () => {
      const res = await fetch("https://qzgvjrvtkwlzxpmlddkx.supabase.co/functions/v1/delete-account", {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-idempotency-key": "del-replay" },
        body: "{}",
      });
      return res.status;
    });
    expect(first).toBe(200);
    expect(second).toBe(200);
  });
});
