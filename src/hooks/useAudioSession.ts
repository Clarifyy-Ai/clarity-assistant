// src/hooks/useAudioSession.ts
import { useEffect, useRef, useCallback } from "react";
import { FillerAccumulator, RealTimeFillerCounter } from "@/lib/audio/fillerDetector";
import { useAudioStore } from "@/store/audioStore";
import { useSessionStore } from "@/store/sessionStore";
import { useOverlayStore } from "@/store/overlayStore";
import {
  captureMicrophone,
  captureSystemAudio,
  createLevelAnalyser,
  stopStream,
  teardownAudioContext,
  watchStreamEnded,
  watchAudioDevices,
  isSystemAudioSupported,
} from "@/lib/audio/audioCapture";
import { confirmTabAudioCapture } from "@/lib/audio/tabAudioGuide";
import { DeepgramStreamClient } from "@/lib/audio/deepgramStream";
import { processUtteranceForDiarization } from "@/lib/audio/diarization";
import { VADDetector, SilenceBoundaryDetector } from "@/lib/audio/vadDetector";
import { WPMTracker } from "@/lib/audio/wpmTracker";
import { toast } from "sonner";
import type { Speaker, TranscriptUtterance } from "@/types/audio.types";

// ─────────────────────────────────────────────────────────────────
// useAudioSession — master pipeline:
// mic + system audio → Deepgram → diarization → VAD → filler → WPM → stores
// ─────────────────────────────────────────────────────────────────

interface UseAudioSessionOptions {
  enableSystemAudio?: boolean;
  micDeviceId?: string | null;
  noiseSuppression?: boolean;
  autoGainControl?: boolean;
  /** When true, mic/transcription failures do not block mock practice. */
  micOptional?: boolean;
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
  const deepgramMicRef = useRef<DeepgramStreamClient | null>(null);
  const deepgramSystemRef = useRef<DeepgramStreamClient | null>(null);
  const vadRef = useRef<VADDetector | null>(null);
  const silenceRef = useRef<SilenceBoundaryDetector | null>(null);
  const fillerAccRef = useRef<FillerAccumulator | null>(null);
  const fillerRTRef = useRef<RealTimeFillerCounter | null>(null);
  const wpmRef = useRef<WPMTracker | null>(null);
  const levelAnalyserRef = useRef<ReturnType<typeof createLevelAnalyser> | null>(null);
  const cleanupMicRef = useRef<(() => void) | null>(null);
  const cleanupSysRef = useRef<(() => void) | null>(null);
  const cleanupDevicesRef = useRef<(() => void) | null>(null);
  const toggleSystemAudioRef = useRef<(() => Promise<void>) | null>(null);
  const isStartedRef = useRef(false);
  const levelTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const lastAudioAtRef = useRef(0);

  // ── Handle final utterance ────────────────────────────────────
  const handleUtterance = useCallback(
    (utterance: TranscriptUtterance, forcedSpeaker?: Speaker) => {
      const store = useAudioStore.getState();

      const enriched = processUtteranceForDiarization(utterance, {
        forcedSpeaker,
      });
      store.addUtterance(enriched);
      store.setPipelineStatus("transcribing");

      if (enriched.speaker) {
        store.setCurrentSpeaker(enriched.speaker);
      }

      if (enriched.speaker === "candidate") {
        wpmRef.current?.processText(enriched.text);
        fillerAccRef.current?.processText(enriched.text, enriched.start_ms / 1000);
      }

      if (enriched.is_interviewer_question) {
        store.setLastQuestion(enriched.text);
        silenceRef.current?.onInterviewerUtteranceEnd(enriched.text);
      }
    },
    [],
  );

