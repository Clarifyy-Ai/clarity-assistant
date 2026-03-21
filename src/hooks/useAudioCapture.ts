import { useCallback, useRef } from "react";
import { useAudioStore } from "@/store/audioStore";
import { startMicCapture, stopMicCapture } from "@/lib/audio/micCapture";
import { startSystemAudioCapture, stopSystemAudioCapture } from "@/lib/audio/systemAudioCapture";
import { mixStreams } from "@/lib/audio/audioMixer";

// ─────────────────────────────────────────────────────────────────
// useAudioCapture
// Manages mic + system-audio streams. Actions use .getState() so
// callbacks are stable (no store object in dependency arrays).
// Reactive state uses individual selectors to avoid subscribing to
// the whole store — prevents excess re-renders during live audio.
// ─────────────────────────────────────────────────────────────────

export function useAudioCapture() {
  // ── Reactive state (individual selectors) ──────────────────────
  const streams  = useAudioStore((s) => s.streams);
  const isMuted  = useAudioStore((s) => s.is_muted);

  // ── Stream refs ────────────────────────────────────────────────
  const micRef   = useRef<MediaStream | null>(null);
  const sysRef   = useRef<MediaStream | null>(null);
  const mixedRef = useRef<MediaStream | null>(null);

  // ── Actions — use .getState() inside callbacks for stability ───

  const startMic = useCallback(async (
    deviceId?: string | null
  ): Promise<{ error: string | null }> => {
    const store = useAudioStore.getState();
    try {
      const stream = await startMicCapture(deviceId);
      micRef.current = stream;
      store.setMicStream(stream);
      store.setIsCapturing(true);
      return { error: null };
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Mic access denied";
      store.setStreamError({
        code: "PERMISSION_DENIED",
        message: msg,
        recoverable: true,
        suggestion: "Check your browser permissions",
      });
      return { error: msg };
    }
  }, []);

  const startSystemAudio = useCallback(async (): Promise<{ error: string | null }> => {
    const store = useAudioStore.getState();
    try {
      const stream = await startSystemAudioCapture();
      sysRef.current = stream;
      store.setSystemStream(stream);
      return { error: null };
    } catch (err) {
      const msg = err instanceof Error ? err.message : "System audio unavailable";
      store.setStreamError({
        code: "SYSTEM_AUDIO_NOT_SUPPORTED",
        message: msg,
        recoverable: false,
        suggestion: "System audio capture may not be supported in this browser",
      });
      return { error: msg };
    }
  }, []);

  const buildMixedStream = useCallback((): MediaStream | null => {
    const store = useAudioStore.getState();
    const mixed = mixStreams(micRef.current, sysRef.current);
    mixedRef.current = mixed;
    if (mixed) store.setCombinedStream(mixed);
    return mixed;
  }, []);

  const stopAll = useCallback((): void => {
    stopMicCapture(micRef.current);
    stopSystemAudioCapture(sysRef.current);
    mixedRef.current?.getTracks().forEach((t) => t.stop());
    micRef.current  = null;
    sysRef.current  = null;
    mixedRef.current = null;
    useAudioStore.getState().stopAllStreams();
  }, []);

  const setMuted = useCallback((muted: boolean): void => {
    micRef.current?.getAudioTracks().forEach((t) => { t.enabled = !muted; });
    useAudioStore.getState().setIsMuted(muted);
  }, []);

  const getDevices = useCallback(async (): Promise<MediaDeviceInfo[]> => {
    const devices = await navigator.mediaDevices.enumerateDevices();
    return devices.filter((d) => d.kind === "audioinput");
  }, []);

  return {
    startMic,
    startSystemAudio,
    buildMixedStream,
    stopAll,
    setMuted,
    getDevices,
    micStream:    streams?.mic_stream    ?? null,
    systemStream: streams?.system_stream ?? null,
    mixedStream:  streams?.combined_stream ?? null,
    isMicActive:  streams?.is_capturing  ?? false,
    isMuted:      isMuted                ?? false,
    micError:     streams?.error?.message ?? null,
    systemError:  null,
  };
}
