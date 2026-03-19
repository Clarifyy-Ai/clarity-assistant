// ─── Audio Capture ────────────────────────────────────────────────────────────
export {
  captureAudio,
  stopAudioCapture,
  getAudioDevices,
} from "./audioCapture";

// ─── Mic Capture ─────────────────────────────────────────────────────────────
export {
  startMicCapture,
  stopMicCapture,
  getMicPermissionState,
} from "./micCapture";

// ─── System Audio Capture ─────────────────────────────────────────────────────
export {
  startSystemAudioCapture,
  stopSystemAudioCapture,
  isSystemAudioSupported,
} from "./systemAudioCapture";

// ─── Audio Mixer ──────────────────────────────────────────────────────────────
export {
  AudioMixer,
  createAudioMixer,
} from "./audioMixer";

// ─── Audio Processor (Central Pipeline) ──────────────────────────────────────
export {
  AudioProcessor,
  createAudioProcessor,
  processStaticBuffer,
} from "./audioProcessor";

export type {
  AudioChunk,
  AudioFormat,
  AudioProcessorConfig,
  AudioProcessorStats,
} from "./audioProcessor";

// ─── Deepgram ─────────────────────────────────────────────────────────────────
export {
  createDeepgramClient,
  getDeepgramToken,
} from "./deepgramClient";

export {
  DeepgramStream,
  createDeepgramStream,
} from "./deepgramStream";

// ─── Speech Analysis ──────────────────────────────────────────────────────────
export {
  SpeakerDiarizer,
  createDiarizer,
} from "./diarization";

export {
  FillerDetector,
  createFillerDetector,
  FILLER_WORDS,
} from "./fillerDetector";

export {
  VADDetector,
  createVADDetector,
} from "./vadDetector";

export {
  WPMTracker,
  createWPMTracker,
} from "./wpmTracker";

// ─── Screenshot / Screen Capture ──────────────────────────────────────────────
export {
  captureScreenshot,
  startScreenCapture,
  stopScreenCapture,
} from "./screenshotCapture";
