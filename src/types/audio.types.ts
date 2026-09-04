// ─────────────────────────────────────────────────────────────────
// Audio & Transcription Types
// ─────────────────────────────────────────────────────────────────

// ── Audio Source ──────────────────────────────────────────────────

export type AudioSourceType = "microphone" | "system" | "combined";

export interface AudioDevice {
  deviceId: string;
  label: string;
  kind: "audioinput" | "audiooutput";
  isDefault: boolean;
}

export interface AudioStreamState {
  mic_stream: MediaStream | null;
  system_stream: MediaStream | null;
  combined_stream: MediaStream | null;
  mic_device_id: string | null;
  is_capturing: boolean;
  error: AudioError | null;
}

// ── Audio Levels ──────────────────────────────────────────────────

export interface AudioLevelSample {
  timestamp: number;               // ms epoch
  level: number;                   // 0.0 – 1.0 normalised RMS
  is_speaking: boolean;            // VAD result
}

export interface AudioLevelBuffer {
  samples: AudioLevelSample[];
  max_samples: number;             // rolling window size
  current_level: number;
  is_speaking: boolean;
}

// ── Speaker Diarization ───────────────────────────────────────────

export type Speaker = "interviewer" | "candidate" | "unknown";

export interface DiarizationSegment {
  speaker: Speaker;
  start_ms: number;
  end_ms: number;
  text: string;
  confidence: number;              // 0.0 – 1.0
}

export interface DiarizationState {
  current_speaker: Speaker;
  segments: DiarizationSegment[];
  last_switch_at: number | null;   // ms epoch
  interviewer_speaking: boolean;
  candidate_speaking: boolean;
}

// ── Voice Activity Detection ──────────────────────────────────────

export interface VADConfig {
  silence_threshold_ms: number;    // default 1200ms silence → end of utterance
  min_speech_duration_ms: number;  // minimum speech to trigger transcription
  noise_floor: number;             // 0.0 – 1.0
}

export type VADEvent =
  | { type: "speech_start"; timestamp: number }
  | { type: "speech_end";   timestamp: number; duration_ms: number }
  | { type: "silence";      timestamp: number; duration_ms: number };

// ── Deepgram / STT ────────────────────────────────────────────────

export type DeepgramTokenState =
  | "idle"
  | "connecting"
  | "ready"
  | "failed";

export type RuntimeMicState =
  | "not_checked"
  | "requesting_permission"
  | "ready"
  | "permission_denied"
  | "device_unavailable"
  | "no_signal"
  | "error";

export type DeepgramConnectionStatus =
  | "disconnected"
  | "connecting"
  | "connected"
  | "reconnecting"
  | "error";

export type AudioPipelineStatus =
  | "idle"
  | "requesting_permission"
  | "connecting"
  | "listening"
  | "receiving_audio"
  | "transcribing"
  | "reconnecting"
  | "microphone_only"
  | "text_only"
  | "unavailable"
  | "ended";

export interface DeepgramConfig {
  model: "nova-2" | "nova-2-meeting" | "nova-2-phonecall" | "nova-3" | "nova-3-general";
  language: string;                // "en-US"
  smart_format: boolean;
  interim_results: boolean;
  utterance_end_ms: number;
  vad_events: boolean;
  diarize: boolean;
  punctuate: boolean;
  filler_words: boolean;           // Deepgram native filler detection
}

export interface TranscriptWord {
  word: string;
  start: number;
  end: number;
  confidence: number;
  speaker?: number;
  punctuated_word?: string;
  type?: string;                   // e.g. "filler" from Deepgram
}

export interface TranscriptUtterance {
  id: string;
  speaker: Speaker;
  text: string;
  words: TranscriptWord[];
  start_ms: number;
  end_ms: number;
  is_final: boolean;
  is_interviewer_question: boolean;
  confidence: number;
  filler_word_count?: number;
  filler_words_used?: string[];
}

export interface TranscriptState {
  utterances: TranscriptUtterance[];
  interim_text: string;
  last_question: string | null;
  last_question_at: number | null; // ms epoch
  full_transcript: string;
}

// ── Audio Setup Wizard ────────────────────────────────────────────

