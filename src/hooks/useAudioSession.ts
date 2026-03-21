import { useEffect, useRef, useCallback } from "react";
import { useAudioStore } from "@/store/audioStore";
import { useSessionStore } from "@/store/sessionStore";
import {
  captureMicrophone,
  captureSystemAudio,
  mergeAudioStreams,
  createLevelAnalyser,
  stopStream,
  teardownAudioContext,
  watchStreamEnded,
  isSystemAudioSupported,
} from "@/lib/audio/audioCapture";
import { DeepgramStreamClient } from "@/lib/audio/deepgramStream";
import { processUtteranceForDiarization } from "@/lib/audio/diarization";
import { VADDetector, SilenceBoundaryDetector } from "@/lib/audio/vadDetector";
import { FillerAccumulator, RealTimeFillerCounter } from "@/lib/audio/fillerDetector";
import { WPMTracker } from "@/lib/audio/wpmTracker";
import type { TranscriptUtterance } from "@/types/audio.types";

// ─────────────────────────────────────────────────────────────────
// useAudioSession
// The master audio hook — coordinates:
//   mic + system audio capture → Deepgram STT → diarization
//   → VAD → filler detection → WPM → session store updates
// ─────────────────────────────────────────────────────────────────

interface UseAudioSessionOptions {
  enableSystemAudio?: boolean;
  micDeviceId?:       string | null;
  onQuestionDetected: (question: string) => void;
  onFillerDetected:   (count: number) => void;
  onWPMUpdate:        (wpm: number) => void;
}

