import {
  test,
  expect,
  setupSupabaseMocks,
  dismissCookieBanner,
} from "../playwright-fixture";
import {
  E2E_VALID_SHARE_TOKEN,
  E2E_SHARED_DEBRIEF,
  E2E_SHARED_SCORECARD,
} from "./helpers/supabase-mock";

const EXPIRED_SHARE_TOKEN = "e2e-expired-share-token";

test.describe("Shared debrief public page", () => {
  test("renders debrief grade, score, summary, and lists for a valid token", async ({ page }) => {
    await setupSupabaseMocks(page);

    await page.goto(`/share/${E2E_VALID_SHARE_TOKEN}`, { waitUntil: "domcontentloaded" });
    await dismissCookieBanner(page);

    await expect(page.getByRole("heading", { name: "Session Debrief" })).toBeVisible({
      timeout: 15_000,
    });
    await expect(page.getByText("Grade B+")).toBeVisible();
    await expect(page.getByText("81")).toBeVisible();
    await expect(page.getByText(E2E_SHARED_DEBRIEF.summary)).toBeVisible();
    await expect(page.getByText("Clear structure")).toBeVisible();
    await expect(page.getByText("Add more metrics")).toBeVisible();
    await expect(page.getByText(/Practice with Career Pilot/i)).toBeVisible();
  });

  test("falls back to scorecard-only label when debrief is missing", async ({ page }) => {
    await setupSupabaseMocks(page);
    await page.route("**/rest/v1/rpc/get_shared_debrief**", async (route) => {
      if (route.request().method() === "OPTIONS") {
        await route.fulfill({ status: 200, headers: { "access-control-allow-origin": "*" } });
        return;
      }
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        headers: { "access-control-allow-origin": "*" },
        body: "[]",
      });
    });

    await page.goto(`/share/${E2E_VALID_SHARE_TOKEN}`, { waitUntil: "domcontentloaded" });
    await dismissCookieBanner(page);

    await expect(page.getByRole("heading", { name: "Shared scorecard" })).toBeVisible({
      timeout: 15_000,
    });
    await expect(page.getByText("81")).toBeVisible();
    await expect(page.getByText(E2E_SHARED_SCORECARD.feedback)).toBeVisible();
    await expect(page.getByText("Concise answers")).toBeVisible();
    await expect(page.getByText("More STAR detail")).toBeVisible();
  });

  test("shows PublicErrorState for expired or invalid token", async ({ page }) => {
    await setupSupabaseMocks(page);

    await page.goto(`/share/${EXPIRED_SHARE_TOKEN}`, { waitUntil: "domcontentloaded" });
    await dismissCookieBanner(page);

    await expect(page.getByRole("heading", { name: /unavailable|invalid|expired/i })).toBeVisible({
      timeout: 15_000,
    });
    await expect(page.getByText(/invalid or has expired/i)).toBeVisible();
    await expect(page.getByRole("link", { name: /Go to Career Pilot/i })).toBeVisible();
  });
});
