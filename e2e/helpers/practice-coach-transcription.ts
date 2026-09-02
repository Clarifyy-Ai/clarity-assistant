import type { Page } from "@playwright/test";
import type { LiveSessionConfig } from "../../src/types/session.types";
import {
  buildDeepgramFinalResult,
  buildE2eTranscriptionSchedule,
  type DeepgramMockScheduleItem,
} from "../../src/test/e2e/deepgramMockMessages";

const PENDING_SETUP_KEY = "clarify:pending-practice-setup";
const OVERLAY_FIRST_RUN_KEY = "clarify:overlay-first-run-done-v2";
const RESPONSIBLE_USE_KEY = "clarify:responsible-use-ack-v1";

export const E2E_PARTIAL_TRANSCRIPT = "Hello wor";
export const E2E_FINAL_TRANSCRIPT = "Hello world";

export type { DeepgramMockScheduleItem };

export function buildE2eDeepgramSchedule(
  partialText: string,
  finalText: string,
  finalDelayMs = 8_000,
): DeepgramMockScheduleItem[] {
  return buildE2eTranscriptionSchedule(partialText, finalText, finalDelayMs);
}

export const DEFAULT_LIVE_OVERLAY_CONFIG: LiveSessionConfig = {
  company: null,
  role: "Software Engineer",
  hint_style: "short_hints",
  model: "gemini-flash",
  smart_routing: false,
  stealth_mode: false,
  resume_id: null,
  jd_id: null,
  interview_type: "behavioral",
  instructions: "",
  enable_system_audio: false,
  session_call_type: "regular_call",
  duration_minutes: 30,
};

/** Fake microphone / speaker for overlay capture without real hardware. */
export async function installPracticeCoachMediaMocks(page: Page): Promise<void> {
  await page.addInitScript(() => {
    const media = navigator.mediaDevices;
    if (!media) return;

    const origGum = media.getUserMedia.bind(media);
    const origEnum = media.enumerateDevices.bind(media);

    media.getUserMedia = async (constraints: MediaStreamConstraints) => {
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
      const fakeMic: MediaDeviceInfo = {
        deviceId: "e2e-mic",
        kind: "audioinput",
        label: "E2E Mic",
        groupId: "e2e",
        toJSON() {
          return this;
        },
      } as MediaDeviceInfo;
      return [fakeMic, ...real.filter((d) => d.kind !== "audioinput")];
    };

    if (typeof AnalyserNode !== "undefined") {
      AnalyserNode.prototype.getFloatTimeDomainData = function (array: Float32Array) {
        array.fill(0.18);
      };
    }
  });
}

export async function installMicDeniedMock(page: Page): Promise<void> {
  await page.addInitScript(() => {
    const media = navigator.mediaDevices;
    if (!media) return;
    media.getUserMedia = async () => {
      throw new DOMException("Permission denied", "NotAllowedError");
    };
  });
}