export function useAudioSession(opts: UseAudioSessionOptions) {
  // Individual selectors for reactive state returned to callers.
  // Callbacks use useAudioStore.getState() / useSessionStore.getState()
  // so they stay stable — no full-store object in dependency arrays.
  const isCapturing    = useAudioStore((s) => s.streams?.is_capturing    ?? false);
  const isMuted        = useAudioStore((s) => s.is_muted                 ?? false);
  const deepgramStatus = useAudioStore((s) => s.deepgram_status          ?? "idle");
  const currentLevel   = useAudioStore((s) => s.levels?.current_level    ?? 0);
  const isSpeaking     = useAudioStore((s) => s.levels?.is_speaking      ?? false);
  const streamError    = useAudioStore((s) => s.streams?.error           ?? null);

  // ── Refs — persist across renders without causing re-renders ──
  const deepgramRef     = useRef<DeepgramStreamClient | null>(null);
  const vadRef          = useRef<VADDetector | null>(null);
  const silenceRef      = useRef<SilenceBoundaryDetector | null>(null);
  const fillerAccRef    = useRef<FillerAccumulator | null>(null);
  const fillerRTRef     = useRef<RealTimeFillerCounter | null>(null);
  const wpmRef          = useRef<WPMTracker | null>(null);
  const levelAnalyserRef = useRef<ReturnType<typeof createLevelAnalyser> | null>(null);
  const cleanupMicRef   = useRef<(() => void) | null>(null);
  const cleanupSysRef   = useRef<(() => void) | null>(null);
  const isStartedRef    = useRef(false);

  // ── Start the full audio pipeline ────────────────────────────

  const start = useCallback(async () => {
    if (isStartedRef.current) return;
    isStartedRef.current = true;

    const store = useAudioStore.getState();
    store.setIsCapturing(false);
    store.setDeepgramStatus("connecting");

    try {
      // 1. Capture mic
      const micStream = await captureMicrophone(opts.micDeviceId);
      store.setMicStream(micStream);

      // 2. Optionally capture system audio
      let combinedStream = micStream;
      if (opts.enableSystemAudio && isSystemAudioSupported()) {
        try {
          const sysStream = await captureSystemAudio();
          store.setSystemStream(sysStream);
          combinedStream = mergeAudioStreams(micStream, sysStream);

          // Watch for system audio ending (user stops sharing)
          cleanupSysRef.current = watchStreamEnded(sysStream, () => {
            store.setSystemStream(null);
          });
        } catch {
          // System audio failed — continue with mic only
          store.setSystemAudioAvailable(false);
        }
      }

      store.setCombinedStream(combinedStream);
      store.setIsCapturing(true);

      // 3. Level analyser → VAD
      const analyser = createLevelAnalyser(combinedStream);
      levelAnalyserRef.current = analyser;

      // 4. VAD detector
      const vad = new VADDetector({
        onSpeechStart: () => {
          silenceRef.current?.onCandidateSpeechStart();
        },
        onSpeechEnd: (durationMs) => {
          // Update WPM at end of each speech burst
          const wpm = wpmRef.current?.getCurrentWPM() ?? 0;
          opts.onWPMUpdate(wpm);
          useSessionStore.getState().setCurrentWPM(wpm);
        },
      });
      vadRef.current = vad;
      vad.start(analyser.getLevel);

      // 5. Silence boundary detector — triggers hint generation
      const silenceBoundary = new SilenceBoundaryDetector(
        (question) => opts.onQuestionDetected(question),
        1200
      );
      silenceRef.current = silenceBoundary;

      // 6. Filler accumulator + real-time counter
      fillerAccRef.current = new FillerAccumulator();
      fillerRTRef.current  = new RealTimeFillerCounter((count) => {
        opts.onFillerDetected(count);
        useSessionStore.getState().setCurrentWPM(
          useSessionStore.getState().current_wpm
        );
      });

      // 7. WPM tracker
      const wpmTracker = new WPMTracker((wpm) => {
        opts.onWPMUpdate(wpm);
      });
      wpmRef.current = wpmTracker;
      wpmTracker.start();

      // 8. Deepgram STT
      const deepgram = new DeepgramStreamClient({
        stream: combinedStream,
        config: {
          model:           "nova-2-meeting",
          diarize:         true,
          filler_words:    true,
          interim_results: true,
          utterance_end_ms: 1200,
        },
        onUtterance: (utterance: TranscriptUtterance) => {
          handleUtterance(utterance);
        },
        onInterim: (text) => {
          store.updateInterimText(text);
          // Real-time filler check on interim
          fillerRTRef.current?.check(text);
        },
        onError: (error) => {
          store.setStreamError({
            code:        "DEEPGRAM_CONNECTION_FAILED",
            message:     error.message,
            recoverable: true,
            suggestion:  "Check your internet connection.",
          });
        },
        onStatusChange: (status) => {
          store.setDeepgramStatus(status);
        },
      });

      deepgramRef.current = deepgram;
      await deepgram.connect();

      // 9. Watch for mic stream ending unexpectedly
      cleanupMicRef.current = watchStreamEnded(micStream, () => {
        store.setStreamError({
          code:        "STREAM_ENDED",
          message:     "Microphone stream ended",
          recoverable: true,
          suggestion:  "Click Reconnect to resume.",
        });
        store.setIsCapturing(false);
      });

    } catch (err) {
      isStartedRef.current = false;
      const message = err instanceof Error ? err.message : "Audio start failed";
      store.setStreamError({
        code:        "UNKNOWN",
        message,
        recoverable: true,
        suggestion:  "Refresh the page and try again.",
      });
    }
  }, [opts.micDeviceId, opts.enableSystemAudio]);

  // ── Handle final utterance ────────────────────────────────────

  function handleUtterance(utterance: TranscriptUtterance): void {
    const enriched = processUtteranceForDiarization(utterance);

    // WPM update for candidate utterances
    if (enriched.speaker === "candidate") {
      wpmRef.current?.processText(enriched.text);
      fillerAccRef.current?.processText(
        enriched.text,
        enriched.start_ms / 1000
      );
    }

    // Trigger hint generation if interviewer asked a question
    if (enriched.is_interviewer_question) {
      silenceRef.current?.onInterviewerUtteranceEnd(enriched.text);
    }
  }

  // ── Stop the full pipeline ────────────────────────────────────

  const stop = useCallback(() => {
    isStartedRef.current = false;

    // Deepgram
    deepgramRef.current?.disconnect();
    deepgramRef.current = null;

    // VAD
    vadRef.current?.stop();
    vadRef.current = null;

    // Silence detector
    silenceRef.current?.destroy();
    silenceRef.current = null;

    // Level analyser
    levelAnalyserRef.current?.disconnect();
    levelAnalyserRef.current = null;

    // Accumulator refs
    fillerAccRef.current = null;
    fillerRTRef.current  = null;
    wpmRef.current       = null;

    // Stream cleanup listeners
    cleanupMicRef.current?.();
    cleanupSysRef.current?.();
    cleanupMicRef.current = null;
    cleanupSysRef.current = null;

    // Stop streams + AudioContext
    const store = useAudioStore.getState();
    stopStream(store.streams.mic_stream);
    stopStream(store.streams.system_stream);
    stopStream(store.streams.combined_stream);
    teardownAudioContext();

    store.resetAudio();
  }, []);

  // ── Mute/unmute ───────────────────────────────────────────────

  const toggleMute = useCallback(() => {
    const store = useAudioStore.getState();
    const stream = store.streams.mic_stream;
    if (!stream) return;
    const muted = !store.is_muted;
    stream.getAudioTracks().forEach((t) => (t.enabled = !muted));
    store.setIsMuted(muted);
  }, []);

  // ── Reconnect ─────────────────────────────────────────────────

  const reconnect = useCallback(async () => {
    stop();
    await new Promise((r) => setTimeout(r, 500));
    await start();
  }, [start, stop]);

  // ── Get filler summary ────────────────────────────────────────

  const getFillerSnapshot = useCallback(() => {
    return fillerAccRef.current?.getSnapshot() ?? [];
  }, []);

  const getWPMDataPoints = useCallback(() => {
    return wpmRef.current?.getDataPoints() ?? [];
  }, []);

  const getAverageWPM = useCallback(() => {
    return wpmRef.current?.getAverageWPM() ?? 0;
  }, []);

  // ── Cleanup on unmount ────────────────────────────────────────

  useEffect(() => {
    return () => {
      stop();
    };
  }, []);

  return {
    start,
    stop,
    reconnect,
    toggleMute,
    getFillerSnapshot,
    getWPMDataPoints,
    getAverageWPM,
    isCapturing,
    isMuted,
    deepgramStatus,
    currentLevel,
    isSpeaking,
    streamError,
  };
}
