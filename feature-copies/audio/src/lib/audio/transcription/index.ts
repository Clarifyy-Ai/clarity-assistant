export {
  LiveTranscriptionService,
  createLiveTranscriptionService,
} from "./LiveTranscriptionService";
export { loadLiveTranscriptionConfig } from "./config";
export { finalSegmentFingerprint, rememberFinalKey } from "./finalKeys";
export {
  channelToSpeaker,
  newUtteranceFromSegment,
  partialTextToSegment,
  utteranceToSegment,
} from "./segmentMap";
export type {
  LiveTranscriptionCallbacks,
  LiveTranscriptionServiceOptions,
  TranscriptSegment,
  TranscriptionChannel,
  TranscriptionProviderStatus,
} from "./types";