/** Replace Deepgram live WebSockets with scripted Results payloads. */
export async function installDeepgramWebSocketMock(
  page: Page,
  schedule: DeepgramMockScheduleItem[] = buildE2eDeepgramSchedule(
    E2E_PARTIAL_TRANSCRIPT,
    E2E_FINAL_TRANSCRIPT,
  ),
): Promise<void> {
  await page.addInitScript((items) => {
    const NativeWebSocket = window.WebSocket;

    type ListenerMap = {
      open: EventListener[];
      message: EventListener[];
      close: EventListener[];
      error: EventListener[];
    };

    function emit(listeners: ListenerMap, type: keyof ListenerMap, event: Event) {
      for (const fn of listeners[type]) fn(event);
    }

    function createDeepgramSocket(url: string | URL, protocols?: string | string[]) {
      const listeners: ListenerMap = { open: [], message: [], close: [], error: [] };
      let onopen: ((ev: Event) => void) | null = null;
      let onmessage: ((ev: MessageEvent) => void) | null = null;
      let onclose: ((ev: CloseEvent) => void) | null = null;
      let onerror: ((ev: Event) => void) | null = null;

      const socket = {
        url: String(url),
        protocol: Array.isArray(protocols) ? (protocols[1] ?? protocols[0] ?? "") : (protocols ?? ""),
        readyState: NativeWebSocket.CONNECTING,
        binaryType: "arraybuffer" as BinaryType,
        bufferedAmount: 0,
        extensions: "",
        CONNECTING: NativeWebSocket.CONNECTING,
        OPEN: NativeWebSocket.OPEN,
        CLOSING: NativeWebSocket.CLOSING,
        CLOSED: NativeWebSocket.CLOSED,
        get onopen() {
          return onopen;
        },
        set onopen(fn: ((ev: Event) => void) | null) {
          onopen = fn;
        },
        get onmessage() {
          return onmessage;
        },
        set onmessage(fn: ((ev: MessageEvent) => void) | null) {
          onmessage = fn;
        },
        get onclose() {
          return onclose;
        },
        set onclose(fn: ((ev: CloseEvent) => void) | null) {
          onclose = fn;
        },
        get onerror() {
          return onerror;
        },
        set onerror(fn: ((ev: Event) => void) | null) {
          onerror = fn;
        },
        send() {
          // Audio chunks are ignored in the mock — transcript is scripted.
        },
        close(code = 1000, reason = "") {
          if (socket.readyState === NativeWebSocket.CLOSED) return;
          socket.readyState = NativeWebSocket.CLOSED;
          const event = new CloseEvent("close", { code, reason });
          onclose?.(event);
          emit(listeners, "close", event);
        },
        addEventListener(type: string, listener: EventListener) {
          if (type in listeners) listeners[type as keyof ListenerMap].push(listener);
        },
        removeEventListener(type: string, listener: EventListener) {
          if (!(type in listeners)) return;
          const bucket = listeners[type as keyof ListenerMap];
          const idx = bucket.indexOf(listener);
          if (idx >= 0) bucket.splice(idx, 1);
        },
        dispatchEvent(event: Event) {
          const type = event.type as keyof ListenerMap;
          if (type in listeners) emit(listeners, type, event);
          if (type === "open") onopen?.(event);
          if (type === "message") onmessage?.(event as MessageEvent);
          if (type === "close") onclose?.(event as CloseEvent);
          if (type === "error") onerror?.(event);
          return true;
        },
      };

      window.setTimeout(() => {
        socket.readyState = NativeWebSocket.OPEN;
        const openEvent = new Event("open");
        onopen?.(openEvent);
        emit(listeners, "open", openEvent);

        for (const item of items as Array<{ delayMs?: number; payload: Record<string, unknown> }>) {
          window.setTimeout(() => {
            if (socket.readyState !== NativeWebSocket.OPEN) return;
            const messageEvent = new MessageEvent("message", {
              data: JSON.stringify(item.payload),
            });
            onmessage?.(messageEvent);
            emit(listeners, "message", messageEvent);
          }, item.delayMs ?? 0);
        }
      }, 25);

      return socket as unknown as WebSocket;
    }

    const MockWebSocket = function (
      this: WebSocket,
      url: string | URL,
      protocols?: string | string[],
    ) {
      const urlString = String(url);
      const isDeepgram =
        urlString.includes("api.deepgram.com") || urlString.includes("/v1/listen");
      if (isDeepgram) {
        return createDeepgramSocket(url, protocols);
      }
      return new NativeWebSocket(url, protocols);
    } as unknown as typeof WebSocket;

    MockWebSocket.prototype = NativeWebSocket.prototype;
    Object.assign(MockWebSocket, NativeWebSocket);
    window.WebSocket = MockWebSocket;
  }, schedule);
}

