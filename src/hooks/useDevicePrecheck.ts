import { useCallback, useEffect, useRef, useState } from "react";
import type { AudioDevice } from "@/types/audio.types";
import { runLocalMicCheck } from "@/lib/audio/localMicPrecheck";
import { checkSttHealth } from "@/lib/audio/sttHealthCheck";
import {
  cancelSpeakerTest,
  disposeSpeakerTestResources,
  enumerateAudioOutputDevices,
  isSpeakerTestPlaying,
  runSpeakerTest,
} from "@/lib/audio/speakerTest";
import {
  loadPersistedMicDeviceId,
  loadPersistedSpeakerDeviceId,
  persistMicDeviceId,
  persistSpeakerDeviceId,
  supportsOutputDeviceSelection,
} from "@/lib/audio/micDevicePersistence";
import { invalidateAudioDeviceCache } from "@/lib/audio/audioDeviceCache";
import {
  MicState,
  SpeakerState,
  SttState,
  createOperationGuard,
} from "@/lib/audio/precheckStates";

export type UseDevicePrecheckOptions = {
  enabled: boolean;
  autoRunMic?: boolean;
  autoRunSttAfterMic?: boolean;
};

export function useDevicePrecheck({
  enabled,
  autoRunMic = true,
  autoRunSttAfterMic = true,
}: UseDevicePrecheckOptions) {
  const [micState, setMicState] = useState<MicState>(MicState.NOT_CHECKED);
  const [speakerState, setSpeakerState] = useState<SpeakerState>(SpeakerState.NOT_CHECKED);
  const [sttState, setSttState] = useState<SttState>(SttState.STT_NOT_CHECKED);
  const [micDevices, setMicDevices] = useState<AudioDevice[]>([]);
  const [speakerDevices, setSpeakerDevices] = useState<AudioDevice[]>([]);
  const [selectedMicId, setSelectedMicId] = useState<string | null>(() => loadPersistedMicDeviceId());
  const [selectedSpeakerId, setSelectedSpeakerId] = useState<string | null>(() =>
    loadPersistedSpeakerDeviceId(),
  );
  const [deviceLabel, setDeviceLabel] = useState<string | null>(null);
  const [peakRms, setPeakRms] = useState(0);
  const [usedFallback, setUsedFallback] = useState(false);
  const [micError, setMicError] = useState<string | null>(null);
  const [sttMessage, setSttMessage] = useState<string | null>(null);

  const mountedRef = useRef(true);
  const micGuard = useRef(createOperationGuard());
  const speakerGuard = useRef(createOperationGuard());
  const sttGuard = useRef(createOperationGuard());
  const micAbortRef = useRef<AbortController | null>(null);
  const sttAbortRef = useRef<AbortController | null>(null);
  const selectedMicIdRef = useRef(selectedMicId);
  selectedMicIdRef.current = selectedMicId;
  const selectedSpeakerIdRef = useRef(selectedSpeakerId);
  selectedSpeakerIdRef.current = selectedSpeakerId;
  const autoStartedRef = useRef(false);

  const outputSelectable = supportsOutputDeviceSelection();

  const cleanupPending = useCallback(() => {
    micGuard.current.invalidate();
    speakerGuard.current.invalidate();
    sttGuard.current.invalidate();
    micAbortRef.current?.abort();
    sttAbortRef.current?.abort();
    cancelSpeakerTest();
  }, []);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      cleanupPending();
      void disposeSpeakerTestResources();
    };
  }, [cleanupPending]);

  const runSttCheck = useCallback(async () => {
    const op = sttGuard.current.next();
    sttAbortRef.current?.abort();
    const ac = new AbortController();
    sttAbortRef.current = ac;
    setSttState(SttState.STT_CHECKING);
    setSttMessage(null);
    try {
      const result = await checkSttHealth({ signal: ac.signal });
      if (!mountedRef.current || !op.isCurrent()) return result;
      setSttState(result.state);
      setSttMessage(result.message);
      return result;
    } catch {
      if (!mountedRef.current || !op.isCurrent()) return null;
      setSttState(SttState.STT_NOT_CHECKED);
      return null;
    }
  }, []);

  const runMicCheck = useCallback(
    async (deviceId?: string | null) => {
      const op = micGuard.current.next();
      micAbortRef.current?.abort();
      const ac = new AbortController();
      micAbortRef.current = ac;
      setMicState(MicState.CHECKING);
      setMicError(null);
      setPeakRms(0);

      try {
        const result = await runLocalMicCheck({
          deviceId: deviceId === undefined ? selectedMicIdRef.current : deviceId,
          signal: ac.signal,
        });
        if (!mountedRef.current || !op.isCurrent()) return result;

        invalidateAudioDeviceCache();
        setMicState(result.state);
        setMicDevices(result.devices);
        setPeakRms(result.peakRms);
        setUsedFallback(result.usedFallback);
        setDeviceLabel(result.deviceLabel);
        setMicError(result.error ?? null);

        if (result.deviceId) {
          setSelectedMicId(result.deviceId);
          persistMicDeviceId(result.deviceId);
        }

        if (result.state === MicState.READY || result.state === MicState.NO_SIGNAL) {
          try {
            const outputs = await enumerateAudioOutputDevices();
            if (mountedRef.current && op.isCurrent()) {
              setSpeakerDevices(outputs);
              setSelectedSpeakerId((prev) => {
                if (prev && outputs.some((d) => d.deviceId === prev)) return prev;
                const next = outputs.find((d) => d.isDefault)?.deviceId ?? outputs[0]?.deviceId ?? null;
                if (next) persistSpeakerDeviceId(next);
                return next;
              });
            }
          } catch {
            // Output enumeration is best-effort.
          }
        }

        if (
          autoRunSttAfterMic &&
          (result.state === MicState.READY || result.state === MicState.NO_SIGNAL)
        ) {
          void runSttCheck();
        }

        return result;
      } catch (err) {
        if (err instanceof DOMException && err.name === "AbortError") {
          return null;
        }
        if (!mountedRef.current || !op.isCurrent()) return null;
        setMicState(MicState.ERROR);
        setMicError(err instanceof Error ? err.message : "Microphone check failed");
        return null;
      }
    },
    [autoRunSttAfterMic, runSttCheck],
  );

  const runSpeakerCheck = useCallback(async () => {
    if (isSpeakerTestPlaying()) {
      cancelSpeakerTest();
    }
    const op = speakerGuard.current.next();
    setSpeakerState(SpeakerState.CHECKING);
    try {
      const result = await runSpeakerTest(selectedSpeakerIdRef.current);
      if (!mountedRef.current || !op.isCurrent()) return result;
      setSpeakerState(result.state);
      return result;
    } catch {
      if (!mountedRef.current || !op.isCurrent()) return null;
      setSpeakerState(SpeakerState.ERROR);
      return null;
    }
  }, []);

  const changeMicDevice = useCallback(
    (deviceId: string) => {
      setSelectedMicId(deviceId);
      persistMicDeviceId(deviceId);
      void runMicCheck(deviceId);
    },
    [runMicCheck],
  );

  const changeSpeakerDevice = useCallback((deviceId: string) => {
    setSelectedSpeakerId(deviceId);
    persistSpeakerDeviceId(deviceId);
    setSpeakerState(SpeakerState.NOT_CHECKED);
  }, []);

  useEffect(() => {
    if (!enabled) {
      autoStartedRef.current = false;
      cleanupPending();
      return;
    }
    if (!autoRunMic || autoStartedRef.current) return;
    autoStartedRef.current = true;
    void runMicCheck(loadPersistedMicDeviceId());
  }, [enabled, autoRunMic, cleanupPending, runMicCheck]);

  useEffect(() => {
    if (!enabled || typeof navigator === "undefined" || !navigator.mediaDevices?.addEventListener) {
      return;
    }
    const onChange = () => {
      void runMicCheck(selectedMicIdRef.current);
    };
    navigator.mediaDevices.addEventListener("devicechange", onChange);
    return () => navigator.mediaDevices.removeEventListener("devicechange", onChange);
  }, [enabled, runMicCheck]);

  return {
    micState,
    speakerState,
    sttState,
    micDevices,
    speakerDevices,
    selectedMicId,
    selectedSpeakerId,
    deviceLabel,
    peakRms,
    usedFallback,
    micError,
    sttMessage,
    outputSelectable,
    speakerPlaying: speakerState === SpeakerState.CHECKING,
    runMicCheck,
    runSpeakerCheck,
    runSttCheck,
    changeMicDevice,
    changeSpeakerDevice,
    recheckAll: () => {
      void runMicCheck();
    },
  };
}
