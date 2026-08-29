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
  model: "nova-2" | "nova-2-meeting" | "nova-2-phonecall";
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

export interface AudioStoreState {
  streams: AudioStreamState;
  levels: AudioLevelBuffer;
  diarization: DiarizationState;
  transcript: TranscriptState;
  vad_config: VADConfig;
  deepgram_status: DeepgramConnectionStatus;
  pipeline_status: AudioPipelineStatus;
  setup: AudioSetupState;
  noise_level: number;             // 0.0 – 1.0 ambient noise
  is_muted: boolean;
}
