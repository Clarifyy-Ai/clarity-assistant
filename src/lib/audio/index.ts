// ─── Audio Capture ────────────────────────────────────────────────────────────
export { enumerateAudioDevices, watchAudioDevices, captureMicrophone } from "./audioCapture";
export {
  acquireMicrophoneStream,
  canHydrateDeviceLabels,
  microphoneSetupHint,
  restoredSessionToast,
  shouldShowMicrophonePrompt,
  MicrophoneAccessError,
  isMicrophoneAccessError,
} from "./micPermission";
export type { AcquireMicrophoneResult, MicPermissionState } from "./micPermission";

// ─── Mic Capture ─────────────────────────────────────────────────────────────
export { startMicCapture, stopMicCapture } from "./micCapture";

// ─── System Audio Capture ─────────────────────────────────────────────────────
export { startSystemAudioCapture, stopSystemAudioCapture } from "./systemAudioCapture";

// ─── Audio Mixer ──────────────────────────────────────────────────────────────
export { mixStreams } from "./audioMixer";

// ─── Audio Processor (Central Pipeline) ──────────────────────────────────────
export { AudioProcessor, processStaticBuffer } from "./audioProcessor";
export type { AudioChunk, AudioFormat, AudioProcessorConfig, AudioProcessorStats } from "./audioProcessor";

// ─── Deepgram ─────────────────────────────────────────────────────────────────
export { DeepgramClient } from "./deepgramClient";
export { runLocalMicCheck } from "./localMicPrecheck";
export { checkSttHealth } from "./sttHealthCheck";
export { runSpeakerTest, cancelSpeakerTest } from "./speakerTest";
export { MicState, SpeakerState, SttState } from "./precheckStates";
export { DeepgramStreamClient, resetDeepgramTokenClient } from "./deepgramStream";
export {
  fetchDeepgramTokenBounded,
  resetDeepgramTokenClient as resetDeepgramTokenCache,
  unblockDeepgramTokenClient,
  isDeepgramTokenBlocked,
} from "./deepgramToken";
export { TranscriptionState, TRANSCRIPTION_STATUS_COPY, deepgramStatusToTranscription, providerStatusToTranscription, sttHealthToTranscription } from "./transcriptionStates";
export type { DeepgramStreamOptions } from "./deepgramStream";

// ─── Live transcription (Parakeet boundary) ───────────────────────────────────
export {
  ParakeetTranscriptionService,
  createParakeetTranscriptionService,
  loadParakeetTranscriptionConfig,
  channelToSpeaker,
  newUtteranceFromSegment,
  partialTextToSegment,
  utteranceToSegment,
} from "./transcription";
export type {
  ParakeetTranscriptionCallbacks,
  ParakeetTranscriptionServiceOptions,
  TranscriptSegment,
  TranscriptionChannel,
  TranscriptionProviderStatus,
} from "./transcription";

// ─── Speech Analysis ──────────────────────────────────────────────────────────
export { classifySpeaker, extractLatestQuestion, detectSpeakerChange, buildDiarizationSegment, processUtteranceForDiarization, getTranscriptBySpeaker, getSpeakingTimeSummary } from "./diarization";
export { detectFillersInText, FillerAccumulator, RealTimeFillerCounter, buildFillerSummary } from "./fillerDetector";
export { VADDetector } from "./vadDetector";
export { WPM_RANGES } from "./wpmTracker";

// ─── Screenshot / Screen Capture ──────────────────────────────────────────────
export { captureScreen, captureAndAnalyseCodingProblem, isScreenCaptureSupported, createRegionSelector } from "./screenshotCapture";
export type { CaptureRegion, ScreenshotResult } from "./screenshotCapture";
