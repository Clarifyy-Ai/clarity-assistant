import { test, expect } from "../playwright-fixture";

test.describe("Live + mock session (public gate)", () => {
  test("live setup redirects unauthenticated users to login", async ({ page }) => {
    await page.goto("/app/live", { waitUntil: "domcontentloaded" });
    await expect(page).toHaveURL(/\/login/, { timeout: 15_000 });
    await expect(
      page.getByRole("heading", { name: "Welcome back" }),
    ).toBeVisible();
  });

  test("live overlay redirects unauthenticated users to login", async ({ page }) => {
    await page.goto("/app/live/overlay", { waitUntil: "domcontentloaded" });
    await expect(page).toHaveURL(/\/login/, { timeout: 15_000 });
    await expect(
      page.getByRole("heading", { name: "Welcome back" }),
    ).toBeVisible();
  });

  test("mock interview redirects unauthenticated users to login", async ({ page }) => {
    await page.goto("/app/mock", { waitUntil: "domcontentloaded" });
    await expect(page).toHaveURL(/\/login/, { timeout: 15_000 });
    await expect(
      page.getByRole("heading", { name: "Welcome back" }),
    ).toBeVisible();
  });

  test("mock session redirects unauthenticated users to login", async ({ page }) => {
    await page.goto("/app/mock/session/fake-id", { waitUntil: "domcontentloaded" });
    await expect(page).toHaveURL(/\/login/, { timeout: 15_000 });
    await expect(
      page.getByRole("heading", { name: "Welcome back" }),
    ).toBeVisible();
  });
});
