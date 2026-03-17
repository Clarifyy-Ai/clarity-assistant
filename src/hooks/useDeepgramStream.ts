import { useCallback, useRef, useState } from "react";
import { useAudioStore } from "@/store/audioStore";

export type DeepgramStatus = "idle" | "connecting" | "connected" | "reconnecting" | "error" | "closed";

export interface TranscriptSegment {
  speaker:    0 | 1;
  text:       string;
  confidence: number;
  is_final:   boolean;
  timestamp:  number;
}

export function useDeepgramStream(
  onSegment: (segment: TranscriptSegment) => void
) {
  const audioStore = useAudioStore();
  const [status, setStatus] = useState<DeepgramStatus>("idle");

  const connect = useCallback(async (): Promise<void> => {
    setStatus("connecting");
    // Stub - actual Deepgram integration would go here
    setStatus("connected");
    audioStore.setDeepgramStatus("connected");
  }, [audioStore, onSegment]);

  const sendAudio = useCallback((_chunk: ArrayBuffer | Blob): void => {
    // Stub
  }, []);

  const disconnect = useCallback((): void => {
    setStatus("idle");
    audioStore.setDeepgramStatus("disconnected");
  }, [audioStore]);

  const keepAlive = useCallback((): (() => void) => {
    const id = setInterval(() => {}, 8_000);
    return () => clearInterval(id);
  }, []);

  return {
    connect,
    disconnect,
    sendAudio,
    keepAlive,
    status,
    isConnected: status === "connected",
  };
}
