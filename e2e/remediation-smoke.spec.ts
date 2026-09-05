import { test, expect } from "../playwright-fixture";

test.describe("Mock interview turn-taking (contract)", () => {
  test("Mock session page exposes native conversation panel", async ({ page }) => {
    await page.goto("/app/mock", { waitUntil: "domcontentloaded" });
    await expect(page.getByText(/Mock Interview|Start mock/i).first()).toBeVisible({
      timeout: 15_000,
    });
  });
});

test.describe("Practice Coach AI Help (contract)", () => {
  test("Interview Day checklist test ids exist on interview-day route", async ({ page }) => {
    await page.goto("/app/interview-day", { waitUntil: "domcontentloaded" });
    await expect(page.getByTestId("interview-day-checklist")).toBeVisible({
      timeout: 15_000,
    });
  });
});