export type AudioSetupStep =
  | "device_selection"
  | "mic_test"
  | "system_audio_setup"
  | "system_audio_test"
  | "complete";

export interface AudioSetupState {
  step: AudioSetupStep;
  mic_devices: AudioDevice[];
  selected_mic_id: string | null;
  mic_test_passed: boolean;
  system_audio_available: boolean;
  system_audio_test_passed: boolean;
  error: AudioError | null;
}

// ── Audio Errors ──────────────────────────────────────────────────

export type AudioErrorCode =
  | "PERMISSION_DENIED"
  | "DEVICE_NOT_FOUND"
  | "DEVICE_IN_USE"
  | "SYSTEM_AUDIO_NOT_SUPPORTED"
  | "SYSTEM_AUDIO_FAILED"
  | "STREAM_ENDED"
  | "DEEPGRAM_CONNECTION_FAILED"
  | "DEEPGRAM_QUOTA_EXCEEDED"
  | "NOISE_TOO_HIGH"
  | "UNKNOWN";

export interface AudioError {
  code: AudioErrorCode;
  message: string;
  recoverable: boolean;
  suggestion: string;
}

// ── Audio Store State ─────────────────────────────────────────────

/** LiveTranscriptionService provider status — use in overlay UI, not raw Deepgram. */
export type TranscriptionProviderStatus =
  | "idle"
  | "connecting"
  | "connected"
  | "reconnecting"
  | "paused"
  | "unavailable"
  | "error"
  | "ended";

export interface AudioStoreState {
  streams: AudioStreamState;
  levels: AudioLevelBuffer;
  diarization: DiarizationState;
  transcript: TranscriptState;
  vad_config: VADConfig;
  /** Minimum STT confidence (0–1) for auto interviewer-question finalize. */
  question_confidence_min: number;
  /** @deprecated Prefer transcription_provider_status in overlay UI. */
  deepgram_status: DeepgramConnectionStatus;
  transcription_provider_status: TranscriptionProviderStatus;
  token_state: DeepgramTokenState;
  mic_state: RuntimeMicState;
  pipeline_status: AudioPipelineStatus;
  /**
   * True only while interviewer (tab) STT channel is live.
   * Do not treat system_stream alone as connected — failed STT can leave a stale stream.
   */
  interviewer_channel_active: boolean;
  /** QA counters for interviewer tab capture (no PCM / raw audio). */
  interviewer_capture_health: InterviewerCaptureHealth;
  /** Normalized mic + interviewer health — never green from stream object alone. */
  channel_health: DualChannelHealthState;
  setup: AudioSetupState;
  noise_level: number;             // 0.0 – 1.0 ambient noise
  is_muted: boolean;
}

export interface InterviewerCaptureHealth {
  framesReceived: number;
  framesSentToStt: number;
  lastHeartbeatAt: number | null;
}

/** Live dual-channel health snapshots (see audioChannelHealth.ts). */
export type AudioChannelHealthStatus =
  | "disconnected"
  | "connecting"
  | "active"
  | "silent_source"
  | "unavailable";

export interface AudioChannelHealthMetricsState {
  hasStream: boolean;
  trackReadyState: "live" | "ended" | "none";
  trackEnabled: boolean;
  trackMuted: boolean;
  receivedFrameCount: number;
  transmittedFrameCount: number;
  queuedFrameCount: number;
  rmsLevel: number;
  lastEnergyAt: number | null;
  sttSocketOpen: boolean;
  sttStatus: "idle" | "connecting" | "connected" | "reconnecting" | "error" | "unavailable";
  lastKeepAliveAt: number | null;
  lastSttMessageAt: number | null;
  lastTranscriptEventAt: number | null;
  monitoringStartedAt: number | null;
  connectFailed: boolean;
  fatalError: boolean;
}

export interface AudioChannelHealthSnapshotState {
  status: AudioChannelHealthStatus;
  metrics: AudioChannelHealthMetricsState;
}

export interface DualChannelHealthState {
  mic: AudioChannelHealthSnapshotState;
  interviewer: AudioChannelHealthSnapshotState;
}
