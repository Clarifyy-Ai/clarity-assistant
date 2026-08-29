import { beforeEach, describe, expect, it } from "vitest";
import {
  canTransition,
  transitionOverlayState,
} from "@/lib/overlay/overlaySessionStates";
import {
  beginOverlayProductSession,
  markOverlayProductSessionActive,
  markOverlayProductSessionReady,
  markOverlayProductSessionTerminal,
  teardownOverlayProductSession,
} from "@/lib/session/overlayProductSession";
import { useOverlaySessionAuthorityStore } from "@/store/overlaySessionAuthorityStore";
import { useOverlayStore } from "@/store/overlayStore";
import { useSessionStore } from "@/store/sessionStore";
import { useAudioStore } from "@/store/audioStore";

describe("overlay product session isolation", () => {
  beforeEach(() => {
    const gen = useOverlaySessionAuthorityStore.getState().generation;
    if (gen > 0) {
      useOverlaySessionAuthorityStore.getState().markTerminal(gen, "RESET");
      teardownOverlayProductSession(gen);
    }
    useOverlaySessionAuthorityStore.setState({
      generation: 0,
      mode: null,
      sessionId: null,
      lifecycle: "idle",
      terminalReason: null,
      authReady: true,
    });
    useOverlayStore.getState().resetSessionState();
    useSessionStore.getState().resetSession();
    useAudioStore.getState().clearTranscript();
  });

  it("sets authoritative live mode on begin", () => {
    const { generation } = beginOverlayProductSession({
      mode: "live",
      sessionId: "live-1",
    });
    expect(useOverlaySessionAuthorityStore.getState().mode).toBe("live");
    expect(useSessionStore.getState().mode).toBe("live");
    expect(useOverlaySessionAuthorityStore.getState().generation).toBe(generation);
  });

  it("does not leak live transcript/hints into a new mock session", () => {
    const live = beginOverlayProductSession({ mode: "live", sessionId: "live-1" });
    markOverlayProductSessionReady(live.generation);
    markOverlayProductSessionActive(live.generation);

    useOverlayStore.getState().setCurrentQuestion("Tell me about yourself");
    useOverlayStore.getState().appendStreamChunk("Live hint chunk");
    useAudioStore.getState().addUtterance({
      id: "u1",
      text: "live interviewer",
      speaker: "interviewer",
      words: [],
      start_ms: 0,
      end_ms: 1,
      is_final: true,
      confidence: 1,
      is_interviewer_question: true,
    });

    markOverlayProductSessionTerminal(live.generation, "ENDED");
    teardownOverlayProductSession(live.generation);

    const mock = beginOverlayProductSession({ mode: "mock", sessionId: "mock-1" });
    markOverlayProductSessionReady(mock.generation);
    markOverlayProductSessionActive(mock.generation);

    expect(useOverlaySessionAuthorityStore.getState().mode).toBe("mock");
    expect(useSessionStore.getState().mode).toBe("mock");
    expect(useOverlayStore.getState().current_question).toBe("");
    expect(useOverlayStore.getState().streaming_buffer).toBe("");
    expect(useOverlayStore.getState().current_hint).toBe("");
    expect(useAudioStore.getState().transcript.utterances).toEqual([]);
  });

  it("rejects late hint mutations after terminal", () => {
    const { generation } = beginOverlayProductSession({
      mode: "live",
      sessionId: "live-2",
    });
    markOverlayProductSessionReady(generation);
    markOverlayProductSessionActive(generation);
    useOverlayStore.getState().setCurrentQuestion("Q1");
    markOverlayProductSessionTerminal(generation, "ENDED");

    useOverlayStore.getState().setCurrentQuestion("late question");
    useOverlayStore.getState().appendStreamChunk("late chunk");

    expect(useOverlayStore.getState().current_question).toBe("Q1");
    expect(useOverlayStore.getState().streaming_buffer).toBe("");
  });

  it("canMountOverlay requires auth + mode + session + ready/active", () => {
    useOverlaySessionAuthorityStore.getState().setAuthReady(false);
    const { generation } = beginOverlayProductSession({
      mode: "mock",
      sessionId: "mock-2",
    });
    expect(useOverlaySessionAuthorityStore.getState().canMountOverlay()).toBe(false);

    useOverlaySessionAuthorityStore.getState().setAuthReady(true);
    expect(useOverlaySessionAuthorityStore.getState().canMountOverlay()).toBe(false);

    markOverlayProductSessionReady(generation);
    expect(useOverlaySessionAuthorityStore.getState().canMountOverlay()).toBe(true);
  });
});

describe("mode-specific pipeline transitions", () => {
  it("allows live tab_audio_detected but not mock-only states", () => {
    expect(canTransition("listening", "tab_audio_detected", "live")).toBe(true);
    expect(canTransition("listening", "question_generated", "live")).toBe(false);
    expect(
      transitionOverlayState("listening", "question_generated", "live"),
    ).toBe("listening");
  });

  it("allows mock question_generated but not live-only question_detected", () => {
    expect(canTransition("idle", "question_generated", "mock")).toBe(true);
    expect(canTransition("listening", "question_detected", "mock")).toBe(false);
    expect(
      transitionOverlayState("listening", "question_detected", "mock"),
    ).toBe("listening");
  });
});
