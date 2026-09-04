// src/hooks/useAudioSession.ts
import { useEffect, useRef, useCallback, useMemo } from "react";
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
import {
  isMicrophoneAccessError,
  MIC_DENIED_RECOVERY,
  MIC_NO_DEVICE_RECOVERY,
} from "@/lib/audio/micPermission";
import { getMicPermissionState } from "@/lib/validators/audioValidator";
import {
  createLiveTranscriptionService,
  channelToSpeaker,
  newUtteranceFromSegment,
  type LiveTranscriptionService,
  type TranscriptionChannel,
} from "@/lib/audio/transcription";
import { loadPersistedMicDeviceId } from "@/lib/audio/micDevicePersistence";
import { generateId } from "@/lib/utils";
import { processUtteranceForDiarization } from "@/lib/audio/diarization";
import { resolvePostMicSttPipeline } from "@/lib/audio/interviewerChannelState";
import { VADDetector, SilenceBoundaryDetector } from "@/lib/audio/vadDetector";
import { WPMTracker } from "@/lib/audio/wpmTracker";
import { toast } from "sonner";
import type { Speaker, TranscriptUtterance, TranscriptionProviderStatus } from "@/types/audio.types";
import { joinRecentInterviewerText } from "@/lib/session/aiHelpConfirm";
import {
  buildChannelHealth,
  ENERGY_THRESHOLD,
  EMPTY_CHANNEL_METRICS,
  emptyChannelHealth,
  isChannelUiActive,
  mergeFrameHealth,
  readTrackFlags,
  type AudioChannelMetrics,
} from "@/lib/audio/audioChannelHealth";

function mapProviderToHealthStt(
  status: TranscriptionProviderStatus | string | undefined,
): AudioChannelMetrics["sttStatus"] {
  switch (status) {
    case "connecting":
      return "connecting";
    case "connected":
      return "connected";
    case "reconnecting":
      return "reconnecting";
    case "error":
      return "error";
    case "unavailable":
      return "unavailable";
    default:
      return "idle";
  }
}


// ─────────────────────────────────────────────────────────────────
// useAudioSession — Live dual-channel pipeline:
//   mic  → LiveTranscriptionService / Deepgram (forced candidate)
//   tab  → LiveTranscriptionService / Deepgram (forced interviewer)  [optional]
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

export type AudioStartOptions = {
  /** Restore/reconnect: reuse granted permission and skip the tab-share picker. */
  restore?: boolean;
};

export type AudioStopOptions = {
  /** Keep transcript/utterances (pause, reconnect). Default false = full teardown. */
  preserveTranscript?: boolean;
  /** Release cached deepgram-token after session end. */
  releaseToken?: boolean;
};

