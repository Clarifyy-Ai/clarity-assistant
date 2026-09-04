// src/store/audioStore.ts
import { create } from "zustand";
import { subscribeWithSelector } from "zustand/middleware";
import type {
  AudioStoreState,
  AudioDevice,
  AudioLevelSample,
  DiarizationSegment,
  TranscriptUtterance,
  Speaker,
  DeepgramConnectionStatus,
  DeepgramTokenState,
  RuntimeMicState,
  AudioSetupStep,
  AudioPipelineStatus,
  AudioError,
  VADConfig,
  TranscriptionProviderStatus,
  DualChannelHealthState,
  AudioChannelHealthSnapshotState,
} from "@/types/audio.types";
import { emptyChannelHealth } from "@/lib/audio/audioChannelHealth";

// ─────────────────────────────────────────────────────────────────
// Audio Store
// ─────────────────────────────────────────────────────────────────

const MAX_LEVEL_SAMPLES = 120; // 2 seconds at 60fps
const MAX_UTTERANCES = 200;

interface AudioStore extends AudioStoreState {
  // Stream actions
  setMicStream: (stream: MediaStream | null) => void;
  setSystemStream: (stream: MediaStream | null) => void;
  setCombinedStream: (stream: MediaStream | null) => void;
  setMicDeviceId: (id: string | null) => void;
  setIsCapturing: (capturing: boolean) => void;
  setStreamError: (error: AudioError | null) => void;
  stopAllStreams: () => void;

  // Level actions
  pushLevelSample: (sample: AudioLevelSample) => void;
  setCurrentLevel: (level: number) => void;
  setIsSpeaking: (speaking: boolean) => void;

  // Diarization actions
  setCurrentSpeaker: (speaker: Speaker) => void;
  addDiarizationSegment: (segment: DiarizationSegment) => void;
  clearDiarizationSegments: () => void;

  // Transcript actions
  addUtterance: (utterance: TranscriptUtterance) => void;
  updateInterimText: (text: string) => void;
  finaliseUtterance: (id: string) => void;
  setLastQuestion: (question: string | null) => void;
  clearTranscript: () => void;
  /** Hydrate transcript after refresh restore (replaces current buffer). */
  restoreTranscript: (payload: {
    utterances?: TranscriptUtterance[];
    full_transcript?: string;
    last_question?: string | null;
  }) => void;

  // Deepgram / transcription provider actions
  setDeepgramStatus: (status: DeepgramConnectionStatus) => void;
  setTranscriptionProviderStatus: (status: TranscriptionProviderStatus) => void;
  setTokenState: (state: DeepgramTokenState) => void;
  setMicState: (state: RuntimeMicState) => void;
  setPipelineStatus: (status: AudioPipelineStatus) => void;
  setInterviewerChannelActive: (active: boolean) => void;
  noteInterviewerCaptureFrame: (sentToStt: boolean) => void;
  noteInterviewerCaptureHeartbeat: () => void;
  resetInterviewerCaptureHealth: () => void;

  // Setup wizard actions
  setSetupStep: (step: AudioSetupStep) => void;
  setMicDevices: (devices: AudioDevice[]) => void;
  setSelectedMicId: (id: string | null) => void;
  setMicTestPassed: (passed: boolean) => void;
  setSystemAudioAvailable: (available: boolean) => void;
  setSystemAudioTestPassed: (passed: boolean) => void;
  setSetupError: (error: AudioError | null) => void;

  // General
  setNoiseLevel: (level: number) => void;
  setIsMuted: (muted: boolean) => void;
  setVADConfig: (config: Partial<VADConfig>) => void;
  setQuestionConfidenceMin: (min: number) => void;
  setChannelHealth: (health: DualChannelHealthState) => void;
  patchChannelHealth: (
    channel: "mic" | "interviewer",
    snapshot: AudioChannelHealthSnapshotState,
  ) => void;

  // Full reset
  resetAudio: () => void;
}

const INITIAL_AUDIO_STATE: AudioStoreState = {
  streams: {
    mic_stream: null,
    system_stream: null,
    combined_stream: null,
    mic_device_id: null,
    is_capturing: false,
    error: null,
  },
  levels: {
    samples: [],
    max_samples: MAX_LEVEL_SAMPLES,
    current_level: 0,
    is_speaking: false,
  },
  diarization: {
    current_speaker: "unknown",
    segments: [],
    last_switch_at: null,
    interviewer_speaking: false,
    candidate_speaking: false,
  },
  transcript: {
    utterances: [],
    interim_text: "",
    last_question: null,
    last_question_at: null,
    full_transcript: "",
  },
  vad_config: {
    silence_threshold_ms: 1200,
    min_speech_duration_ms: 300,
    noise_floor: 0.05,
  },
  question_confidence_min: 0.45,
  deepgram_status: "disconnected",
  transcription_provider_status: "idle",
  token_state: "idle",
  mic_state: "not_checked",
  pipeline_status: "idle",
  interviewer_channel_active: false,
  interviewer_capture_health: {
    framesReceived: 0,
    framesSentToStt: 0,
    lastHeartbeatAt: null,
  },
  setup: {
    step: "device_selection",
    mic_devices: [],
    selected_mic_id: null,
    mic_test_passed: false,
    system_audio_available: false,
    system_audio_test_passed: false,
    error: null,
  },
  noise_level: 0,
  is_muted: false,
  channel_health: {
    mic: emptyChannelHealth(),
    interviewer: emptyChannelHealth(),
  },
};

