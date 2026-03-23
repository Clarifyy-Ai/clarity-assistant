import { useCallback, useRef, useState } from "react";
import { captureSystemAudioViaTabShare } from "@/lib/capture/screenShare";

// ─────────────────────────────────────────────────────────────────
// useSystemAudio
// Captures interviewer audio through getDisplayMedia (screen share).
// Returns the audio-only MediaStream; caller passes it to Deepgram.
// Routes through captureSystemAudioViaTabShare so that privacy hints
// are applied (guides the picker toward "This Tab").
// ─────────────────────────────────────────────────────────────────

export function useSystemAudio() {
  const streamRef  = useRef<MediaStream | null>(null);
  const [isActive, setIsActive]   = useState(false);
  const [error,    setError]      = useState<string | null>(null);
  const [isPrompting, setIsPrompting] = useState(false);

  const start = useCallback(async (): Promise<MediaStream | null> => {
    setError(null);
    setIsPrompting(true);
    try {
      const stream = await captureSystemAudioViaTabShare({
        echoCancellation: false,
        noiseSuppression: false,
        sampleRate: 16000,
      } as MediaTrackConstraints);
      streamRef.current = stream;
      setIsActive(true);

      // Auto-cleanup if user stops sharing
      stream.getAudioTracks()[0]?.addEventListener("ended", () => {
        setIsActive(false);
        streamRef.current = null;
      });

      return stream;
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Screen audio unavailable";
      setError(msg);
      return null;
    } finally {
      setIsPrompting(false);
    }
  }, []);

  const stop = useCallback((): void => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    setIsActive(false);
  }, []);

  return {
    start,
    stop,
    stream:      streamRef.current,
    isActive,
    isPrompting,
    error,
    isSupported: !!(navigator.mediaDevices as any).getDisplayMedia,
  };
}
