import { test, expect, dismissCookieBanner, setupSupabaseMocks } from "../playwright-fixture";

test.describe("Public keyboard shortcuts page", () => {
  test.beforeEach(async ({ page }) => {
    await setupSupabaseMocks(page);
  });

  test("/shortcuts includes Audio Controls from the same catalog as settings", async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 720 });
    await page.goto("/shortcuts", { waitUntil: "domcontentloaded" });
    await dismissCookieBanner(page);

    await expect(page.getByRole("heading", { name: /Keyboard Shortcuts/i, level: 1 })).toBeVisible({
      timeout: 15_000,
    });

    await expect(page.getByRole("heading", { name: "Audio Controls", level: 2 })).toBeVisible();
    await expect(page.getByText("Mute / unmute microphone")).toBeVisible();
    await expect(page.getByText("Toggle system audio capture")).toBeVisible();

    const audioCard = page
      .getByRole("heading", { name: "Audio Controls", level: 2 })
      .locator("xpath=following-sibling::div[1]");
    await expect(audioCard.getByText("M", { exact: true })).toBeVisible();
    await expect(audioCard.getByText("L", { exact: true })).toBeVisible();
  });
});
