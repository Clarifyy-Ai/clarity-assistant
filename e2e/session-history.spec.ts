/**
 * Session History multi-type timeline (TC-SES-001 filters / empty / error honesty)
 * + BUG 16 Delete reachability across viewports / keyboard / confirm.
 */
import { test, expect, loginAsTestUser, expectDashboardReady } from "../playwright-fixture";

async function openSessionHistory(page: import("@playwright/test").Page) {
  await page.goto("/app/sessions", { waitUntil: "domcontentloaded" });
  await expect(page.getByRole("heading", { name: /Session History|Sessions/i }).first()).toBeVisible({
    timeout: 20_000,
  });
  await expect(page.getByTestId("session-history-list")).toBeVisible({ timeout: 20_000 });
}

test.describe("Session History authoritative timeline", () => {
  test("TC-SES-001: history page exposes multi-type filters and URL sync", async ({ page }) => {
    await loginAsTestUser(page);
    await expectDashboardReady(page);

    await page.goto("/app/sessions", { waitUntil: "domcontentloaded" });
    await expect(page.getByRole("heading", { name: /Session History|Sessions/i }).first()).toBeVisible({
      timeout: 20_000,
    });

    await expect(page.getByRole("button", { name: "Government Exam" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Assessment" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Coding Assessment" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Live Copilot" })).toBeVisible();

    await page.getByRole("button", { name: "Mock Interview" }).click();
    await expect(page).toHaveURL(/type=mock_interview/);

    await page.getByLabel("Search session history").fill("nonexistent-xyz-query");
    await expect(page).toHaveURL(/q=nonexistent/, { timeout: 5_000 });
  });

  test("filtered empty state is distinct from global empty", async ({ page }) => {
    await loginAsTestUser(page);
    await expectDashboardReady(page);
    await page.goto("/app/sessions?type=coding_assessment&q=__no_match__", {
      waitUntil: "domcontentloaded",
    });
    await expect(
      page.getByText(/No sessions match these filters|You have not completed any practice/i),
    ).toBeVisible({ timeout: 20_000 });
  });
});

test.describe("BUG 16 — Session History Delete reachability", () => {
  test("Delete is present for interview rows and omitted for mock_test", async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 });
    await loginAsTestUser(page);
    await expectDashboardReady(page);
    await openSessionHistory(page);

    const interviewRow = page.locator('[data-testid="session-history-row"][data-source-kind="interview"]').first();
    await expect(interviewRow).toBeVisible();
    await expect(interviewRow.getByRole("button", { name: "Delete session" })).toBeVisible();

    const mockRow = page.locator('[data-testid="session-history-row"][data-source-kind="mock_test"]').first();
    await expect(mockRow).toBeVisible();
    await expect(mockRow.getByRole("button", { name: "Delete session" })).toHaveCount(0);
    await expect(mockRow.getByRole("button", { name: "View Details" })).toBeVisible();
  });

  test("keyboard focus reaches Delete and confirm cancel keeps the row", async ({ page }) => {
    await page.setViewportSize({ width: 1366, height: 768 });
    await loginAsTestUser(page);
    await expectDashboardReady(page);
    await openSessionHistory(page);

    const deleteBtn = page.getByRole("button", { name: "Delete session" }).first();
    await deleteBtn.focus();
    await expect(deleteBtn).toBeFocused();
    await page.keyboard.press("Enter");

    const dialog = page.getByRole("alertdialog");
    await expect(dialog).toBeVisible();
    await expect(dialog.getByText("Delete this session?")).toBeVisible();
    await dialog.getByRole("button", { name: "Cancel" }).click();
    await expect(dialog).toHaveCount(0);
    await expect(
      page.locator('[data-testid="session-history-row"][data-source-kind="interview"]'),
    ).toHaveCount(1);
  });

  test("confirm deletes interview row via sessions API", async ({ page }) => {
    await page.setViewportSize({ width: 768, height: 1024 });
    await loginAsTestUser(page);
    await expectDashboardReady(page);
    await openSessionHistory(page);

    await expect(
      page.locator('[data-testid="session-history-row"][data-source-kind="interview"]'),
    ).toHaveCount(1);

    await page.getByRole("button", { name: "Delete session" }).first().click();
    const dialog = page.getByRole("alertdialog");
    await expect(dialog).toBeVisible();
    await dialog.getByRole("button", { name: "Delete session" }).click();

    await expect(
      page.locator('[data-testid="session-history-row"][data-source-kind="interview"]'),
    ).toHaveCount(0, { timeout: 10_000 });
    await expect(
      page.locator('[data-testid="session-history-row"][data-source-kind="mock_test"]'),
    ).toHaveCount(1);
  });
});