export const useAudioStore = create<AudioStore>()(
  subscribeWithSelector((set, get) => ({
    ...INITIAL_AUDIO_STATE,

    // ── Stream actions ─────────────────────────────────────
    setMicStream: (mic_stream) =>
      set((s) => ({ streams: { ...s.streams, mic_stream } })),

    setSystemStream: (system_stream) =>
      set((s) => ({ streams: { ...s.streams, system_stream } })),

    setCombinedStream: (combined_stream) =>
      set((s) => ({ streams: { ...s.streams, combined_stream } })),

    setMicDeviceId: (mic_device_id) =>
      set((s) => ({ streams: { ...s.streams, mic_device_id } })),

    setIsCapturing: (is_capturing) =>
      set((s) => ({ streams: { ...s.streams, is_capturing } })),

    setStreamError: (error) =>
      set((s) => ({ streams: { ...s.streams, error } })),

    stopAllStreams: () => {
      const { streams } = get();

      streams.mic_stream?.getTracks().forEach((t) => t.stop());
      streams.system_stream?.getTracks().forEach((t) => t.stop());
      streams.combined_stream?.getTracks().forEach((t) => t.stop());

      set((s) => ({
        streams: {
          ...s.streams,
          mic_stream: null,
          system_stream: null,
          combined_stream: null,
          mic_device_id: null,
          is_capturing: false,
          error: null,
        },
      }));
    },

    // ── Level actions ──────────────────────────────────────
    pushLevelSample: (sample) =>
      set((s) => {
        const samples = [...s.levels.samples, sample].slice(-MAX_LEVEL_SAMPLES);
        return {
          levels: {
            ...s.levels,
            samples,
            current_level: sample.level,
            is_speaking: sample.is_speaking,
          },
        };
      }),

    setCurrentLevel: (current_level) =>
      set((s) => ({ levels: { ...s.levels, current_level } })),

    setIsSpeaking: (is_speaking) =>
      set((s) => ({ levels: { ...s.levels, is_speaking } })),

    // ── Diarization actions ────────────────────────────────
    setCurrentSpeaker: (current_speaker) =>
      set((s) => ({
        diarization: {
          ...s.diarization,
          current_speaker,
          interviewer_speaking: current_speaker === "interviewer",
          candidate_speaking: current_speaker === "candidate",
          last_switch_at: Date.now(),
        },
      })),

    addDiarizationSegment: (segment) =>
      set((s) => ({
        diarization: {
          ...s.diarization,
          segments: [...s.diarization.segments, segment].slice(-500),
        },
      })),

    clearDiarizationSegments: () =>
      set((s) => ({ diarization: { ...s.diarization, segments: [] } })),

    // ── Transcript actions ─────────────────────────────────
    addUtterance: (utterance) =>
      set((s) => {
        const duplicate = s.transcript.utterances.some((existing) =>
          existing.speaker === utterance.speaker &&
          existing.text.trim().toLowerCase() === utterance.text.trim().toLowerCase() &&
          Math.abs(existing.start_ms - utterance.start_ms) < 1200 &&
          Math.abs(existing.end_ms - utterance.end_ms) < 1600,
        );
        if (duplicate) return s;
        const utterances = [...s.transcript.utterances, utterance]
          .sort((a, b) => a.start_ms - b.start_ms)
          .slice(-MAX_UTTERANCES);
        const full_transcript = utterances
          .filter((u) => u.is_final)
          .map((u) => `[${u.speaker}]: ${u.text}`)
          .join("\n");

        return {
          transcript: {
            ...s.transcript,
            utterances,
            full_transcript,
            // ✅ clear interim when we receive a final utterance
            interim_text: utterance.is_final ? "" : s.transcript.interim_text,
          },
        };
      }),

    updateInterimText: (interim_text) =>
      set((s) => ({ transcript: { ...s.transcript, interim_text } })),

    finaliseUtterance: (id) =>
      set((s) => ({
        transcript: {
          ...s.transcript,
          utterances: s.transcript.utterances.map((u) =>
            u.id === id ? { ...u, is_final: true } : u
          ),
          interim_text: "",
        },
      })),

    setLastQuestion: (last_question) =>
      set((s) => ({
        transcript: {
          ...s.transcript,
          last_question,
          last_question_at: last_question ? Date.now() : null,
        },
      })),

    clearTranscript: () =>
      set((s) => ({
        transcript: {
          ...s.transcript,
          utterances: [],
          interim_text: "",
          full_transcript: "",
          last_question: null,
          last_question_at: null,
        },
      })),

    restoreTranscript: (payload) =>
      set((s) => {
        const utterances = Array.isArray(payload.utterances) ? payload.utterances : [];
        const full_transcript =
          typeof payload.full_transcript === "string" && payload.full_transcript
            ? payload.full_transcript
            : utterances
                .filter((u) => u.is_final !== false)
                .map((u) => `[${u.speaker}]: ${u.text}`)
                .join("\n");
        const last_question =
          payload.last_question !== undefined
            ? payload.last_question
            : s.transcript.last_question;
        return {
          transcript: {
            ...s.transcript,
            utterances,
            full_transcript,
            interim_text: "",
            last_question,
            last_question_at: last_question ? Date.now() : null,
          },
        };
      }),

    // ── Deepgram actions ───────────────────────────────────
    setDeepgramStatus: (deepgram_status) =>
      set((s) => ({
        deepgram_status,
        // ✅ clear transient errors once deepgram reconnects successfully
        streams:
          deepgram_status === "connected"
            ? { ...s.streams, error: null }
            : s.streams,
      })),
    setTranscriptionProviderStatus: (transcription_provider_status) =>
      set((s) => ({
        transcription_provider_status,
        streams:
          transcription_provider_status === "connected"
            ? { ...s.streams, error: null }
            : s.streams,
      })),
    setTokenState: (token_state) => set({ token_state }),
    setMicState: (mic_state) => set({ mic_state }),
    setPipelineStatus: (pipeline_status) => set({ pipeline_status }),
    setInterviewerChannelActive: (interviewer_channel_active) =>
      set({ interviewer_channel_active }),
    noteInterviewerCaptureFrame: (sentToStt) =>
      set((s) => ({
        interviewer_capture_health: {
          framesReceived: s.interviewer_capture_health.framesReceived + 1,
          framesSentToStt:
            s.interviewer_capture_health.framesSentToStt + (sentToStt ? 1 : 0),
          lastHeartbeatAt: Date.now(),
        },
      })),
    noteInterviewerCaptureHeartbeat: () =>
      set((s) => ({
        interviewer_capture_health: {
          ...s.interviewer_capture_health,
          lastHeartbeatAt: Date.now(),
        },
      })),
    resetInterviewerCaptureHealth: () =>
      set({
        interviewer_capture_health: {
          framesReceived: 0,
          framesSentToStt: 0,
          lastHeartbeatAt: null,
        },
      }),

    // ── Setup wizard actions ───────────────────────────────
    setSetupStep: (step) => set((s) => ({ setup: { ...s.setup, step } })),

    setMicDevices: (mic_devices) => set((s) => ({ setup: { ...s.setup, mic_devices } })),

    setSelectedMicId: (selected_mic_id) =>
      set((s) => ({ setup: { ...s.setup, selected_mic_id } })),

    setMicTestPassed: (mic_test_passed) =>
      set((s) => ({ setup: { ...s.setup, mic_test_passed } })),

    setSystemAudioAvailable: (system_audio_available) =>
      set((s) => ({ setup: { ...s.setup, system_audio_available } })),

    setSystemAudioTestPassed: (system_audio_test_passed) =>
      set((s) => ({ setup: { ...s.setup, system_audio_test_passed } })),

    setSetupError: (error) => set((s) => ({ setup: { ...s.setup, error } })),

    // ── General ────────────────────────────────────────────
    setNoiseLevel: (noise_level) => set({ noise_level }),

    setIsMuted: (is_muted) => set({ is_muted }),

    setVADConfig: (config) => set((s) => ({ vad_config: { ...s.vad_config, ...config } })),
    setQuestionConfidenceMin: (min) =>
      set({
        question_confidence_min: Math.max(0.15, Math.min(0.9, Number(min) || 0.45)),
      }),

    setChannelHealth: (channel_health) => set({ channel_health }),

    patchChannelHealth: (channel, snapshot) =>
      set((s) => ({
        channel_health: {
          ...s.channel_health,
          [channel]: snapshot,
        },
      })),

    // ── Full reset ─────────────────────────────────────────
    resetAudio: () => {
      get().stopAllStreams();
      set(INITIAL_AUDIO_STATE);
    },
  }))
);
