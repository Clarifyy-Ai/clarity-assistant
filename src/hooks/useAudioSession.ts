// src/hooks/useAudioSession.ts
import { useEffect, useRef, useCallback } from "react";
import { FillerAccumulator, RealTimeFillerCounter } from "@/lib/audio/fillerDetector";
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
import { confirmTabAudioCapture } from "@/lib/audio/tabAudioGuide";
import { DeepgramStreamClient } from "@/lib/audio/deepgramStream";
import { processUtteranceForDiarization } from "@/lib/audio/diarization";
import { VADDetector, SilenceBoundaryDetector } from "@/lib/audio/vadDetector";
import { WPMTracker } from "@/lib/audio/wpmTracker";
import { toast } from "sonner";
import type { TranscriptUtterance } from "@/types/audio.types";

// ─────────────────────────────────────────────────────────────────
// useAudioSession — master pipeline:
// mic + system audio → Deepgram → diarization → VAD → filler → WPM → stores
// ─────────────────────────────────────────────────────────────────

interface UseAudioSessionOptions {
  enableSystemAudio?: boolean;
  micDeviceId?: string | null;
  onQuestionDetected: (question: string) => void;
  onFillerDetected: (count: number) => void;
  onWPMUpdate: (wpm: number) => void;
}

export function useAudioSession(opts: UseAudioSessionOptions) {
  // reactive selectors
  const isCapturing = useAudioStore((s) => s.streams?.is_capturing ?? false);
  const isMuted = useAudioStore((s) => s.is_muted ?? false);
  const deepgramStatus = useAudioStore((s) => s.deepgram_status ?? "disconnected");
  const currentLevel = useAudioStore((s) => s.levels?.current_level ?? 0);
  const isSpeaking = useAudioStore((s) => s.levels?.is_speaking ?? false);
  const streamError = useAudioStore((s) => s.streams?.error ?? null);

  // refs
  const deepgramRef = useRef<DeepgramStreamClient | null>(null);
  const vadRef = useRef<VADDetector | null>(null);
  const silenceRef = useRef<SilenceBoundaryDetector | null>(null);
  const fillerAccRef = useRef<FillerAccumulator | null>(null);
  const fillerRTRef = useRef<RealTimeFillerCounter | null>(null);
  const wpmRef = useRef<WPMTracker | null>(null);
  const levelAnalyserRef = useRef<ReturnType<typeof createLevelAnalyser> | null>(null);
  const cleanupMicRef = useRef<(() => void) | null>(null);
  const cleanupSysRef = useRef<(() => void) | null>(null);
  const isStartedRef = useRef(false);

  // ── Handle final utterance ────────────────────────────────────
  const handleUtterance = useCallback(
    (utterance: TranscriptUtterance) => {
      const store = useAudioStore.getState();

      const enriched = processUtteranceForDiarization(utterance);
      // processUtteranceForDiarization already persists to audioStore

      // keep current speaker updated for UI/metrics
      if (enriched.speaker) {
        store.setCurrentSpeaker(enriched.speaker);
      }

      // WPM + filler update for candidate speech
      if (enriched.speaker === "candidate") {
        wpmRef.current?.processText(enriched.text);
        fillerAccRef.current?.processText(enriched.text, enriched.start_ms / 1000);
      }

      // Trigger hint generation if interviewer asked a question
      if (enriched.is_interviewer_question) {
        // Keep a record of last question in transcript state too
        store.setLastQuestion(enriched.text);
        silenceRef.current?.onInterviewerUtteranceEnd(enriched.text);
      }
    },
    [],
  );

  // ── Start pipeline ────────────────────────────────────────────
  const start = useCallback(async () => {
    if (isStartedRef.current) return;
    isStartedRef.current = true;

    const store = useAudioStore.getState();
    store.setIsCapturing(false);
    store.setStreamError(null);
    store.setDeepgramStatus("connecting");

    try {
      // 1) mic
      const micStream = await captureMicrophone(opts.micDeviceId);
      store.setMicStream(micStream);

      // 2) optional system audio (interviewer via tab share)
      let combinedStream = micStream;
      if (opts.enableSystemAudio && isSystemAudioSupported()) {
        const proceed = confirmTabAudioCapture();
        if (proceed) {
          try {
            const sysStream = await captureSystemAudio();
            store.setSystemStream(sysStream);
            store.setSystemAudioAvailable(true);
            combinedStream = mergeAudioStreams(micStream, sysStream);

            cleanupSysRef.current = watchStreamEnded(sysStream, () => {
              store.setSystemStream(null);
              toast.warning("Tab audio stopped. Interviewer speech may no longer be captured.");
            });
          } catch (err) {
            const message = err instanceof Error ? err.message : "Tab audio capture failed";
            store.setSystemAudioAvailable(false);
            store.setStreamError({
              code: "SYSTEM_AUDIO_FAILED",
              message,
              recoverable: true,
              suggestion: "Share the interview tab and check \"Share tab audio\", then retry from the toolbar.",
            });
            toast.error(
              "Interviewer audio not captured — only your mic is active. Use the toolbar to retry tab audio.",
              { duration: 6000 }
            );
          }
        } else {
          store.setSystemAudioAvailable(false);
          toast.message("Continuing with mic only. Enable tab audio from the toolbar to capture the interviewer.");
        }
      } else if (opts.enableSystemAudio && !isSystemAudioSupported()) {
        store.setSystemAudioAvailable(false);
        store.setStreamError({
          code: "SYSTEM_AUDIO_NOT_SUPPORTED",
          message: "Tab audio requires Chrome or Edge.",
          recoverable: false,
          suggestion: "Use Chrome/Edge and join the interview in a browser tab.",
        });
        toast.warning("Tab audio is not supported in this browser. Only your microphone will be transcribed.");
      }

      store.setCombinedStream(combinedStream);
      store.setIsCapturing(true);

      // 3) analyser → VAD
      const analyser = createLevelAnalyser(combinedStream);
      levelAnalyserRef.current = analyser;

      const vad = new VADDetector({
        onSpeechStart: () => {
          silenceRef.current?.onCandidateSpeechStart();
        },
        onSpeechEnd: () => {
          const wpm = wpmRef.current?.getCurrentWPM() ?? 0;
          opts.onWPMUpdate(wpm);
          useSessionStore.getState().setCurrentWPM(wpm);
        },
      });
      vadRef.current = vad;
      vad.start(analyser.getLevel);

      // 4) silence boundary — triggers question detection
      const silenceBoundary = new SilenceBoundaryDetector(
        (question) => opts.onQuestionDetected(question),
        1200,
      );
      silenceRef.current = silenceBoundary;

      // 5) filler
      fillerAccRef.current = new FillerAccumulator();
      fillerRTRef.current = new RealTimeFillerCounter((count) => {
        opts.onFillerDetected(count);
      });

      // 6) wpm
      const wpmTracker = new WPMTracker((wpm) => {
        opts.onWPMUpdate(wpm);
        useSessionStore.getState().setCurrentWPM(wpm);
      });
      wpmRef.current = wpmTracker;
      wpmTracker.start();

      // 7) deepgram
      const deepgram = new DeepgramStreamClient({
        stream: combinedStream,
        config: {
          model: "nova-2-meeting",
          filler_words: true,
          interim_results: true,
          utterance_end_ms: 1200,
          // NOTE: diarize is handled by the client’s internal plan gate.
          // If you want to force it, do it in deepgramStream.ts.
        },
        onUtterance: (u) => handleUtterance(u),
        onInterim: (text) => {
          store.updateInterimText(text);
          fillerRTRef.current?.check(text);
        },
        onError: (error) => {
          store.setStreamError({
            code: "DEEPGRAM_CONNECTION_FAILED",
            message: error.message,
            recoverable: true,
            suggestion: "Check your internet connection.",
          });
        },
        onStatusChange: (status) => {
          store.setDeepgramStatus(status);
        },
      });

      deepgramRef.current = deepgram;
      await deepgram.connect();

      // 8) watch mic end
      cleanupMicRef.current = watchStreamEnded(micStream, () => {
        store.setStreamError({
          code: "STREAM_ENDED",
          message: "Microphone stream ended",
          recoverable: true,
          suggestion: "Click Reconnect to resume.",
        });
        store.setIsCapturing(false);
      });
    } catch (err) {
      isStartedRef.current = false;
      const message = err instanceof Error ? err.message : "Audio start failed";
      store.setStreamError({
        code: "UNKNOWN",
        message,
        recoverable: true,
        suggestion: "Refresh the page and try again.",
      });
      store.setDeepgramStatus("error");
    }
  }, [opts.micDeviceId, opts.enableSystemAudio, opts.onQuestionDetected, opts.onFillerDetected, opts.onWPMUpdate, handleUtterance]);

  // ── Stop pipeline ─────────────────────────────────────────────
  const stop = useCallback(() => {
    isStartedRef.current = false;

    // deepgram
    deepgramRef.current?.disconnect();
    deepgramRef.current = null;

    // vad
    vadRef.current?.stop();
    vadRef.current = null;

    // silence
    silenceRef.current?.destroy();
    silenceRef.current = null;

    // analyser
    levelAnalyserRef.current?.disconnect();
    levelAnalyserRef.current = null;

    fillerAccRef.current = null;
    fillerRTRef.current = null;

    wpmRef.current?.reset?.();
    wpmRef.current = null;

    cleanupMicRef.current?.();
    cleanupSysRef.current?.();
    cleanupMicRef.current = null;
    cleanupSysRef.current = null;

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

  // ── Toggle system audio at runtime ───────────────────────────
  const toggleSystemAudio = useCallback(async () => {
    const store = useAudioStore.getState();
    const currentSysStream = store.streams.system_stream;

    // stop sys audio
    if (currentSysStream) {
      cleanupSysRef.current?.();
      cleanupSysRef.current = null;
      stopStream(currentSysStream);
      store.setSystemStream(null);
    } else {
      // start sys audio
      if (!isSystemAudioSupported()) {
        store.setStreamError({
          code: "SYSTEM_AUDIO_NOT_SUPPORTED",
          message: "System audio capture is only supported in Chrome and Edge.",
          recoverable: false,
          suggestion: "Please use Chrome or Edge to capture interviewer audio.",
        });
        return;
      }

      const proceed = confirmTabAudioCapture();
      if (!proceed) return;

      try {
        const sysStream = await captureSystemAudio();
        store.setSystemStream(sysStream);
        store.setSystemAudioAvailable(true);

        cleanupSysRef.current = watchStreamEnded(sysStream, () => {
          store.setSystemStream(null);
        });
      } catch (err) {
        const message = err instanceof Error ? err.message : "System audio capture failed";
        store.setStreamError({
          code: "SYSTEM_AUDIO_FAILED",
          message,
          recoverable: true,
          suggestion: "Make sure you selected 'Share audio' in the dialog. Try again.",
        });
        store.setSystemAudioAvailable(false);
        return;
      }
    }

    // rebuild combined stream
    const micStream = store.streams.mic_stream;
    const sysStream = store.streams.system_stream;
    if (!micStream) return;

    const combined = sysStream ? mergeAudioStreams(micStream, sysStream) : micStream;
    store.setCombinedStream(combined);

    // rebuild analyser (keep VAD working)
    const levelAnalyser = createLevelAnalyser(combined);
    levelAnalyserRef.current?.disconnect();
    levelAnalyserRef.current = levelAnalyser;

    // restart deepgram cleanly
    deepgramRef.current?.disconnect();
    deepgramRef.current = null;

    const deepgram = new DeepgramStreamClient({
      stream: combined,
      config: {
        model: "nova-2-meeting",
        filler_words: true,
        interim_results: true,
        utterance_end_ms: 1200,
      },
      onUtterance: (u) => handleUtterance(u),
      onInterim: (text) => {
        store.updateInterimText(text);
        fillerRTRef.current?.check(text);
      },
      onError: (error) => {
        store.setStreamError({
          code: "DEEPGRAM_CONNECTION_FAILED",
          message: error.message,
          recoverable: true,
          suggestion: "Check your internet connection.",
        });
      },
      onStatusChange: (status) => {
        store.setDeepgramStatus(status);
      },
    });

    deepgramRef.current = deepgram;
    await deepgram.connect();
  }, [handleUtterance]);

  const isSystemAudioActive = useAudioStore((s) => s.streams.system_stream !== null);

  // ── Reconnect ─────────────────────────────────────────────────
  const reconnect = useCallback(async () => {
    stop();
    await new Promise((r) => setTimeout(r, 500));
    await start();
  }, [start, stop]);

  // ── Snapshot helpers ──────────────────────────────────────────
  const getFillerSnapshot = useCallback(() => fillerAccRef.current?.getSnapshot() ?? [], []);
  const getWPMDataPoints = useCallback(() => wpmRef.current?.getDataPoints() ?? [], []);
  const getAverageWPM = useCallback(() => wpmRef.current?.getAverageWPM() ?? 0, []);

  // Warn if interviewer audio likely missing after warm-up
  useEffect(() => {
    if (!isStartedRef.current) return;

    const timer = setTimeout(() => {
      const store = useAudioStore.getState();
      if (store.streams.system_stream) return;

      const utterances = store.transcript?.utterances ?? [];
      const hasInterviewer = utterances.some(
        (u) => u.speaker === "interviewer" || u.is_interviewer_question
      );
      if (hasInterviewer) return;

      store.setStreamError({
        code: "SYSTEM_AUDIO_FAILED",
        message: "Interviewer audio not detected — only your microphone is active.",
        recoverable: true,
        suggestion: "Share the interview tab with \"Share tab audio\" enabled using the toolbar button.",
      });
    }, 25_000);

    return () => clearTimeout(timer);
  }, []);

  // cleanup on unmount
  useEffect(() => {
    return () => {
      stop();
    };
  }, [stop]);

  return {
    start,
    stop,
    reconnect,
    toggleMute,
    toggleSystemAudio,
    isSystemAudioActive,
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
