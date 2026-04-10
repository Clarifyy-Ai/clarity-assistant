// src/hooks/useDeepgramStream.ts
// React hook wrapping DeepgramStreamClient for live transcription.
// Handles connect → stream → token-refresh-aware reconnect → disconnect lifecycle.
// Falls back gracefully when the edge function is unavailable.

import { useCallback, useEffect, useRef, useState } from "react";
import { useAudioStore } from "@/store/audioStore";
import { DeepgramStreamClient } from "@/lib/audio/deepgramStream";
import type {
  DeepgramStreamOptions,
  DeepgramStreamClient as DeepgramStreamClientType,
} from "@/lib/audio/deepgramStream";
import type { DeepgramConnectionStatus } from "@/types/audio.types";

/* ─── TYPES ─────────────────────────────────────────────────────────────── */

export type DeepgramStatus =
  | "idle"
  | "connecting"
  | "connected"
  | "reconnecting"
  | "error"
  | "closed"
  | "unavailable"; // Edge function not configured or unreachable

export type { DeepgramStreamOptions };

// Errors that indicate a permanent misconfiguration rather than a transient failure
const PERMANENT_ERROR_PATTERNS = [
  "MISSING_PROJECT_ID",
  "Transcription service is not configured",
  "Transcription service misconfigured",
];

/* ─── HOOK ──────────────────────────────────────────────────────────────── */

export function useDeepgramStream(
  callbacks: Pick<
    DeepgramStreamOptions,
    "onUtterance" | "onInterim" | "onError" | "onStatusChange"
  >,
) {
  const [status, setStatus] = useState<DeepgramStatus>("idle");
  const clientRef           = useRef<DeepgramStreamClientType | null>(null);
  // Token refresh interval — proactively re-opens the connection before the
  // 60s scoped token expires so long sessions don't drop mid-interview.
  const refreshTimerRef     = useRef<ReturnType<typeof setTimeout> | null>(null);

  /* ── STATUS SYNC ───────────────────────────────────────────────────────── */

  const syncStatus = useCallback(
    (deepgramStatus: DeepgramConnectionStatus) => {
      // Map Deepgram's connection status to our richer DeepgramStatus type
      const mapped: DeepgramStatus =
        deepgramStatus === "connected"    ? "connected"    :
        deepgramStatus === "reconnecting" ? "reconnecting" :
        deepgramStatus === "error"        ? "error"        :
        deepgramStatus === "connecting"   ? "connecting"   :
        "closed";

      setStatus(mapped);

      // Keep audioStore in sync for network monitor display
      useAudioStore.getState().setDeepgramStatus(
        deepgramStatus === "connected"    ? "connected"    :
        deepgramStatus === "reconnecting" ? "reconnecting" :
        deepgramStatus === "error"        ? "error"        :
        "disconnected",
      );

      callbacks.onStatusChange(deepgramStatus);
    },
    [callbacks],
  );

  /* ── TOKEN REFRESH TIMER ───────────────────────────────────────────────── */

  /**
   * Sets up a timer to reconnect ~TOKEN_REFRESH_BUFFER_S seconds before the
   * 60s token expires. This ensures long sessions (> 60s) don't drop because
   * the scoped token that authenticated the WebSocket expires.
   *
   * Note: Deepgram validates the token only at handshake time, so the
   * existing WebSocket connection stays alive even after the key expires.
   * This refresh is only needed to ensure reconnects succeed.
   * For sessions > 60s, we schedule a proactive disconnect + reconnect.
   */
  const scheduleTokenRefresh = useCallback(
    (stream: MediaStream, expiresInSeconds: number) => {
      clearTokenRefreshTimer();

      // Reconnect 10s before the token expires
      const refreshAfterMs = Math.max(0, (expiresInSeconds - 10) * 1000);

      refreshTimerRef.current = setTimeout(async () => {
        const client = clientRef.current;
        if (!client) return;

        // Only reconnect if still actively connected — don't disrupt a session
        // that's already reconnecting or in an error state
        if (client.isConnected) {
          client.disconnect();
          // Small delay before reconnecting so the disconnect completes
          await new Promise((r) => setTimeout(r, 200));
          if (clientRef.current) {
            void clientRef.current.connect();
          }
        }
      }, refreshAfterMs);
    },
    [],
  );

  const clearTokenRefreshTimer = useCallback(() => {
    if (refreshTimerRef.current) {
      clearTimeout(refreshTimerRef.current);
      refreshTimerRef.current = null;
    }
  }, []);

  /* ── CONNECT ───────────────────────────────────────────────────────────── */

  const connect = useCallback(
    async (stream: MediaStream): Promise<void> => {
      // Tear down any existing connection cleanly
      clientRef.current?.disconnect();
      clientRef.current = null;
      clearTokenRefreshTimer();

      const client = new DeepgramStreamClient({
        stream,
        onUtterance: callbacks.onUtterance,
        onInterim:   callbacks.onInterim,

        onError: (err) => {
          const isPermanent = PERMANENT_ERROR_PATTERNS.some((p) =>
            err.message.includes(p),
          );
          if (isPermanent) {
            // Edge function misconfigured — mark as unavailable so the UI
            // can show a clear message instead of an infinite reconnect loop
            setStatus("unavailable");
            useAudioStore.getState().setDeepgramStatus("disconnected");
          }
          callbacks.onError(err);
        },

        onStatusChange: (s) => {
          syncStatus(s);

          // Once connected, set up token refresh based on the client's token TTL
          if (s === "connected" && clientRef.current) {
            const secondsRemaining = clientRef.current.tokenSecondsRemaining;
            if (secondsRemaining > 0) {
              scheduleTokenRefresh(stream, secondsRemaining);
            }
          }
        },
      });

      clientRef.current = client;
      setStatus("connecting");

      try {
        await client.connect();
      } catch (err) {
        setStatus("error");
        callbacks.onError(
          err instanceof Error ? err : new Error(String(err)),
        );
      }
    },
    [callbacks, syncStatus, scheduleTokenRefresh, clearTokenRefreshTimer],
  );

  /* ── DISCONNECT ────────────────────────────────────────────────────────── */

  const disconnect = useCallback((): void => {
    clearTokenRefreshTimer();
    clientRef.current?.disconnect();
    clientRef.current = null;
    setStatus("closed");
    useAudioStore.getState().setDeepgramStatus("disconnected");
  }, [clearTokenRefreshTimer]);

  /* ── CLEANUP ON UNMOUNT ────────────────────────────────────────────────── */

  useEffect(() => {
    return () => {
      clearTokenRefreshTimer();
      clientRef.current?.disconnect();
      clientRef.current = null;
    };
  }, [clearTokenRefreshTimer]);

  /* ── PUBLIC API ────────────────────────────────────────────────────────── */

  return {
    connect,
    disconnect,
    status,
    isConnected:   status === "connected",
    isUnavailable: status === "unavailable",
  };
}
