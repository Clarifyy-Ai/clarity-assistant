import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { DevicePrecheckCards } from "@/components/session/DevicePrecheckCards";
import { MicState, SpeakerState, SttState } from "@/lib/audio/precheckStates";

const noop = () => {};

describe("DevicePrecheckCards", () => {
  it("keeps microphone READY when transcription is unavailable", () => {
    render(
      <DevicePrecheckCards
        voiceRequired
        micState={MicState.READY}
        speakerState={SpeakerState.READY}
        sttState={SttState.STT_UNAVAILABLE}
        micDevices={[{ deviceId: "mic-1", label: "Headset", kind: "audioinput", isDefault: true }]}
        speakerDevices={[]}
        selectedMicId="mic-1"
        selectedSpeakerId={null}
        deviceLabel="Headset"
        peakRms={0.2}
        usedFallback={false}
        micError={null}
        sttMessage="Transcription service is temporarily unavailable."
        outputSelectable={false}
        speakerPlaying={false}
        onRecheckMic={noop}
        onChangeMic={noop}
        onPlaySpeaker={noop}
        onChangeSpeaker={noop}
        onRecheckStt={noop}
      />,
    );

    expect(screen.getByText("Microphone ready")).toBeInTheDocument();
    expect(screen.getByText("Speaker ready")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Play again" })).toBeInTheDocument();
    expect(screen.getByText("Microphone ready. Transcription service is temporarily unavailable.")).toBeInTheDocument();
    expect(screen.queryByText(/needs fix/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/Speaker OK — play again/i)).not.toBeInTheDocument();
  });

  it("shows permission recovery without color-only status", () => {
    render(
      <DevicePrecheckCards
        voiceRequired
        micState={MicState.PERMISSION_DENIED}
        speakerState={SpeakerState.NOT_CHECKED}
        sttState={SttState.STT_NOT_CHECKED}
        micDevices={[]}
        speakerDevices={[]}
        selectedMicId={null}
        selectedSpeakerId={null}
        deviceLabel={null}
        peakRms={0}
        usedFallback={false}
        micError={null}
        sttMessage={null}
        outputSelectable={false}
        speakerPlaying={false}
        onRecheckMic={noop}
        onChangeMic={noop}
        onPlaySpeaker={noop}
        onChangeSpeaker={noop}
        onRecheckStt={noop}
      />,
    );
    expect(screen.getByText("Permission denied")).toBeInTheDocument();
    expect(screen.getByText(/Allow microphone access/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Recheck microphone" })).toBeEnabled();
  });

  it("separates speaker status from the Play again action", () => {
    render(
      <DevicePrecheckCards
        voiceRequired
        micState={MicState.READY}
        speakerState={SpeakerState.READY}
        sttState={SttState.STT_READY}
        micDevices={[]}
        speakerDevices={[]}
        selectedMicId={null}
        selectedSpeakerId={null}
        deviceLabel={null}
        peakRms={0.1}
        usedFallback={false}
        micError={null}
        sttMessage={null}
        outputSelectable={false}
        speakerPlaying={false}
        onRecheckMic={noop}
        onChangeMic={noop}
        onPlaySpeaker={noop}
        onChangeSpeaker={noop}
        onRecheckStt={noop}
      />,
    );
    const status = screen.getAllByText("Speaker ready");
    expect(status).toHaveLength(1);
    expect(screen.getByRole("button", { name: "Play again" })).toBeInTheDocument();
  });
});
