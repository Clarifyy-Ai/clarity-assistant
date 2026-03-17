import { useCallback, useRef } from "react";
import { useAudioStore } from "@/store/audioStore";
import { startMicCapture, stopMicCapture } from "@/lib/audio/micCapture";
import { startSystemAudioCapture, stopSystemAudioCapture } from "@/lib/audio/systemAudioCapture";
import { mixStreams } from "@/lib/audio/audioMixer";

export function useAudioCapture() {
  const audioStore  = useAudioStore();
  const micRef      = useRef<MediaStream | null>(null);
  const sysRef      = useRef<MediaStream | null>(null);
  const mixedRef    = useRef<MediaStream | null>(null);

  const startMic = useCallback(async (
    deviceId?: string | null
  ): Promise<{ error: string | null }> => {
    try {
      const stream = await startMicCapture(deviceId);
      micRef.current = stream;
      audioStore.setMicStream(stream);
      audioStore.setIsCapturing(true);
      return { error: null };
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Mic access denied";
      audioStore.setStreamError({ code: "mic_denied" as any, message: msg });
      return { error: msg };
    }
  }, [audioStore]);

  const startSystemAudio = useCallback(async (): Promise<{ error: string | null }> => {
    try {
      const stream = await startSystemAudioCapture();
      sysRef.current = stream;
      audioStore.setSystemStream(stream);
      return { error: null };
    } catch (err) {
      const msg = err instanceof Error ? err.message : "System audio unavailable";
      audioStore.setStreamError({ code: "system_audio_denied" as any, message: msg });
      return { error: msg };
    }
  }, [audioStore]);

  const buildMixedStream = useCallback((): MediaStream | null => {
    const mixed = mixStreams(micRef.current, sysRef.current);
    mixedRef.current = mixed;
    if (mixed) audioStore.setCombinedStream(mixed);
    return mixed;
  }, [audioStore]);

  const stopAll = useCallback((): void => {
    stopMicCapture(micRef.current);
    stopSystemAudioCapture(sysRef.current);
    mixedRef.current?.getTracks().forEach(t => t.stop());
    micRef.current = null;
    sysRef.current = null;
    mixedRef.current = null;
    audioStore.stopAllStreams();
  }, [audioStore]);

  const setMuted = useCallback((muted: boolean): void => {
    micRef.current?.getAudioTracks().forEach(t => { t.enabled = !muted; });
    audioStore.setIsMuted(muted);
  }, [audioStore]);

  const getDevices = useCallback(async (): Promise<MediaDeviceInfo[]> => {
    const devices = await navigator.mediaDevices.enumerateDevices();
    return devices.filter(d => d.kind === "audioinput");
  }, []);

  return {
    startMic,
    startSystemAudio,
    buildMixedStream,
    stopAll,
    setMuted,
    getDevices,
    micStream:    audioStore.streams.mic_stream,
    systemStream: audioStore.streams.system_stream,
    mixedStream:  audioStore.streams.combined_stream,
    isMicActive:  audioStore.streams.is_capturing,
    isMuted:      audioStore.is_muted,
    micError:     audioStore.streams.error?.message ?? null,
    systemError:  null,
  };
}