  const connectDeepgram = useCallback(
    async (
      stream: MediaStream,
      forcedSpeaker: Speaker,
      onInterim?: (text: string) => void,
    ): Promise<DeepgramStreamClient> => {
      const store = useAudioStore.getState();
      const client = new DeepgramStreamClient({
        stream,
        config: {
          model: "nova-2-meeting",
          filler_words: true,
          interim_results: true,
          utterance_end_ms: 1200,
        },
        onUtterance: (u) => handleUtterance(u, forcedSpeaker),
        onInterim: (text) => {
          store.setPipelineStatus("transcribing");
          if (onInterim) onInterim(text);
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
          if (status === "connecting") store.setPipelineStatus("connecting");
          else if (status === "reconnecting") store.setPipelineStatus("reconnecting");
          else if (status === "connected") store.setPipelineStatus("listening");
          else if (status === "error") store.setPipelineStatus("unavailable");
          else if (status === "disconnected" && isStartedRef.current) {
            store.setPipelineStatus("microphone_only");
          }
        },
      });
      await client.connect();
      return client;
    },
    [handleUtterance],
  );

  // ── Start pipeline ────────────────────────────────────────────
  const start = useCallback(async () => {
    if (isStartedRef.current) return;
    isStartedRef.current = true;

    const store = useAudioStore.getState();
    store.setIsCapturing(false);
    store.setStreamError(null);
    store.setPipelineStatus("requesting_permission");
    store.setDeepgramStatus("connecting");
    useOverlayStore.getState().setSessionPipelineState("connecting");

    try {
      // 1) mic
      const micStream = await captureMicrophone(opts.micDeviceId, {
        noiseSuppression: opts.noiseSuppression ?? true,
        autoGainControl: opts.autoGainControl ?? true,
      });
      store.setMicStream(micStream);

      // 2) optional system audio — separate stream + Deepgram channel (P1-A)
      let sysStream: MediaStream | null = null;
      if (opts.enableSystemAudio && isSystemAudioSupported()) {
        const proceed = await confirmTabAudioCapture();
        if (proceed) {
          try {
            sysStream = await captureSystemAudio();
            store.setSystemStream(sysStream);
            store.setSystemAudioAvailable(true);

            cleanupSysRef.current = watchStreamEnded(sysStream, () => {
              deepgramSystemRef.current?.disconnect();
              deepgramSystemRef.current = null;
              store.setSystemStream(null);
              toast.warning("Tab audio stopped. Interviewer speech may no longer be captured.");
            });
          } catch (err) {
            const message = err instanceof Error ? err.message : "Tab audio capture failed";
            const isNoAudioTrack =
              (err as { code?: string } | null)?.code === "NO_SHARE_AUDIO_TICKED";
            store.setSystemAudioAvailable(false);
            store.setStreamError({
              code: "SYSTEM_AUDIO_FAILED",
              message,
              recoverable: true,
              suggestion: isNoAudioTrack
                ? "In the share dialog, tick \"Share tab audio\" (or \"Share audio\") before clicking Share."
                : "Share the interview tab and check \"Share tab audio\", then retry from the toolbar.",
            });
            toast.error(
              isNoAudioTrack
                ? "Interviewer audio not captured — \"Share tab audio\" wasn't ticked."
                : "Interviewer audio not captured — only your mic is active.",
              {
                duration: Infinity,
                action: {
                  label: "Retry",
                  onClick: () => { void toggleSystemAudioRef.current?.(); },
                },
              }
            );
            toast.warning(
              "Without tab audio, the coach cannot hear the interviewer — use Chat or enable tab audio from the toolbar.",
              { duration: Infinity },
            );
          }
        } else {
          store.setSystemAudioAvailable(false);
          toast.message("Continuing with mic only. Enable tab audio from the toolbar to capture the interviewer.");
          toast.warning(
            "Without tab audio, the coach cannot hear the interviewer — use Chat or enable tab audio from the toolbar.",
            { duration: Infinity },
          );
        }
      } else if (opts.enableSystemAudio && !isSystemAudioSupported()) {
        store.setSystemAudioAvailable(false);
        store.setStreamError({
          code: "SYSTEM_AUDIO_NOT_SUPPORTED",
          message: "Tab audio requires Chrome or Edge.",
          recoverable: false,
          suggestion: "Use Chrome/Edge and join the interview in a browser tab.",
        });
        toast.warning(
          "Tab audio is not supported in this browser. Only your microphone will be transcribed. Type a question in the Chat tab as a fallback.",
        );
      }

      store.setCombinedStream(micStream);
      store.setIsCapturing(true);
      store.setPipelineStatus("connecting");
      cleanupDevicesRef.current = watchAudioDevices(() => {
        const track = micStream.getAudioTracks()[0];
        if (!track || track.readyState === "ended") {
          store.setIsCapturing(false);
          store.setPipelineStatus("unavailable");
          store.setStreamError({
            code: "DEVICE_NOT_FOUND",
            message: "The selected microphone was disconnected.",
            recoverable: true,
            suggestion: "Reconnect the microphone or select another device.",
          });
        }
      });

      // 3) analyser → VAD (mic only — candidate speech metrics)
      const analyser = createLevelAnalyser(micStream);
      levelAnalyserRef.current = analyser;
      lastAudioAtRef.current = Date.now();
      levelTimerRef.current = setInterval(() => {
        const level = analyser.getLevel();
        const currentStore = useAudioStore.getState();
        currentStore.setCurrentLevel(level);
        currentStore.setIsSpeaking(level > 0.015);
        if (level > 0.01) {
          lastAudioAtRef.current = Date.now();
          currentStore.setPipelineStatus("receiving_audio");
        } else if (Date.now() - lastAudioAtRef.current > 10_000 && currentStore.deepgram_status === "connected") {
          currentStore.setPipelineStatus("unavailable");
          useOverlayStore.getState().setSessionPipelineState("audio_unavailable");
          currentStore.setStreamError({
            code: "UNKNOWN",
            message: "No microphone audio detected.",
            recoverable: true,
            suggestion: "Check the selected microphone and speak near it.",
          });
        }
      }, 100);

      const vad = new VADDetector({
        onSpeechStart: () => {
          silenceRef.current?.onCandidateSpeechStart();
          useOverlayStore.getState().setSessionPipelineState("speech_detected");
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
      const silenceSeconds =
        useOverlayStore.getState().auto_answer_silence_seconds ?? 3;
      const silenceBoundary = new SilenceBoundaryDetector(
        (question) => {
          useOverlayStore.getState().setSessionPipelineState("transcribing");
          opts.onQuestionDetected(question);
        },
        Math.max(1000, Math.min(10000, silenceSeconds * 1000)),
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

      // 7) dual Deepgram — mic = candidate, system = interviewer
      try {
        deepgramMicRef.current = await connectDeepgram(
          micStream,
          "candidate",
          (text) => {
            store.updateInterimText(text);
            fillerRTRef.current?.check(text);
          },
        );

        if (sysStream) {
          deepgramSystemRef.current = await connectDeepgram(
            sysStream,
            "interviewer",
          );
        }

        store.setDeepgramStatus("connected");
        store.setPipelineStatus("listening");
        useOverlayStore.getState().setSessionPipelineState("listening");
      } catch (dgErr) {
        console.warn("[useAudioSession] Deepgram unavailable — mic-only mode:", dgErr);
        store.setDeepgramStatus("disconnected");
        store.setPipelineStatus("microphone_only");
        const dgMsg =
          dgErr instanceof Error
            ? dgErr.message
            : "Live transcription unavailable";
        if (!opts.micOptional) {
          store.setStreamError({
            code: "UNKNOWN",
            message: dgMsg,
            recoverable: true,
            suggestion:
              "Type questions in Chat, or retry listening from the toolbar.",
          });
          useOverlayStore.getState().setSessionPipelineState("audio_unavailable");
          toast.error(
            "Live transcription is off. Type a question in the Chat tab to get hints.",
            { duration: Infinity },
          );
        } else {
          useOverlayStore.getState().setSessionPipelineState("listening");
        }
      }

      // 8) watch mic end
      cleanupMicRef.current = watchStreamEnded(micStream, () => {
        store.setStreamError({
          code: "STREAM_ENDED",
          message: "Microphone stream ended",
          recoverable: true,
          suggestion: "Click Reconnect to resume.",
        });
        store.setIsCapturing(false);
        store.setPipelineStatus("unavailable");
        useOverlayStore.getState().setSessionPipelineState("audio_unavailable");
      });
    } catch (err) {
      isStartedRef.current = false;
      const message = err instanceof Error ? err.message : "Audio start failed";

      if (opts.micOptional) {
        store.setStreamError(null);
        store.setDeepgramStatus("disconnected");
        store.setIsCapturing(false);
        store.setPipelineStatus("text_only");
        toast.message("Mic unavailable — continue with text chat and AI hints.");
        return;
      }

      store.setStreamError({
        code: "UNKNOWN",
        message,
        recoverable: true,
        suggestion: "Allow microphone access in browser settings, then retry.",
      });
      store.setDeepgramStatus("error");
      store.setPipelineStatus("unavailable");
      const denied =
        /permission|denied|notallowed|not allowed/i.test(message);
      useOverlayStore
        .getState()
        .setSessionPipelineState(denied ? "permission_denied" : "audio_unavailable");
    }
  }, [opts.micDeviceId, opts.noiseSuppression, opts.autoGainControl, opts.enableSystemAudio, opts.micOptional, opts.onQuestionDetected, opts.onFillerDetected, opts.onWPMUpdate, handleUtterance, connectDeepgram]);

  // ── Stop pipeline ─────────────────────────────────────────────
  const stop = useCallback(() => {
    isStartedRef.current = false;
    if (levelTimerRef.current) {
      clearInterval(levelTimerRef.current);
      levelTimerRef.current = null;
    }

    deepgramMicRef.current?.disconnect();
    deepgramMicRef.current = null;
    deepgramSystemRef.current?.disconnect();
    deepgramSystemRef.current = null;

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
    cleanupDevicesRef.current?.();
    cleanupMicRef.current = null;
    cleanupSysRef.current = null;
    cleanupDevicesRef.current = null;

    const store = useAudioStore.getState();
    stopStream(store.streams.mic_stream);
    stopStream(store.streams.system_stream);
    stopStream(store.streams.combined_stream);
    teardownAudioContext();

    store.resetAudio();
    store.setPipelineStatus("ended");
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

  const setNoiseSuppression = useCallback(async (enabled: boolean) => {
    const store = useAudioStore.getState();
    const stream = store.streams.mic_stream;
    if (!stream) return;
    await Promise.all(
      stream.getAudioTracks().map((track) =>
        track.applyConstraints({ noiseSuppression: enabled }).catch(() => undefined),
      ),
    );
  }, []);

  // ── Toggle system audio at runtime ───────────────────────────
  const toggleSystemAudio = useCallback(async () => {
    const store = useAudioStore.getState();
    const currentSysStream = store.streams.system_stream;

    // stop sys audio
    if (currentSysStream) {
      deepgramSystemRef.current?.disconnect();
      deepgramSystemRef.current = null;
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

      const proceed = await confirmTabAudioCapture();
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

    const micStream = store.streams.mic_stream;
    if (!micStream) return;

    store.setCombinedStream(micStream);

    if (store.streams.system_stream) {
      try {
        deepgramSystemRef.current = await connectDeepgram(
          store.streams.system_stream,
          "interviewer",
        );
      } catch (err) {
        const message = err instanceof Error ? err.message : "System audio failed";
        store.setStreamError({
          code: "SYSTEM_AUDIO_FAILED",
          message,
          recoverable: true,
          suggestion: "Share the interview tab with \"Share tab audio\" enabled.",
        });
      }
    }
  }, [connectDeepgram]);

  // Expose toggleSystemAudio to the `start` closure (for "Retry" toast action)
  useEffect(() => {
    toggleSystemAudioRef.current = toggleSystemAudio;
  }, [toggleSystemAudio]);

  const isSystemAudioActive = useAudioStore((s) => s.streams.system_stream !== null);

  // ── Reconnect ─────────────────────────────────────────────────
  const reconnect = useCallback(async () => {
    useOverlayStore.getState().setSessionPipelineState("reconnecting");
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
      toast.warning("Still only hearing your mic — interviewer audio isn't being captured.", {
        duration: Infinity,
        action: {
          label: "Enable tab audio",
          onClick: () => { void toggleSystemAudioRef.current?.(); },
        },
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
    setNoiseSuppression,
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