export function useAudioSession(opts: UseAudioSessionOptions) {
  const isCapturing = useAudioStore((s) => s.streams?.is_capturing ?? false);
  const isMuted = useAudioStore((s) => s.is_muted ?? false);
  const deepgramStatus = useAudioStore((s) => s.deepgram_status ?? "disconnected");
  const streamError = useAudioStore((s) => s.streams?.error ?? null);

  const transcriptionServiceRef = useRef<LiveTranscriptionService | null>(null);
  const vadRef = useRef<VADDetector | null>(null);
  const silenceRef = useRef<SilenceBoundaryDetector | null>(null);
  const fillerAccRef = useRef<FillerAccumulator | null>(null);
  const fillerRTRef = useRef<RealTimeFillerCounter | null>(null);
  const wpmRef = useRef<WPMTracker | null>(null);
  const levelAnalyserRef = useRef<ReturnType<typeof createLevelAnalyser> | null>(null);
  const systemLevelAnalyserRef = useRef<ReturnType<typeof createLevelAnalyser> | null>(null);
  const healthTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const interviewerMonitorStartedAtRef = useRef<number | null>(null);
  const micMonitorStartedAtRef = useRef<number | null>(null);
  const systemRmsRef = useRef(0);
  const systemLastEnergyAtRef = useRef<number | null>(null);
  const micLastEnergyAtRef = useRef<number | null>(null);
  const silentSourceToastShownRef = useRef(false);
  const interviewerConnectFailedRef = useRef(false);
  const cleanupMicRef = useRef<(() => void) | null>(null);
  const cleanupSysRef = useRef<(() => void) | null>(null);
  const cleanupDevicesRef = useRef<(() => void) | null>(null);
  const toggleSystemAudioRef = useRef<(() => Promise<void>) | null>(null);
  const isStartedRef = useRef(false);
  const skipAutoTabShareRef = useRef(false);
  const levelTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const lastAudioAtRef = useRef(0);
  /** True while a dedicated interviewer (tab) Deepgram client is connected. */
  const hasInterviewerChannelRef = useRef(false);
  /** Frozen interviewer text from the last AI Help click (stable confirm window). */
  const frozenInterviewerSnapshotRef = useRef<string | null>(null);
  const optsRef = useRef(opts);
  optsRef.current = opts;

  const markInterviewerChannel = useCallback((active: boolean) => {
    hasInterviewerChannelRef.current = active;
    const store = useAudioStore.getState();
    store.setInterviewerChannelActive(active);
    store.setSystemAudioAvailable(active);
    if (active) {
      interviewerConnectFailedRef.current = false;
      interviewerMonitorStartedAtRef.current = Date.now();
      silentSourceToastShownRef.current = false;
      if (store.pipeline_status === "microphone_only") {
        store.setPipelineStatus("listening");
      }
    } else if (isStartedRef.current && store.deepgram_status === "connected") {
      store.setPipelineStatus("microphone_only");
      interviewerMonitorStartedAtRef.current = null;
      store.patchChannelHealth("interviewer", emptyChannelHealth());
    }
    if (!active) {
      store.resetInterviewerCaptureHealth();
      systemLevelAnalyserRef.current?.disconnect();
      systemLevelAnalyserRef.current = null;
      systemRmsRef.current = 0;
      systemLastEnergyAtRef.current = null;
    }
  }, []);

  const publishChannelHealth = useCallback(() => {
    if (!isStartedRef.current) return;
    const store = useAudioStore.getState();
    const service = transcriptionServiceRef.current;
    const now = Date.now();

    const sysAnalyser = systemLevelAnalyserRef.current;
    if (sysAnalyser) {
      const sysLevel = sysAnalyser.getLevel();
      systemRmsRef.current = sysLevel;
      if (sysLevel >= ENERGY_THRESHOLD) {
        systemLastEnergyAtRef.current = now;
      }
    }

    const micProbe = service?.getChannelHealthProbe("candidate");
    const micStream = store.streams.mic_stream;
    const micTrack = readTrackFlags(micStream);
    let micMetrics: AudioChannelMetrics = {
      ...EMPTY_CHANNEL_METRICS,
      ...micTrack,
      rmsLevel: store.levels?.current_level ?? 0,
      lastEnergyAt: micLastEnergyAtRef.current,
      sttStatus: mapProviderToHealthStt(
        micProbe?.sttStatus ?? store.transcription_provider_status,
      ),
      lastTranscriptEventAt: micProbe?.lastTranscriptEventAt ?? null,
      monitoringStartedAt: micMonitorStartedAtRef.current,
      connectFailed: false,
      fatalError: false,
    };
    micMetrics = mergeFrameHealth(micMetrics, micProbe?.frames ?? null);
    store.patchChannelHealth("mic", buildChannelHealth(micMetrics, now));

    const intProbe = service?.getChannelHealthProbe("interviewer");
    const sysStream = store.streams.system_stream;
    const sysTrack = readTrackFlags(sysStream);
    let intMetrics: AudioChannelMetrics = {
      ...EMPTY_CHANNEL_METRICS,
      ...sysTrack,
      rmsLevel: systemRmsRef.current,
      lastEnergyAt: systemLastEnergyAtRef.current,
      sttStatus: mapProviderToHealthStt(intProbe?.sttStatus),
      lastTranscriptEventAt: intProbe?.lastTranscriptEventAt ?? null,
      monitoringStartedAt: interviewerMonitorStartedAtRef.current,
      connectFailed: interviewerConnectFailedRef.current,
      fatalError: false,
    };
    intMetrics = mergeFrameHealth(intMetrics, intProbe?.frames ?? null);
    const interviewerHealth = buildChannelHealth(intMetrics, now);
    store.patchChannelHealth("interviewer", interviewerHealth);

    if (
      interviewerHealth.status === "silent_source" &&
      !silentSourceToastShownRef.current
    ) {
      silentSourceToastShownRef.current = true;
      toast.warning(
        "Tab audio is connected but no interviewer speech is detected — check Share tab audio, meeting mute, or the shared surface.",
        { duration: 10_000 },
      );
    }
  }, []);

  const handleUtterance = useCallback(
    (utterance: TranscriptUtterance, forcedSpeaker?: Speaker) => {
      if (!isStartedRef.current) return;
      if (!utterance.is_final) return;

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

  const ensureTranscriptionService = useCallback((): LiveTranscriptionService => {
    if (transcriptionServiceRef.current) return transcriptionServiceRef.current;

    const sessionId =
      useSessionStore.getState().session_id ||
      generateId();

    const service = createLiveTranscriptionService({
      sessionId,
      callbacks: {
        onPartial: (segment, channel) => {
          if (!isStartedRef.current) return;
          const store = useAudioStore.getState();
          store.updateInterimText(segment.text);
          if (channel === "interviewer") {
            silenceRef.current?.onInterviewerSpeaking();
          }
          if (channel === "candidate") {
            fillerRTRef.current?.check(segment.text);
          }
        },
        onFinal: (segment, channel) => {
          if (!isStartedRef.current) return;
          const utterance = newUtteranceFromSegment(segment, channel);
          handleUtterance(utterance, channelToSpeaker(channel));
        },
        onStatusChange: (status, channel) => {
          if (!isStartedRef.current && status !== "paused" && status !== "ended") return;
          const store = useAudioStore.getState();
          store.setTranscriptionProviderStatus(status);
          if (channel === "candidate" || channel === undefined) {
            if (status === "connecting") store.setDeepgramStatus("connecting");
            else if (status === "connected") store.setDeepgramStatus("connected");
            else if (status === "reconnecting") store.setDeepgramStatus("reconnecting");
            else if (status === "error" || status === "unavailable")
              store.setDeepgramStatus("error");
            else if (status === "paused" || status === "ended" || status === "idle")
              store.setDeepgramStatus("disconnected");
          }
          if (status === "connecting") store.setPipelineStatus("connecting");
          else if (status === "reconnecting") store.setPipelineStatus("reconnecting");
          else if (status === "connected") {
            store.setPipelineStatus(
              hasInterviewerChannelRef.current ? "listening" : "microphone_only",
            );
          } else if (status === "error" || status === "unavailable") {
            store.setPipelineStatus("unavailable");
          } else if (status === "paused") {
            store.setPipelineStatus("idle");
          } else if ((status as string) === "disconnected" && isStartedRef.current) {
            store.setPipelineStatus(
              hasInterviewerChannelRef.current ? "listening" : "microphone_only",
            );
          }
        },
        onError: (error, recoverable) => {
          if (!isStartedRef.current) return;
          const unavailable =
            (error as { code?: string }).code === "provider_unavailable" ||
            /unavailable/i.test(error.message);
          useAudioStore.getState().setStreamError({
            code: unavailable ? "DEEPGRAM_CONNECTION_FAILED" : "DEEPGRAM_CONNECTION_FAILED",
            message: error.message,
            recoverable,
            suggestion: recoverable
              ? "Check your internet connection or tap Reconnect."
              : "Live transcription is unavailable. Type questions in Chat.",
          });
        },
      },
    });

    transcriptionServiceRef.current = service;
    return service;
  }, [handleUtterance]);

  const connectTranscriptionChannel = useCallback(
    async (stream: MediaStream, channel: TranscriptionChannel): Promise<void> => {
      const store = useAudioStore.getState();
      store.setTokenState("connecting");
      try {
        const service = ensureTranscriptionService();
        if (!service.isProviderEnabled()) {
          throw new Error(
            "Live transcription is disabled. You can still type questions in Chat.",
          );
        }
        await service.connectChannel(stream, channel);
        store.setTokenState("ready");
      } catch (err) {
        store.setTokenState("failed");
        throw err;
      }
    },
    [ensureTranscriptionService],
  );

  const start = useCallback(async (startOpts?: AudioStartOptions) => {
    if (isStartedRef.current) return;
    isStartedRef.current = true;
    hasInterviewerChannelRef.current = false;
    const restore = Boolean(startOpts?.restore);
    skipAutoTabShareRef.current = restore;

    const store = useAudioStore.getState();
    store.setIsCapturing(false);
    store.setStreamError(null);
    store.setTokenState("connecting");
    store.setDeepgramStatus("connecting");
    store.setTranscriptionProviderStatus("connecting");
    useOverlayStore.getState().setSessionPipelineState("connecting");

    const permission = await getMicPermissionState();
    if (permission === "denied") {
      store.setMicState("permission_denied");
      store.setStreamError({
        code: "PERMISSION_DENIED",
        message: MIC_DENIED_RECOVERY,
        recoverable: false,
        suggestion: MIC_DENIED_RECOVERY,
      });
      if (opts.micOptional) {
        isStartedRef.current = false;
        store.setDeepgramStatus("disconnected");
        store.setTokenState("idle");
        store.setPipelineStatus("text_only");
        toast.message("Mic unavailable — continue with text chat and AI hints.");
        return;
      }
      store.setPipelineStatus("unavailable");
      useOverlayStore.getState().setSessionPipelineState("permission_denied");
      toast.message(MIC_DENIED_RECOVERY, { duration: 8000 });
      if (!restore) isStartedRef.current = false;
      return;
    }

    if (permission === "prompt") {
      store.setMicState("requesting_permission");
      store.setPipelineStatus("requesting_permission");
    } else {
      store.setMicState("not_checked");
      store.setPipelineStatus("connecting");
    }

    if (restore && permission !== "granted") {
      store.setMicState("not_checked");
      store.setPipelineStatus("idle");
      store.setDeepgramStatus("disconnected");
      store.setTokenState("idle");
      store.setStreamError(null);
      useOverlayStore.getState().setSessionPipelineState("idle");
      toast.message("Session restored. Enable your microphone when you are ready — audio is not requested automatically.");
      return;
    }

    try {
      const existingMic = store.streams.mic_stream;
      const existingLive =
        restore &&
        existingMic &&
        existingMic.getAudioTracks().some((t) => t.readyState === "live");
      const micStream = existingLive
        ? existingMic!
        : await captureMicrophone(opts.micDeviceId ?? loadPersistedMicDeviceId(), {
            noiseSuppression: opts.noiseSuppression ?? true,
            autoGainControl: opts.autoGainControl ?? true,
          });
      store.setMicStream(micStream);
      store.setMicState("ready");

      // Tab-share always prompts. Skip it on restore/reconnect so a granted
      // microphone is not followed by a second permission picker.
      if (opts.enableSystemAudio && isSystemAudioSupported() && !restore) {
        store.setSystemAudioAvailable(false);
        markInterviewerChannel(false);
        window.setTimeout(() => {
          if (!isStartedRef.current) return;
          if (hasInterviewerChannelRef.current) return;
          void toggleSystemAudioRef.current?.();
        }, 0);
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
      } else if (opts.enableSystemAudio && restore) {
        store.setSystemAudioAvailable(false);
        markInterviewerChannel(false);
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
      micMonitorStartedAtRef.current = Date.now();
      levelTimerRef.current = setInterval(() => {
        if (!isStartedRef.current) return;
        const level = analyser.getLevel();
        const currentStore = useAudioStore.getState();
        currentStore.setCurrentLevel(level);
        currentStore.setIsSpeaking(level > 0.015);
        if (level > ENERGY_THRESHOLD) {
          lastAudioAtRef.current = Date.now();
          micLastEnergyAtRef.current = Date.now();
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

      if (healthTimerRef.current) clearInterval(healthTimerRef.current);
      healthTimerRef.current = setInterval(() => {
        publishChannelHealth();
      }, 500);

      const vadNoiseFloor =
        useAudioStore.getState().vad_config?.noise_floor ?? 0.05;
      const vad = new VADDetector({
        config: {
          noise_floor: Math.max(0.01, Math.min(0.2, vadNoiseFloor)),
        },
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
        await connectTranscriptionChannel(micStream, "candidate");

        // Auto tab-share may already have connected interviewer (setTimeout(0)).
        // Never clear hasInterviewerChannelRef / force microphone_only in that case.
        const pipeline = resolvePostMicSttPipeline({
          enableSystemAudio: Boolean(opts.enableSystemAudio),
          interviewerChannelActive: hasInterviewerChannelRef.current,
        });
        store.setPipelineStatus(pipeline);

        store.setDeepgramStatus("connected");
        store.setTokenState("ready");
        useOverlayStore.getState().setSessionPipelineState("listening");
      } catch (sttErr) {
        console.warn("[useAudioSession] Live transcription unavailable:", sttErr);
        store.setDeepgramStatus("error");
        store.setTranscriptionProviderStatus("unavailable");
        store.setTokenState("failed");
        store.setPipelineStatus("unavailable");
        store.setMicState("ready");
        markInterviewerChannel(false);
        useOverlayStore.getState().setSessionPipelineState("audio_unavailable");
        toast.message(
          "Transcription unavailable — your microphone still works. Type questions in Chat.",
          { duration: 8000 },
        );
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
      hasInterviewerChannelRef.current = false;
      const access = isMicrophoneAccessError(err) ? err : null;
      const message = access?.message ?? (err instanceof Error ? err.message : "Audio start failed");
      const denied = access?.audioCode === "PERMISSION_DENIED";
      const noDevice = access?.audioCode === "DEVICE_NOT_FOUND";

      if (opts.micOptional) {
        isStartedRef.current = false;
        store.setStreamError(null);
        store.setDeepgramStatus("disconnected");
        store.setTokenState("idle");
        store.setMicState(denied ? "permission_denied" : noDevice ? "device_unavailable" : "not_checked");
        store.setIsCapturing(false);
        store.setPipelineStatus("text_only");
        toast.message(
          denied ? MIC_DENIED_RECOVERY : "Mic unavailable — continue with text chat and AI hints.",
        );
        return;
      }

      if (!restore) isStartedRef.current = false;

      store.setStreamError(
        access?.toAudioError() ?? {
          code: "UNKNOWN",
          message,
          recoverable: true,
          suggestion: "Allow microphone access in browser settings, then retry.",
        },
      );
      store.setDeepgramStatus("error");
      store.setTokenState("failed");
      store.setPipelineStatus("unavailable");
      store.setMicState(
        denied ? "permission_denied" : noDevice ? "device_unavailable" : "error",
      );
      useOverlayStore
        .getState()
        .setSessionPipelineState(denied ? "permission_denied" : "audio_unavailable");
      toast.message(
        denied
          ? MIC_DENIED_RECOVERY
          : noDevice
            ? MIC_NO_DEVICE_RECOVERY
            : message,
        { duration: 8000 },
      );
    }
  }, [
    opts.micDeviceId,
    opts.noiseSuppression,
    opts.autoGainControl,
    opts.enableSystemAudio,
    opts.micOptional,
    connectTranscriptionChannel,
    markInterviewerChannel,
    publishChannelHealth,
  ]);

  const stop = useCallback((stopOpts?: AudioStopOptions) => {
    const preserveTranscript = stopOpts?.preserveTranscript === true;
    isStartedRef.current = false;
    hasInterviewerChannelRef.current = false;
    useAudioStore.getState().setInterviewerChannelActive(false);
    useAudioStore.getState().resetInterviewerCaptureHealth();

    if (levelTimerRef.current) {
      clearInterval(levelTimerRef.current);
      levelTimerRef.current = null;
    }
    if (healthTimerRef.current) {
      clearInterval(healthTimerRef.current);
      healthTimerRef.current = null;
    }

    transcriptionServiceRef.current?.destroy({
      releaseTokenCache: stopOpts?.releaseToken === true,
    });
    transcriptionServiceRef.current = null;

    vadRef.current?.stop();
    vadRef.current = null;

    silenceRef.current?.destroy();
    silenceRef.current = null;

    levelAnalyserRef.current?.disconnect();
    levelAnalyserRef.current = null;
    systemLevelAnalyserRef.current?.disconnect();
    systemLevelAnalyserRef.current = null;
    micMonitorStartedAtRef.current = null;
    interviewerMonitorStartedAtRef.current = null;
    interviewerConnectFailedRef.current = false;
    silentSourceToastShownRef.current = false;

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

    if (preserveTranscript) {
      store.setMicStream(null);
      store.setSystemStream(null);
      store.setCombinedStream(null);
      store.setIsCapturing(false);
      store.setDeepgramStatus("disconnected");
      store.setTranscriptionProviderStatus("idle");
      store.setTokenState("idle");
      store.setPipelineStatus("idle");
      store.updateInterimText("");
    } else {
      frozenInterviewerSnapshotRef.current = null;
      store.resetAudio();
      store.setPipelineStatus("ended");
      store.setTranscriptionProviderStatus("ended");
    }
  }, []);

  const pause = useCallback(() => {
    if (!isStartedRef.current) return;
    transcriptionServiceRef.current?.pause();
    const store = useAudioStore.getState();
    store.setIsCapturing(false);
    store.setTranscriptionProviderStatus("paused");
    store.setDeepgramStatus("disconnected");
    store.setPipelineStatus("idle");
    store.updateInterimText("");
    useOverlayStore.getState().setSessionPipelineState("paused");
  }, []);

  const resume = useCallback(async () => {
    if (!isStartedRef.current) {
      await start({ restore: true });
      return;
    }
    const store = useAudioStore.getState();
    store.setIsCapturing(true);
    store.setTranscriptionProviderStatus("connecting");
    await transcriptionServiceRef.current?.resume();
    store.setDeepgramStatus("connected");
    useOverlayStore.getState().setSessionPipelineState("listening");
  }, [start]);

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

    if (currentSysStream || hasInterviewerChannelRef.current) {
      transcriptionServiceRef.current?.disconnectChannel("interviewer");
      cleanupSysRef.current?.();
      cleanupSysRef.current = null;
      if (currentSysStream) stopStream(currentSysStream);
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

    interviewerConnectFailedRef.current = false;
    store.patchChannelHealth(
      "interviewer",
      buildChannelHealth({
        ...EMPTY_CHANNEL_METRICS,
        hasStream: false,
        trackReadyState: "none",
        sttStatus: "connecting",
        monitoringStartedAt: Date.now(),
      }),
    );

    try {
      const sysStream = await captureSystemAudio();
      const track = sysStream.getAudioTracks()[0];
      if (!track || track.readyState !== "live") {
        stopStream(sysStream);
        throw Object.assign(new Error("Tab audio track is not live."), {
          code: "SYSTEM_AUDIO_FAILED",
        });
      }
      if (!track.enabled) {
        stopStream(sysStream);
        throw Object.assign(new Error("Tab audio track is disabled."), {
          code: "SYSTEM_AUDIO_FAILED",
        });
      }

      // Keep UI in connecting until STT connects — do not mark interviewer active yet.
      store.setSystemStream(sysStream);
      interviewerMonitorStartedAtRef.current = Date.now();
      systemLevelAnalyserRef.current?.disconnect();
      const sysAnalyser = createLevelAnalyser(sysStream);
      systemLevelAnalyserRef.current = sysAnalyser;

      cleanupSysRef.current = watchStreamEnded(sysStream, () => {
        if (!isStartedRef.current) return;
        transcriptionServiceRef.current?.disconnectChannel("interviewer");
        systemLevelAnalyserRef.current?.disconnect();
        systemLevelAnalyserRef.current = null;
        store.setSystemStream(null);
        markInterviewerChannel(false);
        toast.warning("Interviewer audio unavailable — tab share ended.");
        publishChannelHealth();
      });

      await connectTranscriptionChannel(sysStream, "interviewer");
      markInterviewerChannel(true);
      store.setPipelineStatus("listening");
      useOverlayStore.getState().setSessionPipelineState("listening");
      publishChannelHealth();
      toast.success("Interviewer (tab) audio connected — waiting for speech.");
    } catch (err) {
      cleanupSysRef.current?.();
      cleanupSysRef.current = null;
      systemLevelAnalyserRef.current?.disconnect();
      systemLevelAnalyserRef.current = null;
      const stale = useAudioStore.getState().streams.system_stream;
      if (stale) {
        stopStream(stale);
        useAudioStore.getState().setSystemStream(null);
      }
      interviewerConnectFailedRef.current = true;
      markInterviewerChannel(false);
      store.patchChannelHealth(
        "interviewer",
        buildChannelHealth({
          ...EMPTY_CHANNEL_METRICS,
          connectFailed: true,
          fatalError: false,
        }),
      );

      const tabMiss =
        err instanceof Error &&
        (err.name === "TabAudioCaptureError" ||
          (err as { code?: string }).code === "NO_SHARE_AUDIO_TICKED");
      const message = tabMiss
        ? err instanceof Error
          ? err.message
          : "Share tab audio was not enabled."
        : err instanceof Error
          ? err.message
          : typeof err === "object" &&
              err !== null &&
              "message" in err &&
              typeof (err as { message: unknown }).message === "string"
            ? (err as { message: string }).message
            : "System audio capture failed";
      store.setStreamError({
        code: "SYSTEM_AUDIO_FAILED",
        message,
        recoverable: true,
        suggestion: tabMiss
          ? "In the share dialog, select the interview tab and tick “Share tab audio”, then try again."
          : "Make sure you selected 'Share audio' in the dialog. Try again.",
      });
      toast.message(message, { duration: 8000 });
    }
  }, [connectTranscriptionChannel, markInterviewerChannel, publishChannelHealth]);

  useEffect(() => {
    toggleSystemAudioRef.current = toggleSystemAudio;
  }, [toggleSystemAudio]);

  const isSystemAudioActive = useAudioStore((s) =>
    isChannelUiActive(s.channel_health?.interviewer?.status ?? "disconnected"),
  );

  const reconnect = useCallback(async () => {
    useOverlayStore.getState().setSessionPipelineState("reconnecting");
    useAudioStore.getState().setTranscriptionProviderStatus("reconnecting");
    const service = transcriptionServiceRef.current;
    if (service && isStartedRef.current) {
      try {
        const store = useAudioStore.getState();
        const sys = store.streams.system_stream;
        if (sys && sys.getAudioTracks().every((t) => t.readyState === "ended")) {
          store.setSystemStream(null);
          markInterviewerChannel(false);
        }
        interviewerMonitorStartedAtRef.current = hasInterviewerChannelRef.current
          ? Date.now()
          : null;
        micMonitorStartedAtRef.current = Date.now();
        store.resetInterviewerCaptureHealth();
        await service.reconnectAll();
        useOverlayStore.getState().setSessionPipelineState("listening");
        publishChannelHealth();
        return;
      } catch {
        /* fall through to restore start */
      }
    }
    if (!isStartedRef.current) {
      await start({ restore: true });
    }
  }, [start, markInterviewerChannel, publishChannelHealth]);

  const getFillerSnapshot = useCallback(
    () => fillerAccRef.current?.getSnapshot() ?? [],
    [],
  );
  const getWPMDataPoints = useCallback(
    () => wpmRef.current?.getDataPoints() ?? [],
    [],
  );
  const getAverageWPM = useCallback(() => wpmRef.current?.getAverageWPM() ?? 0, []);

  /**
   * Freeze recent interviewer transcript for Manual AI Help.
   * Prefers LiveTranscriptionService ring buffer; falls back to audioStore utterances.
   */
  const snapshotRecentInterviewerTranscript = useCallback(
    (opts?: { maxChars?: number }) => {
      const maxChars = opts?.maxChars ?? 2_000;
      const fromService =
        transcriptionServiceRef.current?.snapshotRecentInterviewerTranscript(maxChars) ??
        "";
      const fromStore = joinRecentInterviewerText(
        useAudioStore.getState().transcript?.utterances,
        { maxChars },
      );
      const text = (fromService.trim() || fromStore).trim();
      frozenInterviewerSnapshotRef.current = text;
      return text;
    },
    [],
  );

  const getFrozenInterviewerTranscript = useCallback(
    () => frozenInterviewerSnapshotRef.current ?? "",
    [],
  );

  useEffect(() => {
    if (!opts.enableSystemAudio) return;

    const timer = setTimeout(() => {
      if (!isStartedRef.current) return;
      if (hasInterviewerChannelRef.current) return;
      if (skipAutoTabShareRef.current) return;

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

  return useMemo(
    () => ({
      start,
      stop,
      pause,
      resume,
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
      snapshotRecentInterviewerTranscript,
      getFrozenInterviewerTranscript,
      isCapturing,
      isMuted,
      deepgramStatus,
      /** Snapshot — do not subscribe here; 10 Hz analyser ticks must not remount session UI. */
      get currentLevel() {
        return useAudioStore.getState().levels?.current_level ?? 0;
      },
      get isSpeaking() {
        return useAudioStore.getState().levels?.is_speaking ?? false;
      },
      streamError,
    }),
    [
      start,
      stop,
      pause,
      resume,
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
      snapshotRecentInterviewerTranscript,
      getFrozenInterviewerTranscript,
      isCapturing,
      isMuted,
      deepgramStatus,
      streamError,
    ],
  );
}
