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
  const audioStore = useAudioStore();
  const [status, setStatus] = useState<DeepgramStatus>("idle");
  const clientRef = useRef<DeepgramStreamClient | null>(null);

  const connect = useCallback(async (stream: MediaStream): Promise<void> => {
    // Tear down any existing connection first
    clientRef.current?.disconnect();
    clientRef.current = null;

    const handleStatus = (s: string) => {
      const mapped = s as DeepgramStatus;
      setStatus(mapped);
      audioStore.setDeepgramStatus(
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
        // If token fetch failed (edge function not deployed), mark as unavailable
        if (err.message.includes("Token fetch failed") || err.message.includes("Failed to obtain")) {
          setStatus("unavailable");
          audioStore.setDeepgramStatus("disconnected");
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
  }, [audioStore, callbacks]);

  const disconnect = useCallback((): void => {
    clientRef.current?.disconnect();
    clientRef.current = null;
    setStatus("closed");
    audioStore.setDeepgramStatus("disconnected");
  }, [audioStore]);

  const keepAlive = useCallback((): (() => void) => {
    // DeepgramStreamClient handles keepalive internally via ping interval
    // This no-op return satisfies the interface
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
