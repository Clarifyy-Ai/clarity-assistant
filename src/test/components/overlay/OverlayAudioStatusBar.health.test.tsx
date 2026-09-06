import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { OverlayAudioStatusBar } from "@/components/overlay/OverlayAudioStatusBar";
import { useAudioStore } from "@/store/audioStore";
import { useSessionStore } from "@/store/sessionStore";
import { emptyChannelHealth, buildChannelHealth, EMPTY_CHANNEL_METRICS } from "@/lib/audio/audioChannelHealth";

describe("OverlayAudioStatusBar — no false Active", () => {
  it("does not show green Tab audio for silent_source", () => {
    useSessionStore.setState({ status: "active" } as never);
    useAudioStore.setState({
      streams: {
        mic_stream: null,
        system_stream: {} as MediaStream,
        combined_stream: null,
        mic_device_id: null,
        is_capturing: true,
        error: null,
      },
      is_muted: false,
      mic_state: "ready",
      transcription_provider_status: "connected",
      channel_health: {
        mic: emptyChannelHealth(),
        interviewer: buildChannelHealth({
          ...EMPTY_CHANNEL_METRICS,
          hasStream: true,
          trackReadyState: "live",
          trackEnabled: true,
          sttSocketOpen: true,
          sttStatus: "connected",
          transmittedFrameCount: 20,
          monitoringStartedAt: Date.now() - 60_000,
        }),
      },
    } as never);

    render(<OverlayAudioStatusBar />);
    const tab = screen.getByText(/Tab audio silent|Tab audio/i).closest("[data-tab-audio-state]");
    expect(tab?.getAttribute("data-tab-audio-state")).toBe("silent_source");
    expect(tab?.className).not.toMatch(/emerald/);
  });

  it("shows Mic only when interviewer disconnected even if system_stream exists", () => {
    useSessionStore.setState({ status: "active" } as never);
    useAudioStore.setState({
      streams: {
        mic_stream: null,
        system_stream: {} as MediaStream,
        combined_stream: null,
        mic_device_id: null,
        is_capturing: true,
        error: null,
      },
      is_muted: false,
      mic_state: "ready",
      transcription_provider_status: "connected",
      interviewer_channel_active: false,
      channel_health: {
        mic: emptyChannelHealth(),
        interviewer: emptyChannelHealth(),
      },
    } as never);

    render(<OverlayAudioStatusBar />);
    const tab = screen.getByText("Mic only").closest("[data-tab-audio-state]");
    expect(tab?.getAttribute("data-tab-audio-state")).toBe("disconnected");
  });

  it("shows connected transcription when mic is active but tab is silent", () => {
    useSessionStore.setState({ status: "active" } as never);
    useAudioStore.setState({
      streams: {
        mic_stream: {} as MediaStream,
        system_stream: {} as MediaStream,
        combined_stream: null,
        mic_device_id: null,
        is_capturing: true,
        error: null,
      },
      is_muted: false,
      mic_state: "ready",
      transcription_provider_status: "connected",
      interviewer_channel_active: true,
      channel_health: {
        mic: buildChannelHealth({
          ...EMPTY_CHANNEL_METRICS,
          hasStream: true,
          trackReadyState: "live",
          trackEnabled: true,
          sttSocketOpen: true,
          sttStatus: "connected",
          transmittedFrameCount: 20,
          rmsLevel: 0.05,
          lastEnergyAt: Date.now(),
          monitoringStartedAt: Date.now() - 5_000,
        }),
        interviewer: buildChannelHealth({
          ...EMPTY_CHANNEL_METRICS,
          hasStream: true,
          trackReadyState: "live",
          trackEnabled: true,
          sttSocketOpen: true,
          sttStatus: "connected",
          transmittedFrameCount: 20,
          monitoringStartedAt: Date.now() - 60_000,
        }),
      },
    } as never);

    render(<OverlayAudioStatusBar />);
    expect(screen.getByText("Mic active")).toBeTruthy();
    expect(screen.getByText("Transcription connected")).toBeTruthy();
    expect(screen.queryByText("Transcription silent source")).toBeNull();
  });
});
