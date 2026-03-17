import { useCallback, useRef } from "react";
import { useAudioStore } from "@/store/audioStore";
import { createMicStream } from "@/lib/audio/micCapture";
import { createSystemAudioStream } from "@/lib/audio/systemAudioCapture";
import { mixAudioStreams } from "@/lib/audio/audioMixer";

export function useAudioCapture() {
  const audioStore  = useAudioStore();
  const micRef      = useRef<MediaStream | null>(null);
  const sysRef      = useRef<MediaStream | null>(null);
  const mixedRef    = useRef<MediaStream | null>(null);

  // ── Start mic capture ─────────────────────────────────────────

  const startMic = useCallback(async (
    deviceId?: string | null
  ): Promise<{ error: string | null }> => {
    try {
      const stream = await createMicStream(deviceId ?? undefined);
      micRef.current = stream;
      audioStore.setMicStream(stream);
      audioStore.setMicActive(true);
      return { error: null };
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Mic access denied";
      audioStore.setMicError(msg);
      return { error: msg };
    }
  }, []);

  // ── Start system audio capture ────────────────────────────────

  const startSystemAudio = useCallback(async (): Promise<{ error: string | null }> => {
    try {
      const stream = await createSystemAudioStream();
      sysRef.current = stream;
      audioStore.setSystemStream(stream);
      audioStore.setSystemAudioActive(true);
      return { error: null };
    } catch (err) {
      // Non-fatal — system audio is optional
      const msg = err instanceof Error ? err.message : "System audio unavailable";
      audioStore.setSystemAudioError(msg);
      return { error: msg };
    }
  }, []);

  // ── Mix streams together ──────────────────────────────────────

  const buildMixedStream = useCallback((): MediaStream | null => {
    const streams = [micRef.current, sysRef.current].filter(Boolean) as MediaStream[];
    if (!streams.length) return null;
    const mixed = mixAudioStreams(streams);
    mixedRef.current = mixed;
    audioStore.setMixedStream(mixed);
    return mixed;
  }, []);

  // ── Stop all ──────────────────────────────────────────────────

  const stopAll = useCallback((): void => {
    [micRef.current, sysRef.current, mixedRef.current].forEach((s) => {
      s?.getTracks().forEach((t) => t.stop());
    });
    micRef.current  = null;
    sysRef.current  = null;
    mixedRef.current = null;
    audioStore.clearStreams();
  }, []);

  // ── Mute / unmute mic ─────────────────────────────────────────

  const setMuted = useCallback((muted: boolean): void => {
    micRef.current?.getAudioTracks().forEach((t) => {
      t.enabled = !muted;
    });
    audioStore.setMuted(muted);
  }, []);

  // ── Enumerate devices ─────────────────────────────────────────

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
    micStream:     audioStore.micStream,
    systemStream:  audioStore.systemStream,
    mixedStream:   audioStore.mixedStream,
    isMicActive:   audioStore.isMicActive,
    isMuted:       audioStore.isMuted,
    micError:      audioStore.micError,
    systemError:   audioStore.systemAudioError,
  };
}
