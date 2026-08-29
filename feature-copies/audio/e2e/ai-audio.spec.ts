/**
 * Live audio / AI answer smoke — T-0898, T-0899
 *
 * BLOCKED: Browser microphone capture, WebRTC, and Deepgram streaming cannot
 * be exercised reliably in headless Playwright without dedicated media mocks
 * and edge-function stubs. Track in qaChecklist.json as Blocked until a
 * service-worker or WebRTC injection layer is added.
 */
import { test } from "../playwright-fixture";

test.describe.skip("Transcription & AI answer [T-0898, T-0899 — Blocked]", () => {
  test("transcription pipeline receives audio chunks", async () => {
    // Requires: getUserMedia mock + Deepgram WS stub
  });

  test("generate-answer edge function returns coaching text", async () => {
    // Requires: live session fixture + mocked generate-answer response
  });
});
