/**
 * Live Practice Coach — transcription overlay flow (mocked Deepgram WS + session APIs).
 */
import {
  test,
  expect,
  loginAsTestUser,
  dismissCookieBanner,
  dismissWalkthrough,
} from "../playwright-fixture";
import { buildDeepgramFinalResult } from "../src/test/e2e/deepgramMockMessages";
import {
  DEFAULT_LIVE_OVERLAY_CONFIG,
  E2E_FINAL_TRANSCRIPT,
  E2E_PARTIAL_TRANSCRIPT,
  installDeepgramWebSocketMock,
  installPracticeCoachMediaMocks,
  installMicDeniedMock,
  openOverlayTranscriptTab,
  prepareLiveOverlayHandoff,
  trackPracticeCoachSessionApis,
  waitForOverlaySessionActive,
  buildE2eDeepgramSchedule,
} from "./helpers/practice-coach-transcription";

test.use({
  permissions: ["microphone"],
});

test.describe.configure({ timeout: 120_000, retries: 1 });

test.describe("Practice Coach transcription flow", () => {
  test("deepgram-token and start-session run; overlay shows partial then final transcript", async ({
    page,
  }) => {
    await loginAsTestUser(page);
    const apiTracker = await trackPracticeCoachSessionApis(page);
    await installPracticeCoachMediaMocks(page);
    await installDeepgramWebSocketMock(page);
    await prepareLiveOverlayHandoff(page, DEFAULT_LIVE_OVERLAY_CONFIG);

    await page.goto("/app/live/overlay", { waitUntil: "domcontentloaded" });
    await dismissCookieBanner(page);
    await dismissWalkthrough(page);

    await waitForOverlaySessionActive(page);
    await openOverlayTranscriptTab(page);

    await expect(page.getByLabel("Interim transcript — not final")).toHaveText(
      E2E_PARTIAL_TRANSCRIPT,
      { timeout: 15_000 },
    );

    await expect(page.getByLabel("Final transcript")).toHaveText(E2E_FINAL_TRANSCRIPT, {
      timeout: 35_000,
    });
    await expect(page.getByLabel("Interim transcript — not final")).toHaveCount(0);

    expect(apiTracker.startSessionCalls).toBeGreaterThan(0);
    expect(apiTracker.deepgramTokenCalls).toBeGreaterThan(0);
    expect(apiTracker.parakeetTokenCalls).toBe(0);
    expect(new Set(apiTracker.startSessionIds).size).toBe(1);
  });

  test("pause preserves final transcript in overlay", async ({ page }) => {
    await loginAsTestUser(page);
    const apiTracker = await trackPracticeCoachSessionApis(page);
    await installPracticeCoachMediaMocks(page);
    await installDeepgramWebSocketMock(page);
    await prepareLiveOverlayHandoff(page, DEFAULT_LIVE_OVERLAY_CONFIG);

    await page.goto("/app/live/overlay", { waitUntil: "domcontentloaded" });
    await dismissCookieBanner(page);
    await dismissWalkthrough(page);

    await waitForOverlaySessionActive(page);
    await openOverlayTranscriptTab(page);

    await expect(page.getByLabel("Final transcript")).toHaveText(E2E_FINAL_TRANSCRIPT, {
      timeout: 35_000,
    });

    await page.getByRole("button", { name: "Pause session" }).click();

    await expect(page.getByText("Paused", { exact: true })).toBeVisible({ timeout: 10_000 });
    await expect(page.getByLabel("Final transcript")).toHaveText(E2E_FINAL_TRANSCRIPT);
    await expect(page.getByLabel("Interim transcript — not final")).toHaveCount(0);
    expect(apiTracker.parakeetTokenCalls).toBe(0);
  });

  test("duplicate Deepgram finals are not shown twice", async ({ page }) => {
    await loginAsTestUser(page);
    const apiTracker = await trackPracticeCoachSessionApis(page);
    await installPracticeCoachMediaMocks(page);
    await installDeepgramWebSocketMock(page, [
      ...buildE2eDeepgramSchedule(E2E_PARTIAL_TRANSCRIPT, E2E_FINAL_TRANSCRIPT, 400),
      {
        delayMs: 700,
        payload: buildDeepgramFinalResult(E2E_FINAL_TRANSCRIPT),
      },
    ]);
    await prepareLiveOverlayHandoff(page, DEFAULT_LIVE_OVERLAY_CONFIG);

    await page.goto("/app/live/overlay", { waitUntil: "domcontentloaded" });
    await dismissCookieBanner(page);
    await dismissWalkthrough(page);
    await waitForOverlaySessionActive(page);
    await openOverlayTranscriptTab(page);

    await expect(page.getByLabel("Final transcript")).toHaveText(E2E_FINAL_TRANSCRIPT, {
      timeout: 20_000,
    });
    const utteranceCount = await page.evaluate(async () => {
      const { useAudioStore } = await import("/src/store/audioStore.ts");
      return useAudioStore.getState().transcript.utterances.filter(
        (u) => u.text === "Hello world",
      ).length;
    });
    expect(utteranceCount).toBe(1);
    expect(apiTracker.parakeetTokenCalls).toBe(0);
  });

  test("Deepgram outage shows unavailable state without fake transcript", async ({ page }) => {
    await loginAsTestUser(page);
    const apiTracker = await trackPracticeCoachSessionApis(page, { deepgramUnavailable: true });
    await installPracticeCoachMediaMocks(page);
    await installDeepgramWebSocketMock(page);
    await prepareLiveOverlayHandoff(page, DEFAULT_LIVE_OVERLAY_CONFIG);

    await page.goto("/app/live/overlay", { waitUntil: "domcontentloaded" });
    await dismissCookieBanner(page);
    await dismissWalkthrough(page);
    await waitForOverlaySessionActive(page);

    await expect(page.getByText(/transcription unavailable/i).first()).toBeVisible({
      timeout: 20_000,
    });
    await expect(page.getByLabel("Final transcript")).toHaveCount(0);
    expect(apiTracker.parakeetTokenCalls).toBe(0);
  });

  test("mic denial recovers to a visible permission state", async ({ page, context }) => {
    await context.clearPermissions();
    await loginAsTestUser(page);
    const apiTracker = await trackPracticeCoachSessionApis(page);
    await installMicDeniedMock(page);
    await prepareLiveOverlayHandoff(page, DEFAULT_LIVE_OVERLAY_CONFIG);

    await page.goto("/app/live/overlay", { waitUntil: "domcontentloaded" });
    await dismissCookieBanner(page);
    await dismissWalkthrough(page);

    await expect(page.getByText(/microphone/i).first()).toBeVisible({ timeout: 25_000 });
    expect(apiTracker.parakeetTokenCalls).toBe(0);
  });
});
