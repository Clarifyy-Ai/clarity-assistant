// src/hooks/useDeepgramStream.ts — PRODUCTION FIXED
// Fixes:
// - Callbacks stabilized via ref (prevents reconnect loops on parent re-render)
// - PERMANENT_ERROR_PATTERNS expanded to catch Deepgram 401/invalid-credentials
// - scheduleTokenRefresh guarded against concurrent restarts (isReconnecting ref)
// - disconnect() cancels any pending token refresh timer and restart
// - onStatusChange passes token TTL info for subprotocol-aware DeepgramStreamClient

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
  | "unavailable"; // Edge function not configured, unreachable, or auth rejected

export type { DeepgramStreamOptions };

// Permanent misconfiguration patterns — no retry on these
const PERMANENT_ERROR_PATTERNS = [
  "MISSING_PROJECT_ID",
  "Transcription service is not configured",
  "Transcription service misconfigured",
  // ✅ FIX: Deepgram returns these when subprotocol token is invalid/expired at handshake
  "invalid credentials",
  "Invalid credentials",
  "401",
  "403",
  "Authentication failed",
];

/* ─── HOOK ──────────────────────────────────────────────────────────────── */

export function useDeepgramStream(
  callbacks: Pick<
    DeepgramStreamOptions,
    "onUtterance" | "onInterim" | "onError" | "onStatusChange"
  >,
) {
  const [status, setStatus] = useState<DeepgramStatus>("idle");
  const clientRef = useRef<DeepgramStreamClientType | null>(null);

  // ✅ FIX: Stabilize callbacks via ref so connect/scheduleTokenRefresh
  // don't get re-created every time the parent component re-renders,
  // which was causing spurious reconnect loops in the audio pipeline.
  const callbacksRef = useRef(callbacks);
  useEffect(() => {
    callbacksRef.current = callbacks;
  });

  // Token refresh interval — proactively re-opens the connection before the
  // 60s scoped token expires so long sessions don't drop mid-interview.
  const refreshTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ✅ FIX: Guard against concurrent restart attempts
  const isReconnectingRef = useRef(false);

  /* ── STATUS SYNC ───────────────────────────────────────────────────────── */

  const syncStatus = useCallback(
    (deepgramStatus: DeepgramConnectionStatus) => {
      const mapped: DeepgramStatus =
        deepgramStatus === "connected"
          ? "connected"
          : deepgramStatus === "reconnecting"
            ? "reconnecting"
            : deepgramStatus === "error"
              ? "error"
              : deepgramStatus === "connecting"
                ? "connecting"
                : "closed";

      setStatus(mapped);

      // Keep audioStore in sync for network monitor display
      useAudioStore.getState().setDeepgramStatus(
        deepgramStatus === "connected"
          ? "connected"
          : deepgramStatus === "reconnecting"
            ? "reconnecting"
            : deepgramStatus === "error"
              ? "error"
              : "disconnected",
      );

      callbacksRef.current.onStatusChange(deepgramStatus);
    },
    // No deps — reads callbacksRef.current at call time
    [],
  );

  /* ── TOKEN REFRESH TIMER ───────────────────────────────────────────────── */

  const clearTokenRefreshTimer = useCallback(() => {
    if (refreshTimerRef.current) {
      clearTimeout(refreshTimerRef.current);
      refreshTimerRef.current = null;
    }
    // ✅ FIX: also reset reconnect guard when timer is cleared
    isReconnectingRef.current = false;
  }, []);

  /**
   * Reconnect ~10s before token expiry so long sessions don't get stuck
   * if a reconnect is needed after the token expires.
   *
   * Deepgram validates auth at handshake time only. Existing connections
   * stay alive after token expiry, but any reconnect attempt post-expiry
   * would fail on the WS upgrade handshake (401) unless we pre-refresh.
   *
   * ✅ FIX: The DeepgramStreamClient must pass the token via the WebSocket
   * subprotocol header, NOT as a query param. See deepgramStream.ts for the
   * actual WS open call:
   *   new WebSocket(url, ['token', tempKey])
   * This file schedules the refresh; deepgramStream.ts owns the WS open logic.
   */
  const scheduleTokenRefresh = useCallback(
    (stream: MediaStream, expiresInSeconds: number) => {
      clearTokenRefreshTimer();

      const refreshAfterMs = Math.max(0, (expiresInSeconds - 10) * 1000);

      refreshTimerRef.current = setTimeout(async () => {
        const client = clientRef.current;
        if (!client) return;

        // ✅ FIX: Skip if a restart is already in progress
        if (isReconnectingRef.current) return;

        // Only restart if still connected — don't interrupt error/reconnecting states
        if (client.isConnected) {
          isReconnectingRef.current = true;
          try {
            await client.restart();
          } catch (err) {
            callbacksRef.current.onError(
              err instanceof Error ? err : new Error(String(err)),
            );
          } finally {
            isReconnectingRef.current = false;
            // Reschedule based on updated token TTL if available
            const secondsRemaining = clientRef.current?.tokenSecondsRemaining ?? 0;
            if (secondsRemaining > 0) {
              scheduleTokenRefresh(stream, secondsRemaining);
            }
          }
        }
      }, refreshAfterMs);
    },
    [clearTokenRefreshTimer],
  );

  /* ── CONNECT ───────────────────────────────────────────────────────────── */

  const connect = useCallback(
    async (stream: MediaStream): Promise<void> => {
      // Tear down any existing connection cleanly
      clientRef.current?.disconnect();
      clientRef.current = null;
      clearTokenRefreshTimer();

      const client = new DeepgramStreamClient({
        stream,
        // ✅ FIX: Always use callbacksRef.current so we get the latest callbacks
        // without re-creating this connect function on every parent render.
        onUtterance: (...args) => callbacksRef.current.onUtterance(...args),
        onInterim: (...args) => callbacksRef.current.onInterim(...args),

        onError: (err) => {
          const errStr = String(err.message || "");
          const isPermanent = PERMANENT_ERROR_PATTERNS.some((p) =>
            errStr.includes(p),
          );
          if (isPermanent) {
            setStatus("unavailable");
            useAudioStore.getState().setDeepgramStatus("disconnected");
            clearTokenRefreshTimer();
          }
          callbacksRef.current.onError(err);
        },

        onStatusChange: (s) => {
          syncStatus(s);

          if (s === "connected" && clientRef.current) {
            const secondsRemaining = clientRef.current.tokenSecondsRemaining;
            if (secondsRemaining > 0) {
              scheduleTokenRefresh(stream, secondsRemaining);
            }
          }

          // ✅ FIX: If we drop back to a non-connected state, reset reconnect guard
          if (s !== "connected" && s !== "connecting") {
            isReconnectingRef.current = false;
          }
        },
      });

      clientRef.current = client;
      setStatus("connecting");

      try {
        await client.connect();
      } catch (err) {
        setStatus("error");
        callbacksRef.current.onError(
          err instanceof Error ? err : new Error(String(err)),
        );
      }
    },
    [syncStatus, scheduleTokenRefresh, clearTokenRefreshTimer],
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
    isConnected: status === "connected",
    isUnavailable: status === "unavailable",
  };
}

// React hook wrapping DeepgramStreamClient for live transcription.
// Handles connect → stream → token-refresh-aware reconnect → disconnect lifecycle.
// ──────────────────────────────────────────────────────────────────────────────
// ⚠️  CRITICAL: The actual WebSocket subprotocol fix lives in:
//     src/lib/audio/deepgramStream.ts
//
// The DeepgramStreamClient.connect() method MUST open the WebSocket as:
//   new WebSocket(DEEPGRAM_WS_URL, ['token', tempKey])
//
// NOT as a query param:
//   new WebSocket(`${DEEPGRAM_WS_URL}?access_token=${tempKey}`)  ← BROKEN
//
// Deepgram's scoped/temporary keys ONLY work via the subprotocol header path.
// Query-param auth is for permanent API keys only and will 401 on temp tokens.
// ──────────────────────────────────────────────────────────────────────────────
