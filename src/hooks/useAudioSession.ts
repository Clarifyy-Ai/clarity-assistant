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
// useAudioSession — Live dual-channel pipeline:
//   mic  → Deepgram (forced candidate)
//   tab  → Deepgram (forced interviewer)  [optional]
// Do NOT mix streams for Live STT. Mock uses mic-only (enableSystemAudio: false).
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
  const isCapturing = useAudioStore((s) => s.streams?.is_capturing ?? false);
  const isMuted = useAudioStore((s) => s.is_muted ?? false);
  const deepgramStatus = useAudioStore((s) => s.deepgram_status ?? "disconnected");
  const currentLevel = useAudioStore((s) => s.levels?.current_level ?? 0);
  const isSpeaking = useAudioStore((s) => s.levels?.is_speaking ?? false);
  const streamError = useAudioStore((s) => s.streams?.error ?? null);

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
  /** True while a dedicated interviewer (tab) Deepgram client is connected. */
  const hasInterviewerChannelRef = useRef(false);
  const optsRef = useRef(opts);
  optsRef.current = opts;

  const markInterviewerChannel = useCallback((active: boolean) => {
    hasInterviewerChannelRef.current = active;
    const store = useAudioStore.getState();
    store.setSystemAudioAvailable(active);
    if (active) {
      if (store.pipeline_status === "microphone_only") {
        store.setPipelineStatus("listening");
      }
    } else if (isStartedRef.current && store.deepgram_status === "connected") {
      store.setPipelineStatus("microphone_only");
    }
  }, []);

  const handleUtterance = useCallback(
    (utterance: TranscriptUtterance, forcedSpeaker?: Speaker) => {
      if (!isStartedRef.current) return;

      const store = useAudioStore.getState();
      const hasInterviewerChannel = hasInterviewerChannelRef.current;

      const enriched = processUtteranceForDiarization(utterance, {
        forcedSpeaker,
        hasInterviewerChannel,
      });
      store.setPipelineStatus("transcribing");

      if (enriched.speaker) {
        store.setCurrentSpeaker(enriched.speaker);
      }

      if (enriched.speaker === "candidate") {
        wpmRef.current?.processText(enriched.text);
        fillerAccRef.current?.processText(enriched.text, enriched.start_ms / 1000);
        // Cancel pending finalize only on real candidate finals (not VAD blips).
        silenceRef.current?.onCandidateSpeechStart();
        useOverlayStore.getState().setSessionPipelineState("speech_detected");
      }

      if (enriched.speaker === "interviewer") {
        silenceRef.current?.onInterviewerSpeaking();
        useOverlayStore.getState().setSessionPipelineState("tab_audio_detected");
      }

      if (enriched.is_interviewer_question && hasInterviewerChannel) {
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
          if (!isStartedRef.current) return;
          store.setPipelineStatus("transcribing");
          if (forcedSpeaker === "interviewer") {
            silenceRef.current?.onInterviewerSpeaking();
          }
          if (onInterim) onInterim(text);
        },
        onError: (error) => {
          if (!isStartedRef.current) return;
          store.setStreamError({
            code: "DEEPGRAM_CONNECTION_FAILED",
            message: error.message,
            recoverable: true,
            suggestion: "Check your internet connection.",
          });
        },
        onStatusChange: (status) => {
          if (!isStartedRef.current) return;
          if (forcedSpeaker === "candidate" || !deepgramMicRef.current) {
            store.setDeepgramStatus(status);
          }
          if (status === "connecting") store.setPipelineStatus("connecting");
          else if (status === "reconnecting") store.setPipelineStatus("reconnecting");
          else if (status === "connected") {
            store.setPipelineStatus(
              hasInterviewerChannelRef.current ? "listening" : "microphone_only",
            );
          } else if (status === "error") store.setPipelineStatus("unavailable");
          else if (status === "disconnected" && isStartedRef.current) {
            store.setPipelineStatus(
              hasInterviewerChannelRef.current ? "listening" : "microphone_only",
            );
          }
        },
      });
      await client.connect();
      return client;
    },
    [handleUtterance],
  );

  const start = useCallback(async () => {
    if (isStartedRef.current) return;
    isStartedRef.current = true;
    hasInterviewerChannelRef.current = false;

    const store = useAudioStore.getState();
    store.setIsCapturing(false);
    store.setStreamError(null);
    store.setMicState("requesting_permission");
    store.setTokenState("connecting");
    store.setPipelineStatus("requesting_permission");
    store.setDeepgramStatus("connecting");
    useOverlayStore.getState().setSessionPipelineState("connecting");

    try {
      const micStream = await captureMicrophone(opts.micDeviceId, {
        noiseSuppression: opts.noiseSuppression ?? true,
        autoGainControl: opts.autoGainControl ?? true,
      });
      store.setMicStream(micStream);
      store.setMicState("ready");

      let sysStream: MediaStream | null = null;
      if (opts.enableSystemAudio && isSystemAudioSupported()) {
        const proceed = await confirmTabAudioCapture();
        if (proceed) {
          try {
            sysStream = await captureSystemAudio();
            store.setSystemStream(sysStream);

            cleanupSysRef.current = watchStreamEnded(sysStream, () => {
              if (!isStartedRef.current) return;
              deepgramSystemRef.current?.disconnect();
              deepgramSystemRef.current = null;
              store.setSystemStream(null);
              markInterviewerChannel(false);
              useOverlayStore.getState().setSessionPipelineState("audio_unavailable");
              toast.warning(
                "Interviewer audio unavailable — tab share stopped. Share again to detect interviewer questions.",
                {
                  duration: Infinity,
                  action: {
                    label: "Retry",
                    onClick: () => {
                      void toggleSystemAudioRef.current?.();
                    },
                  },
                },
              );
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
                ? 'In the share dialog, tick "Share tab audio" (or "Share audio") before clicking Share.'
                : 'Share the interview tab and check "Share tab audio", then retry from the toolbar.',
            });
            toast.error(
              isNoAudioTrack
                ? 'Interviewer audio unavailable — "Share tab audio" wasn\'t ticked.'
                : "Interviewer audio unavailable — only your mic is active.",
              {
                duration: Infinity,
                action: {
                  label: "Retry",
                  onClick: () => {
                    void toggleSystemAudioRef.current?.();
                  },
                },
              },
            );
            toast.warning(
              "Mic-only mode: interviewer questions will not auto-detect. Use Chat or Generate, or enable tab audio.",
              { duration: Infinity },
            );
          }
        } else {
          store.setSystemAudioAvailable(false);
          toast.message(
            "Continuing with mic only. Enable tab audio from the toolbar to capture the interviewer.",
          );
          toast.warning(
            "Interviewer audio unavailable — coach cannot auto-detect interviewer questions until tab audio is shared.",
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
          "Interviewer audio unavailable in this browser. Only your microphone will be transcribed. Type a question in Chat as a fallback.",
        );
      }

      // combined_stream is mic-only for analyser/legacy — NOT a mix for Deepgram.
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

      const analyser = createLevelAnalyser(micStream);
      levelAnalyserRef.current = analyser;
      lastAudioAtRef.current = Date.now();
      levelTimerRef.current = setInterval(() => {
        if (!isStartedRef.current) return;
        const level = analyser.getLevel();
        const currentStore = useAudioStore.getState();
        currentStore.setCurrentLevel(level);
        currentStore.setIsSpeaking(level > 0.015);
        if (level > 0.01) {
          lastAudioAtRef.current = Date.now();
          if (
            currentStore.pipeline_status !== "microphone_only" &&
            currentStore.pipeline_status !== "transcribing"
          ) {
            currentStore.setPipelineStatus("receiving_audio");
          }
        } else if (
          Date.now() - lastAudioAtRef.current > 10_000 &&
          currentStore.deepgram_status === "connected"
        ) {
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
          useOverlayStore.getState().setSessionPipelineState("speech_detected");
        },
        onSpeechEnd: () => {
          const wpm = wpmRef.current?.getCurrentWPM() ?? 0;
          optsRef.current.onWPMUpdate(wpm);
          useSessionStore.getState().setCurrentWPM(wpm);
        },
      });
      vadRef.current = vad;
      vad.start(analyser.getLevel);

      const silenceSeconds =
        useOverlayStore.getState().auto_answer_silence_seconds ?? 3;
      const silenceBoundary = new SilenceBoundaryDetector(
        (question) => {
          if (!isStartedRef.current) return;
          if (!hasInterviewerChannelRef.current) return;
          useOverlayStore.getState().setSessionPipelineState("question_detected");
          optsRef.current.onQuestionDetected(question);
        },
        Math.max(1000, Math.min(10000, silenceSeconds * 1000)),
      );
      silenceRef.current = silenceBoundary;

      fillerAccRef.current = new FillerAccumulator();
      fillerRTRef.current = new RealTimeFillerCounter((count) => {
        optsRef.current.onFillerDetected(count);
      });

      const wpmTracker = new WPMTracker((wpm) => {
        optsRef.current.onWPMUpdate(wpm);
        useSessionStore.getState().setCurrentWPM(wpm);
      });
      wpmRef.current = wpmTracker;
      wpmTracker.start();

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
          deepgramSystemRef.current = await connectDeepgram(sysStream, "interviewer");
          markInterviewerChannel(true);
        } else if (opts.enableSystemAudio) {
          markInterviewerChannel(false);
          store.setPipelineStatus("microphone_only");
        }

        store.setDeepgramStatus("connected");
        store.setTokenState("ready");
        if (hasInterviewerChannelRef.current) {
          store.setPipelineStatus("listening");
        } else {
          store.setPipelineStatus(
            opts.enableSystemAudio ? "microphone_only" : "listening",
          );
        }
        useOverlayStore.getState().setSessionPipelineState("listening");
      } catch (dgErr) {
        console.warn("[useAudioSession] Deepgram unavailable — mic-only mode:", dgErr);
        store.setDeepgramStatus("error");
        store.setTokenState("failed");
        store.setPipelineStatus("microphone_only");
        store.setMicState("ready");
        markInterviewerChannel(false);
        if (!opts.micOptional) {
          useOverlayStore.getState().setSessionPipelineState("audio_unavailable");
          toast.message(
            "Transcription unavailable — your microphone still works. Type questions in Chat.",
            { duration: 8000 },
          );
        } else {
          useOverlayStore.getState().setSessionPipelineState("listening");
        }
      }

      cleanupMicRef.current = watchStreamEnded(micStream, () => {
        if (!isStartedRef.current) return;
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
      hasInterviewerChannelRef.current = false;
      const message = err instanceof Error ? err.message : "Audio start failed";

      if (opts.micOptional) {
        store.setStreamError(null);
        store.setDeepgramStatus("disconnected");
        store.setTokenState("idle");
        store.setMicState("not_checked");
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
      store.setTokenState("failed");
      store.setPipelineStatus("unavailable");
      const denied = /permission|denied|notallowed|not allowed/i.test(message);
      store.setMicState(denied ? "permission_denied" : "error");
      useOverlayStore
        .getState()
        .setSessionPipelineState(denied ? "permission_denied" : "audio_unavailable");
    }
  }, [
    opts.micDeviceId,
    opts.noiseSuppression,
    opts.autoGainControl,
    opts.enableSystemAudio,
    opts.micOptional,
    connectDeepgram,
    markInterviewerChannel,
  ]);

  const stop = useCallback(() => {
    isStartedRef.current = false;
    hasInterviewerChannelRef.current = false;

    if (levelTimerRef.current) {
      clearInterval(levelTimerRef.current);
      levelTimerRef.current = null;
    }

    deepgramMicRef.current?.disconnect();
    deepgramMicRef.current = null;
    deepgramSystemRef.current?.disconnect();
    deepgramSystemRef.current = null;

    vadRef.current?.stop();
    vadRef.current = null;

    silenceRef.current?.destroy();
    silenceRef.current = null;

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

  const toggleMute = useCallback(() => {
    const store = useAudioStore.getState();
    const stream = store.streams.mic_stream;
    if (!stream) return;

    const muted = !store.is_muted;
    stream.getAudioTracks().forEach((t) => {
      t.enabled = !muted;
    });
    store.setIsMuted(muted);
  }, []);

  /**
   * Temporarily disable mic tracks without flipping user mute UI.
   * Mock Interview uses this while INTERVIEWER_AUDIO (TTS) plays so echo
   * is not transcribed as CANDIDATE_AUDIO. Live Copilot should not call this.
   */
  const suspendCandidateCapture = useCallback(() => {
    const store = useAudioStore.getState();
    const stream = store.streams.mic_stream;
    if (!stream) return;
    stream.getAudioTracks().forEach((t) => {
      t.enabled = false;
    });
    store.updateInterimText("");
  }, []);

  /** Re-enable mic tracks unless the user explicitly muted. */
  const resumeCandidateCapture = useCallback(() => {
    const store = useAudioStore.getState();
    if (store.is_muted) return;
    const stream = store.streams.mic_stream;
    if (!stream) return;
    stream.getAudioTracks().forEach((t) => {
      t.enabled = true;
    });
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

  const toggleSystemAudio = useCallback(async () => {
    if (!isStartedRef.current) return;
    const store = useAudioStore.getState();
    const currentSysStream = store.streams.system_stream;

    if (currentSysStream) {
      deepgramSystemRef.current?.disconnect();
      deepgramSystemRef.current = null;
      cleanupSysRef.current?.();
      cleanupSysRef.current = null;
      stopStream(currentSysStream);
      store.setSystemStream(null);
      markInterviewerChannel(false);
      toast.message(
        "Interviewer audio unavailable — mic-only. Share tab audio to resume detection.",
      );
      return;
    }

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

      cleanupSysRef.current = watchStreamEnded(sysStream, () => {
        if (!isStartedRef.current) return;
        deepgramSystemRef.current?.disconnect();
        deepgramSystemRef.current = null;
        store.setSystemStream(null);
        markInterviewerChannel(false);
        toast.warning("Interviewer audio unavailable — tab share ended.");
      });

      deepgramSystemRef.current = await connectDeepgram(sysStream, "interviewer");
      markInterviewerChannel(true);
      store.setPipelineStatus("listening");
      useOverlayStore.getState().setSessionPipelineState("listening");
      toast.success("Interviewer (tab) audio connected.");
    } catch (err) {
      const message = err instanceof Error ? err.message : "System audio capture failed";
      store.setStreamError({
        code: "SYSTEM_AUDIO_FAILED",
        message,
        recoverable: true,
        suggestion: "Make sure you selected 'Share audio' in the dialog. Try again.",
      });
      markInterviewerChannel(false);
    }
  }, [connectDeepgram, markInterviewerChannel]);

  useEffect(() => {
    toggleSystemAudioRef.current = toggleSystemAudio;
  }, [toggleSystemAudio]);

  const isSystemAudioActive = useAudioStore((s) => s.streams.system_stream !== null);

  const reconnect = useCallback(async () => {
    useOverlayStore.getState().setSessionPipelineState("reconnecting");
    stop();
    await new Promise((r) => setTimeout(r, 500));
    await start();
  }, [start, stop]);

  const getFillerSnapshot = useCallback(
    () => fillerAccRef.current?.getSnapshot() ?? [],
    [],
  );
  const getWPMDataPoints = useCallback(
    () => wpmRef.current?.getDataPoints() ?? [],
    [],
  );
  const getAverageWPM = useCallback(() => wpmRef.current?.getAverageWPM() ?? 0, []);

  useEffect(() => {
    if (!opts.enableSystemAudio) return;

    const timer = setTimeout(() => {
      if (!isStartedRef.current) return;
      if (hasInterviewerChannelRef.current) return;

      const store = useAudioStore.getState();
      store.setStreamError({
        code: "SYSTEM_AUDIO_FAILED",
        message: "Interviewer audio unavailable — only your microphone is active.",
        recoverable: true,
        suggestion:
          'Share the interview tab with "Share tab audio" enabled using the toolbar button.',
      });
      store.setPipelineStatus("microphone_only");
      toast.warning("Interviewer audio unavailable — still mic-only after warm-up.", {
        duration: Infinity,
        action: {
          label: "Enable tab audio",
          onClick: () => {
            void toggleSystemAudioRef.current?.();
          },
        },
      });
    }, 25_000);

    return () => clearTimeout(timer);
  }, [opts.enableSystemAudio]);

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
    suspendCandidateCapture,
    resumeCandidateCapture,
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
