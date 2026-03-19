// ─── Audio Capture ────────────────────────────────────────────────────────────
export { enumerateAudioDevices, watchAudioDevices, captureMicrophone } from "./audioCapture";

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
export { DeepgramClient, deepgramClient } from "./deepgramClient";
export { DeepgramStreamClient } from "./deepgramStream";
export type { DeepgramStreamOptions } from "./deepgramStream";

// ─── Speech Analysis ──────────────────────────────────────────────────────────
export { classifySpeaker, extractLatestQuestion, detectSpeakerChange, buildDiarizationSegment, processUtteranceForDiarization, getTranscriptBySpeaker, getSpeakingTimeSummary } from "./diarization";
export { detectFillersInText, FillerAccumulator, RealTimeFillerCounter, buildFillerSummary } from "./fillerDetector";
export { VADDetector } from "./vadDetector";
export { WPM_RANGES } from "./wpmTracker";

// ─── Screenshot / Screen Capture ──────────────────────────────────────────────
export { captureScreen, captureAndAnalyseCodingProblem, isScreenCaptureSupported, createRegionSelector } from "./screenshotCapture";
export type { CaptureRegion, ScreenshotResult } from "./screenshotCapture";
