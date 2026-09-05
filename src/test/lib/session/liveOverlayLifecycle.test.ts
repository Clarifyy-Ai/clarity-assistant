import { beforeEach, describe, expect, it } from "vitest";
import {
  beginOverlayProductSession,
  promoteOverlayProductSessionWhenReady,
  markOverlayProductSessionReady,
} from "@/lib/session/overlayProductSession";
import { useAudioStore } from "@/store/audioStore";
import { useOverlaySessionAuthorityStore } from "@/store/overlaySessionAuthorityStore";
import { useSessionStore } from "@/store/sessionStore";

describe("live overlay lifecycle coordinator", () => {
  beforeEach(() => {
    useOverlaySessionAuthorityStore.setState({
      generation: 0,
      mode: null,
      sessionId: null,
      lifecycle: "idle",
      terminalReason: null,
      authReady: true,
    });
    useSessionStore.getState().resetSession();
    useAudioStore.getState().resetAudio();
  });

  it("does not promote to active until mic health is active (non text-only)", () => {
    const { generation } = beginOverlayProductSession({
      mode: "live",
      sessionId: "live-1",
    });
    markOverlayProductSessionReady(generation);

    useAudioStore.setState({
      streams: { is_capturing: true } as ReturnType<typeof useAudioStore.getState>["streams"],
      channel_health: {
        mic: { status: "connecting", last_frame_at: null },
        interviewer: { status: "idle", last_frame_at: null },
        system: { status: "idle", last_frame_at: null },
      },
      pipeline_status: "connecting",
    });

    expect(promoteOverlayProductSessionWhenReady(generation, false)).toBe(false);
    expect(useSessionStore.getState().status).not.toBe("active");

    useAudioStore.setState({
      channel_health: {
        mic: { status: "active", last_frame_at: Date.now() },
        interviewer: { status: "idle", last_frame_at: null },
        system: { status: "idle", last_frame_at: null },
      },
      pipeline_status: "receiving_audio",
    });

    expect(promoteOverlayProductSessionWhenReady(generation, false)).toBe(true);
    expect(useSessionStore.getState().status).toBe("active");
  });

  it("promotes immediately in text-only mode", () => {
    const { generation } = beginOverlayProductSession({
      mode: "live",
      sessionId: "live-text",
    });
    markOverlayProductSessionReady(generation);
    expect(promoteOverlayProductSessionWhenReady(generation, true)).toBe(true);
    expect(useSessionStore.getState().status).toBe("active");
  });
});
