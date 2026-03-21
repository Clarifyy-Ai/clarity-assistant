import { useCallback, useRef, useState } from "react";
import { useAudioStore } from "@/store/audioStore";
import { DeepgramStreamClient } from "@/lib/audio/deepgramStream";
import type { DeepgramStreamOptions } from "@/lib/audio/deepgramStream";

// ─────────────────────────────────────────────────────────────────
// useDeepgramStream
// React hook wrapping DeepgramStreamClient for live transcription.
// Manages connection lifecycle (connect → stream → reconnect → close).
// When the DEEPGRAM_API_KEY edge function is not yet deployed, the
// hook gracefully falls back — transcription is unavailable but
// the rest of the session continues normally.
// ─────────────────────────────────────────────────────────────────

export type DeepgramStatus =
  | "idle"
  | "connecting"
  | "connected"
  | "reconnecting"
  | "error"
  | "closed"
  | "unavailable";

export type { DeepgramStreamOptions };

export function useDeepgramStream(
  callbacks: Pick<DeepgramStreamOptions, "onUtterance" | "onInterim" | "onError" | "onStatusChange">
) {
  const [status, setStatus] = useState<DeepgramStatus>("idle");
  const clientRef = useRef<DeepgramStreamClient | null>(null);

  const connect = useCallback(async (stream: MediaStream): Promise<void> => {
    clientRef.current?.disconnect();
    clientRef.current = null;

    const handleStatus = (s: string) => {
      setStatus(s as DeepgramStatus);
      useAudioStore.getState().setDeepgramStatus(
        s === "connected"    ? "connected" :
        s === "reconnecting" ? "reconnecting" :
        s === "error"        ? "error" : "disconnected"
      );
      callbacks.onStatusChange?.(s as any);
    };

    const client = new DeepgramStreamClient({
      stream,
      onUtterance:   callbacks.onUtterance,
      onInterim:     callbacks.onInterim,
      onError:       (err) => {
        if (err.message.includes("Token fetch failed") || err.message.includes("Failed to obtain")) {
          setStatus("unavailable");
          useAudioStore.getState().setDeepgramStatus("disconnected");
        }
        callbacks.onError(err);
      },
      onStatusChange: handleStatus,
    });

    clientRef.current = client;
    setStatus("connecting");

    try {
      await client.connect();
    } catch (err) {
      setStatus("error");
      callbacks.onError(err instanceof Error ? err : new Error(String(err)));
    }
  }, [callbacks]);

  const disconnect = useCallback((): void => {
    clientRef.current?.disconnect();
    clientRef.current = null;
    setStatus("closed");
    useAudioStore.getState().setDeepgramStatus("disconnected");
  }, []);

  const keepAlive = useCallback((): (() => void) => {
    return () => {};
  }, []);

  return {
    connect,
    disconnect,
    keepAlive,
    status,
    isConnected:   status === "connected",
    isUnavailable: status === "unavailable",
  };
}
