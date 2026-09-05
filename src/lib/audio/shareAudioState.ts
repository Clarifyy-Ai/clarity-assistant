/**
 * Explicit tab/system audio share lifecycle for Live Copilot UI.
 * Do not infer ACTIVE from MediaStream existence alone — pair with channel health.
 */

export type ShareAudioState =
  | "NOT_STARTED"
  | "REQUESTING"
  | "ACTIVE"
  | "PAUSED"
  | "ENDED"
  | "DENIED"
  | "UNSUPPORTED"
  | "FAILED";

export function deriveShareAudioState(input: {
  requested: boolean;
  hasStream: boolean;
  channelActive: boolean;
  channelConnecting: boolean;
  channelSilent: boolean;
  denied: boolean;
  unsupported: boolean;
  failed: boolean;
  paused: boolean;
}): ShareAudioState {
  if (input.unsupported) return "UNSUPPORTED";
  if (input.denied) return "DENIED";
  if (input.failed) return "FAILED";
  if (input.paused && input.hasStream) return "PAUSED";
  if (input.channelActive) return "ACTIVE";
  if (input.channelConnecting || input.requested) return "REQUESTING";
  if (input.hasStream && input.channelSilent) return "ACTIVE";
  if (input.hasStream) return "REQUESTING";
  return "NOT_STARTED";
}

export function shouldShowShareAudioPrompt(state: ShareAudioState): boolean {
  return state === "NOT_STARTED" || state === "DENIED" || state === "FAILED";
}

export function shareAudioStateLabel(state: ShareAudioState): string {
  switch (state) {
    case "NOT_STARTED":
      return "Share tab audio";
    case "REQUESTING":
      return "Connecting tab audio…";
    case "ACTIVE":
      return "Tab audio active";
    case "PAUSED":
      return "Tab audio paused";
    case "ENDED":
      return "Tab audio ended";
    case "DENIED":
      return "Tab audio denied";
    case "UNSUPPORTED":
      return "Tab audio unsupported";
    case "FAILED":
      return "Tab audio failed";
    default:
      return "Tab audio";
  }
}