/** Stash overlay handoff config and dismiss first-run overlays before navigation. */
export async function prepareLiveOverlayHandoff(
  page: Page,
  config: LiveSessionConfig = DEFAULT_LIVE_OVERLAY_CONFIG,
): Promise<void> {
  await page.evaluate(
    ({ pendingKey, firstRunKey, responsibleKey, sessionConfig }) => {
      try {
        sessionStorage.setItem(pendingKey, JSON.stringify(sessionConfig));
        localStorage.setItem(firstRunKey, "1");
        localStorage.setItem(responsibleKey, "1");
      } catch {
        // ignore storage failures in e2e
      }
    },
    {
      pendingKey: PENDING_SETUP_KEY,
      firstRunKey: OVERLAY_FIRST_RUN_KEY,
      responsibleKey: RESPONSIBLE_USE_KEY,
      sessionConfig: config,
    },
  );
}

export async function openOverlayTranscriptTab(page: Page): Promise<void> {
  await page.evaluate(async () => {
    const { useOverlayStore } = await import("/src/store/overlayStore.ts");
    useOverlayStore.getState().setActiveTab("transcript");
  });
  await page.getByRole("tabpanel", { name: "Transcript" }).waitFor({
    state: "visible",
    timeout: 15_000,
  });
}

export type SessionApiCallTracker = {
  parakeetTokenCalls: number;
  deepgramTokenCalls: number;
  startSessionCalls: number;
  startSessionIds: string[];
};

/** Track deepgram-token and start-session edge calls. Count (and block) any parakeet-token. */
export async function trackPracticeCoachSessionApis(
  page: Page,
  opts?: { deepgramUnavailable?: boolean },
): Promise<SessionApiCallTracker> {
  const tracker: SessionApiCallTracker = {
    parakeetTokenCalls: 0,
    deepgramTokenCalls: 0,
    startSessionCalls: 0,
    startSessionIds: [],
  };
  const sessionId = "11111111-1111-4111-8111-111111111111";

  await page.route("**/functions/v1/parakeet-token**", async (route) => {
    tracker.parakeetTokenCalls += 1;
    await route.abort("blocked");
  });

  await page.route("**/functions/v1/deepgram-token**", async (route) => {
    if (route.request().method() === "OPTIONS") {
      await route.fulfill({ status: 204, body: "" });
      return;
    }
    tracker.deepgramTokenCalls += 1;
    const origin = route.request().headers()["origin"] ?? "http://127.0.0.1:5000";
    if (opts?.deepgramUnavailable) {
      await route.fulfill({
        status: 503,
        contentType: "application/json",
        headers: {
          "access-control-allow-origin": origin,
          "access-control-allow-credentials": "true",
        },
        body: JSON.stringify({
          error: "Live transcription is not configured.",
          code: "provider_unavailable",
        }),
      });
      return;
    }
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      headers: {
        "access-control-allow-origin": origin,
        "access-control-allow-credentials": "true",
      },
      body: JSON.stringify({ token: "e2e-fake-deepgram-token", expires_in: 60, type: "scoped" }),
    });
  });

  await page.route("**/functions/v1/start-session**", async (route) => {
    if (route.request().method() === "OPTIONS") {
      await route.fulfill({
        status: 200,
        headers: { "Access-Control-Allow-Origin": "*" },
      });
      return;
    }
    tracker.startSessionCalls += 1;
    tracker.startSessionIds.push(sessionId);
    const origin = route.request().headers()["origin"] ?? "http://127.0.0.1:5000";
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      headers: {
        "access-control-allow-origin": origin,
        "access-control-allow-credentials": "true",
      },
      body: JSON.stringify({
        session_id: sessionId,
        started_at: new Date().toISOString(),
        expires_at: new Date(Date.now() + 5 * 60 * 1000).toISOString(),
        reused: tracker.startSessionCalls > 1,
        status: "active",
        lifecycle_status: "IN_PROGRESS",
        config: { duration_minutes: 30, question_count: 5 },
      }),
    });
  });

  return tracker;
}

export async function waitForOverlaySessionActive(page: Page): Promise<void> {
  await page.getByRole("tab", { name: /Hints|More tools/i }).first().waitFor({
    state: "visible",
    timeout: 45_000,
  });
}

export { buildDeepgramFinalResult };
