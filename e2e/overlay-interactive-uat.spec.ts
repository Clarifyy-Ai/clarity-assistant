/**
 * Live Overlay interactive UAT — chat attention / continuity (mocked session).
 * Full mic/share UAT remains manual per docs/OVERLAY_UAT.md.
 */
import {
  test,
  expect,
  loginAsTestUser,
  dismissCookieBanner,
  dismissWalkthrough,
} from "../playwright-fixture";
import {
  DEFAULT_LIVE_OVERLAY_CONFIG,
  installDeepgramWebSocketMock,
  installPracticeCoachMediaMocks,
  prepareLiveOverlayHandoff,
  waitForOverlaySessionActive,
} from "./helpers/practice-coach-transcription";

test.use({
  permissions: ["microphone"],
});

test.describe.configure({ timeout: 120_000, retries: 1 });

test.describe("Live Overlay interactive UAT (mocked)", () => {
  test("chat attention surfaces primary Chat control", async ({ page }) => {
    await loginAsTestUser(page);
    await installPracticeCoachMediaMocks(page);
    await installDeepgramWebSocketMock(page);
    await prepareLiveOverlayHandoff(page, DEFAULT_LIVE_OVERLAY_CONFIG);

    await page.goto("/app/live/overlay", { waitUntil: "domcontentloaded" });
    await dismissCookieBanner(page);
    await dismissWalkthrough(page);
    await waitForOverlaySessionActive(page);

    await page.evaluate(async () => {
      const { useOverlayStore } = await import("/src/store/overlayStore.ts");
      useOverlayStore
        .getState()
        .setChatAttention(true, "listening_timeout", "What is your biggest strength?");
    });

    await expect(
      page.getByRole("button", { name: /Type or edit the question in Chat|Chat/i }).first(),
    ).toBeVisible({ timeout: 10_000 });

    const pulse = page.locator(".animate-pulse").filter({ hasText: /Chat/i });
    await expect(pulse.first()).toBeVisible({ timeout: 5_000 });
  });

  test("unauthenticated overlay still redirects to login", async ({ page }) => {
    await page.goto("/app/live/overlay", { waitUntil: "domcontentloaded" });
    await expect(page).toHaveURL(/\/login/, { timeout: 15_000 });
  });
});
