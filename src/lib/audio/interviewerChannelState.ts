import {
  isChannelPresent,
  isChannelUiActive,
  type AudioChannelHealthStatus,
} from "@/lib/audio/audioChannelHealth";

/**
 * Post–mic-STT pipeline status after candidate channel connects.
 * Never clears an interviewer channel that auto tab-share already opened.
 */
export function resolvePostMicSttPipeline(input: {
  enableSystemAudio: boolean;
  interviewerChannelActive: boolean;
}): "listening" | "microphone_only" {
  if (input.interviewerChannelActive) return "listening";
  if (input.enableSystemAudio) return "microphone_only";
  return "listening";
}

/**
 * @deprecated Prefer channel_health.interviewer.status via isChannelUiActive.
 * Kept for transitional callers that still pass stream + STT-active flags.
 */
export function isTabAudioHonestlyConnected(input: {
  hasSystemStream: boolean;
  interviewerChannelActive: boolean;
}): boolean {
  return input.hasSystemStream && input.interviewerChannelActive;
}

/** Green Tab audio / System Audio Active — real flow only. */
export function isTabAudioUiActive(status: AudioChannelHealthStatus | undefined): boolean {
  return isChannelUiActive(status ?? "disconnected");
}

/** Share acquired (connecting / active / silent) — not disconnected/unavailable. */
export function isTabAudioAcquired(status: AudioChannelHealthStatus | undefined): boolean {
  return isChannelPresent(status ?? "disconnected");
}
