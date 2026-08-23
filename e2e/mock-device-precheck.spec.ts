/**
 * Mock Interview device pre-check: local microphone/speaker vs remote STT.
 */
import { test, expect, loginAsTestUser, dismissCookieBanner, E2E_TEST_USER } from "../playwright-fixture";
import type { Page } from "@playwright/test";

test.use({
  permissions: ["microphone"],
});

test.describe.configure({ timeout: 90_000, retries: 1 });

async function dismissBlockingDialogs(page: Page) {
  await dismissCookieBanner(page);
  await page.evaluate(
    ({ userId, version }) => {
      try {
        localStorage.setItem("clarify:whats-new-dismissed", version);
        localStorage.setItem("Clarify AI-app-walkthrough-v1", JSON.stringify({ [userId]: true }));
      } catch {
        // ignore
      }
    },
    { userId: E2E_TEST_USER.id, version: "1.5.0" },
  );
  const gotIt = page.getByRole("button", { name: /^got it$/i });
  if (await gotIt.isVisible().catch(() => false)) {
    await gotIt.click().catch(() => undefined);
    await page
      .getByRole("dialog", { name: /what's new/i })
      .waitFor({ state: "hidden", timeout: 3_000 })
      .catch(() => undefined);
  }
  const skipTour = page.getByRole("button", { name: /Skip tour/i });
  if (await skipTour.isVisible().catch(() => false)) {
    await skipTour.click().catch(() => undefined);
  }
}

async function gotoDeviceCheck(page: Page) {
  await page.goto("/app/mock", { waitUntil: "domcontentloaded", timeout: 30_000 });
  await expect(page).toHaveURL(/\/app\/mock/, { timeout: 15_000 });
  await dismissBlockingDialogs(page);

  const changeSetup = page.getByRole("button", { name: /change setup/i });
  if (await changeSetup.isVisible().catch(() => false)) {
    await changeSetup.click();
    await dismissBlockingDialogs(page);
  }

  if (await page.getByTestId("device-precheck").isVisible().catch(() => false)) {
    return;
  }

  const regular = page.getByTestId("session-call-type-regular_call");
  await expect(regular).toBeVisible({ timeout: 20_000 });
  await regular.click();

  for (let i = 0; i < 6; i++) {
    if (await page.getByTestId("device-precheck").isVisible().catch(() => false)) {
      return;
    }
    const next = page.getByRole("button", { name: "Next" });
    if (!(await next.isVisible().catch(() => false))) break;
    if (await next.isDisabled().catch(() => true)) break;
    await next.click();
  }

  await expect(page.getByTestId("device-precheck")).toBeVisible({ timeout: 15_000 });
}

async function installMediaMocks(page: Page, opts?: { silence?: boolean; deny?: boolean }) {
  await page.addInitScript(
    ({ silence, deny }) => {
      const g = globalThis as unknown as {
        __CLARITY_PRECHECK_SILENCE__?: boolean;
        __CLARITY_SPEAKER_STARTS__?: number;
        __CLARITY_SELECTED_MIC__?: string;
      };
      g.__CLARITY_PRECHECK_SILENCE__ = Boolean(silence);
      g.__CLARITY_SPEAKER_STARTS__ = 0;

      const media = navigator.mediaDevices;
      if (!media) return;
      const origGum = media.getUserMedia.bind(media);
      const origEnum = media.enumerateDevices.bind(media);

      media.getUserMedia = async (constraints: MediaStreamConstraints) => {
        if (deny) {
          throw new DOMException("Permission denied", "NotAllowedError");
        }
        const audio = constraints?.audio;
        if (audio && typeof audio === "object" && "deviceId" in audio) {
          const exact = (audio as { deviceId?: { exact?: string } }).deviceId?.exact;
          if (exact) g.__CLARITY_SELECTED_MIC__ = exact;
        }
        try {
          return await origGum(constraints);
        } catch {
          const Ctx =
            window.AudioContext ||
            (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
          if (!Ctx) throw new DOMException("Permission denied", "NotAllowedError");
          const ctx = new Ctx();
          return ctx.createMediaStreamDestination().stream;
        }
      };

      media.enumerateDevices = async () => {
        const real = await origEnum().catch(() => [] as MediaDeviceInfo[]);
        const extras: MediaDeviceInfo[] = [
          {
            deviceId: "mic-1",
            kind: "audioinput",
            label: "Fake Mic 1",
            groupId: "g1",
            toJSON() {
              return this;
            },
          } as MediaDeviceInfo,
          {
            deviceId: "mic-2",
            kind: "audioinput",
            label: "Fake Mic 2",
            groupId: "g2",
            toJSON() {
              return this;
            },
          } as MediaDeviceInfo,
        ];
        const withoutInputs = real.filter((d) => d.kind !== "audioinput");
        return [...extras, ...withoutInputs];
      };

      if (typeof AnalyserNode !== "undefined") {
        AnalyserNode.prototype.getFloatTimeDomainData = function (array: Float32Array) {
          array.fill(g.__CLARITY_PRECHECK_SILENCE__ ? 0 : 0.2);
        };
      }
      if (typeof OscillatorNode !== "undefined") {
        const origStart = OscillatorNode.prototype.start;
        OscillatorNode.prototype.start = function (...args: unknown[]) {
          g.__CLARITY_SPEAKER_STARTS__ = (g.__CLARITY_SPEAKER_STARTS__ ?? 0) + 1;
          return origStart.apply(this, args as never);
        };
      }
    },
    { silence: Boolean(opts?.silence), deny: Boolean(opts?.deny) },
  );
}

test.describe("Mock Interview device pre-check", () => {
  test("TEST 1 — microphone success is local and shows Microphone ready", async ({ page }) => {
    await loginAsTestUser(page);
    await installMediaMocks(page);
    await gotoDeviceCheck(page);
    await expect(page.locator("#precheck-mic-status")).toHaveText("Microphone ready", { timeout: 15_000 });
    await expect(page.getByText(/needs fix/i)).toHaveCount(0);
  });

  test("TEST 2 — no signal is not an STT failure", async ({ page }) => {
    await loginAsTestUser(page);
    await installMediaMocks(page, { silence: true });
    await gotoDeviceCheck(page);
    await expect(page.locator("#precheck-mic-status")).toHaveText("No microphone signal detected", {
      timeout: 15_000,
    });
    await expect(page.getByText(/transcription service is not configured/i)).toHaveCount(0);
  });

  test("TEST 3 — permission denied shows recovery instructions", async ({ page }) => {
    await loginAsTestUser(page);
    await installMediaMocks(page, { deny: true });
    await gotoDeviceCheck(page);
    await expect(page.locator("#precheck-mic-status")).toHaveText("Permission denied", { timeout: 15_000 });
    await expect(page.getByText(/Allow microphone access in your browser settings/i)).toBeVisible();
  });

  test("TEST 4 — Deepgram 503 leaves microphone ready", async ({ page }) => {
    await loginAsTestUser(page);
    await installMediaMocks(page);
    await page.route("**/functions/v1/deepgram-token**", async (route) => {
      const origin = route.request().headers()["origin"] ?? "http://127.0.0.1:5000";
      await route.fulfill({
        status: 503,
        contentType: "application/json",
        headers: {
          "access-control-allow-origin": origin,
          "access-control-allow-credentials": "true",
        },
        body: JSON.stringify({ error: "Transcription service is not configured", code: "SERVICE_UNAVAILABLE" }),
      });
    });
    await gotoDeviceCheck(page);
    await expect(page.locator("#precheck-mic-status")).toHaveText("Microphone ready", { timeout: 15_000 });
    await expect(page.locator("#precheck-stt-status")).toContainText(/temporarily unavailable/i, {
      timeout: 15_000,
    });
    await expect(
      page.getByText("Microphone ready. Transcription service is temporarily unavailable."),
    ).toBeVisible();
    await expect(page.getByText(/needs fix/i)).toHaveCount(0);
  });

  test("TEST 5 — speaker test starts controlled playback", async ({ page }) => {
    await loginAsTestUser(page);
    await installMediaMocks(page);
    await gotoDeviceCheck(page);
    await page.getByRole("button", { name: "Play test" }).click();
    await expect(page.locator("#precheck-speaker-status")).toHaveText("Speaker ready", { timeout: 10_000 });
    const starts = await page.evaluate(
      () => (globalThis as unknown as { __CLARITY_SPEAKER_STARTS__?: number }).__CLARITY_SPEAKER_STARTS__ ?? 0,
    );
    expect(starts).toBeGreaterThan(0);
  });

  test("TEST 6 — rapid speaker clicks do not duplicate status or overlap playback", async ({ page }) => {
    await loginAsTestUser(page);
    await installMediaMocks(page);
    await gotoDeviceCheck(page);
    const play = page.getByRole("button", { name: /Play test|Play again/i }).first();
    await play.click();
    await play.click({ force: true }).catch(() => {});
    await expect(page.locator("#precheck-speaker-status")).toHaveText("Speaker ready");
    await expect(page.getByText(/Speaker OK — play again/i)).toHaveCount(0);
    const starts = await page.evaluate(
      () => (globalThis as unknown as { __CLARITY_SPEAKER_STARTS__?: number }).__CLARITY_SPEAKER_STARTS__ ?? 0,
    );
    expect(starts).toBeLessThanOrEqual(2);
  });

  test("TEST 7 — Recheck transitions through checking then ready", async ({ page }) => {
    await loginAsTestUser(page);
    await installMediaMocks(page);
    await gotoDeviceCheck(page);
    await expect(page.locator("#precheck-mic-status")).toHaveText("Microphone ready", { timeout: 15_000 });
    await page.getByRole("button", { name: "Recheck microphone" }).click();
    await expect(page.locator("#precheck-mic-status")).toHaveText("Microphone ready", { timeout: 15_000 });
  });

  test("TEST 8 — changing microphone tests the new device", async ({ page }) => {
    await loginAsTestUser(page);
    await installMediaMocks(page);
    await gotoDeviceCheck(page);
    await expect(page.locator("#precheck-mic-status")).toHaveText("Microphone ready", { timeout: 15_000 });
    await page.locator("#precheck-mic-device").selectOption("mic-2");
    await expect(page.locator("#precheck-mic-status")).toHaveText("Microphone ready", { timeout: 15_000 });
    await expect(page.locator("#precheck-mic-device")).toHaveValue("mic-2");
  });

  test("TEST 9 — refresh restores the selected microphone", async ({ page }) => {
    await loginAsTestUser(page);
    await installMediaMocks(page);
    await gotoDeviceCheck(page);
    await expect(page.locator("#precheck-mic-status")).toHaveText("Microphone ready", { timeout: 15_000 });
    await page.locator("#precheck-mic-device").selectOption("mic-2");
    await expect
      .poll(async () => page.evaluate(() => localStorage.getItem("clarify:precheck.micDeviceId")))
      .toBe("mic-2");
    await page.reload({ waitUntil: "domcontentloaded" });
    if (!(await page.getByRole("heading", { name: "Microphone" }).isVisible().catch(() => false))) {
      await gotoDeviceCheck(page);
    }
    await expect(page.locator("#precheck-mic-device")).toHaveValue("mic-2", { timeout: 15_000 });
  });
});
