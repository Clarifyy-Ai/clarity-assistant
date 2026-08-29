import { test, expect, loginAsTestUser, dismissCookieBanner, dismissWalkthrough } from "../playwright-fixture";
import type { Page } from "@playwright/test";

async function openCompareTab(page: Page): Promise<void> {
  await loginAsTestUser(page);
  await page.goto("/app/analytics", { waitUntil: "domcontentloaded" });
  await dismissCookieBanner(page);
  await dismissWalkthrough(page);
  await expect(page.getByRole("heading", { name: /Skills Analytics|Reports/i })).toBeVisible({
    timeout: 20_000,
  });
  await page.getByRole("tab", { name: "Compare" }).click();
}

test.describe("Reports / Compare sessions", () => {
  test("compares two completed scored sessions without a 400", async ({ page }) => {
    const consoleErrors: string[] = [];
    page.on("console", (msg) => {
      if (msg.type() === "error") consoleErrors.push(msg.text());
    });
    const badStatuses: number[] = [];
    page.on("response", (response) => {
      if (response.url().includes("compare-sessions") || response.url().includes("session_questions")) {
        badStatuses.push(response.status());
      }
    });

    await openCompareTab(page);
    await expect(page.getByRole("heading", { name: "Compare sessions" })).toBeVisible();

    const compare = page.getByRole("button", { name: "Compare" });
    await expect(compare).toBeEnabled();
    await compare.click();

    await expect(page.getByText("Baseline", { exact: true })).toBeVisible();
    await expect(page.getByText("Comparison", { exact: true })).toBeVisible();
    await expect(page.getByText("Acme", { exact: true }).first()).toBeVisible();
    await expect(page.getByText("Globex", { exact: true }).first()).toBeVisible();
    await expect(page.getByText("Delta summary")).toBeVisible();
    await expect(page.getByText("Overall score").first()).toBeVisible();
    expect(badStatuses.every((status) => status < 400)).toBe(true);
    expect(consoleErrors.join("\n")).not.toMatch(/PGRST200|session_questions/i);
  });

  test("keeps Compare disabled when the same session is selected twice", async ({ page }) => {
    await openCompareTab(page);

    const sessionA = page.getByTestId("compare-session-a");
    const sessionB = page.getByTestId("compare-session-b");
    await sessionA.click();
    await page.getByRole("option", { name: /Acme/i }).first().click();
    await sessionB.click();
    await page.getByRole("option", { name: /Acme/i }).first().click();
    await expect(page.getByRole("button", { name: "Compare" })).toBeDisabled();
    await expect(page.getByText(/two different sessions/i)).toBeVisible();
  });

  test("only lists comparable sessions in Session A/B pickers", async ({ page }) => {
    await openCompareTab(page);

    await page.getByTestId("compare-session-a").click();
    await expect(page.getByRole("option", { name: /Acme|Globex/i }).first()).toBeVisible();
    await expect(page.locator('[role="option"][data-disabled]')).toHaveCount(0);
    // Unscored session must not appear as a selectable option
    await expect(page.getByRole("option", { name: /e2e-unscored/i })).toHaveCount(0);
  });

  test("User A cannot load User B session IDs", async ({ page }) => {
    await loginAsTestUser(page);
    const result = await page.evaluate(async () => {
      const res = await fetch(
        "https://qzgvjrvtkwlzxpmlddkx.supabase.co/functions/v1/compare-sessions",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            session_a_id: "11111111-1111-4111-8111-111111111111",
            session_b_id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
          }),
        },
      );
      return { status: res.status, body: await res.json() };
    });
    expect(result.status).toBe(404);
    expect(result.body.code).toBe("SESSION_NOT_FOUND");
    expect(JSON.stringify(result.body)).not.toMatch(/PGRST|session_questions|User B/i);
  });

  test("missing optional metrics stay unavailable instead of zero", async ({ page }) => {
    await loginAsTestUser(page);
    await page.route("**/functions/v1/compare-sessions", async (route) => {
      const body = {
        source_version: "compare-sessions.v1",
        baseline_rule: "older_session",
        timezone: "Asia/Kolkata",
        baseline: {
          session_id: "11111111-1111-4111-8111-111111111111",
          role: "baseline",
          title: "Mock — Acme",
          session_type: "mock",
          company: "Acme",
          status: "completed",
          completion_state: "completed",
          score_state: "scored",
          started_at: "2026-08-20T10:00:00.000Z",
          ended_at: null,
          created_at: "2026-08-20T10:00:00.000Z",
          display_datetime: "Aug 20, 2026, 3:30 PM",
          duration_seconds: null,
          duration_minutes: null,
          question_count: 4,
          answered_count: 4,
          unanswered_count: 0,
          overall_score: 70,
          dimensions: {
            communication: 72,
            technical: null,
            problem_solving: 71,
            confidence: null,
          },
          speech: { filler_rate: null, wpm_avg: null },
        },
        comparison: {
          session_id: "22222222-2222-4222-8222-222222222222",
          role: "comparison",
          title: "Rehearsal — Globex",
          session_type: "rehearsal",
          company: "Globex",
          status: "completed",
          completion_state: "completed",
          score_state: "scored",
          started_at: "2026-08-22T15:00:00.000Z",
          ended_at: "2026-08-22T15:25:00.000Z",
          created_at: "2026-08-22T15:00:00.000Z",
          display_datetime: "Aug 22, 2026, 8:30 PM",
          duration_seconds: 1500,
          duration_minutes: 25,
          question_count: 5,
          answered_count: 5,
          unanswered_count: 0,
          overall_score: 82,
          dimensions: {
            communication: 80,
            technical: null,
            problem_solving: 78,
            confidence: null,
          },
          speech: { filler_rate: null, wpm_avg: 130 },
        },
        deltas: {
          overall_score: 12,
          communication: 8,
          technical: null,
          problem_solving: 7,
          confidence: null,
          filler_rate: null,
          wpm_avg: null,
          duration_seconds: null,
          question_count: 1,
          answered_count: 1,
        },
        improvement_areas: ["Overall score"],
        regression_areas: [],
      };
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(body),
      });
    });

    await page.goto("/app/analytics", { waitUntil: "domcontentloaded" });
    await dismissCookieBanner(page);
    await dismissWalkthrough(page);
    await page.getByRole("tab", { name: "Compare" }).click();
    await page.getByRole("button", { name: "Compare" }).click();
    await expect(page.getByText("Delta summary")).toBeVisible();
    await expect(page.getByText("Fillers/min").first()).toBeVisible();
    const emDashes = page.getByText("—");
    await expect(emDashes.first()).toBeVisible();
    await expect(page.locator("body")).not.toContainText("PGRST");
  });

  test("session dates use the profile timezone", async ({ page }) => {
    await openCompareTab(page);
    // Radix Select trigger shows the formatted label (Asia/Kolkata for profile).
    const trigger = page.getByTestId("compare-session-a");
    await expect(trigger).toBeVisible({ timeout: 20_000 });
    await expect(trigger).toContainText(/Aug 20, 2026/);
    await expect(trigger).toContainText(/3:30\s*PM/i);
  });
});
