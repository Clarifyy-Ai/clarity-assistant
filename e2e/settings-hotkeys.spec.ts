/**
 * TC-SET-006: Answer Bank hotkey bind → fire → persist across refresh.
 */
import { test, expect, loginAsTestUser, expectDashboardReady } from "../playwright-fixture";

const HOTKEY_STORAGE_KEY = "clarify_custom_hotkeys";

test.describe("Settings hotkeys TC-SET-006", () => {
  test("default Ctrl+Alt+A opens Answer Bank", async ({ page }) => {
    await loginAsTestUser(page);
    await expectDashboardReady(page);

    await page.goto("/app/dashboard", { waitUntil: "domcontentloaded" });
    await page.locator("body").click();
    await page.keyboard.press("Control+Alt+A");
    await expect(page).toHaveURL(/\/app\/answers/, { timeout: 15_000 });
  });

  test("custom Open answer bank binding persists and fires after refresh", async ({ page }) => {
    await loginAsTestUser(page);
    await expectDashboardReady(page);

    // Seed a non-default binding (avoids relying on capture UI flakiness).
    await page.goto("/app/settings/hotkeys", { waitUntil: "domcontentloaded" });
    await expect(page.getByRole("heading", { name: /Keyboard shortcuts/i })).toBeVisible({
      timeout: 15_000,
    });
    await page.evaluate(
      ([key, value]) => {
        localStorage.setItem(key, JSON.stringify(value));
        window.dispatchEvent(new CustomEvent("clarify:hotkeys-changed", { detail: value }));
      },
      [HOTKEY_STORAGE_KEY, { GO_ANSWERS: "Ctrl+Alt+B" }] as const,
    );
    await page.reload({ waitUntil: "domcontentloaded" });
    await expect(page.getByText("Ctrl+Alt+B")).toBeVisible({ timeout: 15_000 });
    await expect(page.getByText("Custom").first()).toBeVisible();

    await page.locator("body").click();
    await page.keyboard.press("Control+Alt+B");
    await expect(page).toHaveURL(/\/app\/answers/, { timeout: 15_000 });
  });
});
