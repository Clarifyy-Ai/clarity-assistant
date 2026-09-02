/**
 * Live Practice Coach — transcription overlay flow (mocked Deepgram + session APIs).
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
  E2E_FINAL_TRANSCRIPT,
  E2E_PARTIAL_TRANSCRIPT,
  installDeepgramWebSocketMock,
  installPracticeCoachMediaMocks,
  openOverlayTranscriptTab,
  prepareLiveOverlayHandoff,
  trackPracticeCoachSessionApis,
  waitForOverlaySessionActive,
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
  });

  test("pause preserves final transcript in overlay", async ({ page }) => {
    await loginAsTestUser(page);
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

    const utteranceCount = await page.evaluate(async () => {
      const { useAudioStore } = await import("/src/store/audioStore.ts");
      return useAudioStore.getState().transcript.utterances.length;
    });
    expect(utteranceCount).toBeGreaterThan(0);
  });
});
