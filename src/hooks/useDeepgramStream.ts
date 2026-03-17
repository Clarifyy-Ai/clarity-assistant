import { useCallback, useRef, useState } from "react";
import { createDeepgramSocket, DeepgramSocket } from "@/lib/audio/deepgramClient";
import { useAudioStore } from "@/store/audioStore";

export type DeepgramStatus = "idle" | "connecting" | "connected" | "reconnecting" | "error" | "closed";

export interface TranscriptSegment {
  speaker:    0 | 1;           // 0 = candidate, 1 = interviewer
  text:       string;
  confidence: number;
  is_final:   boolean;
  timestamp:  number;
}

// ─────────────────────────────────────────────────────────────────
// useDeepgramStream
// Manages the Deepgram WebSocket connection.
// Feeds audio chunks and emits transcript segments.
// ─────────────────────────────────────────────────────────────────

export function useDeepgramStream(
  onSegment: (segment: TranscriptSegment) => void
) {
  const socketRef   = useRef<DeepgramSocket | null>(null);
  const audioStore  = useAudioStore();
  const [status, setStatus] = useState<DeepgramStatus>("idle");
  const reconnectTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const reconnectCount = useRef(0);

  // ── Connect ───────────────────────────────────────────────────

  const connect = useCallback(async (): Promise<void> => {
    if (socketRef.current?.isOpen()) return;

    setStatus("connecting");

    const socket = await createDeepgramSocket({
      model:             "nova-2",
      language:          "en",
      diarize:           true,
      punctuate:         true,
      interim_results:   true,
      vad_events:        true,
      endpointing:       300,
      utterance_end_ms:  1000,
    });

    socketRef.current = socket;

    socket.onOpen(() => {
      setStatus("connected");
      audioStore.setDeepgramConnected(true);
      reconnectCount.current = 0;
    });

    socket.onTranscript((data) => {
      const alt  = data.channel?.alternatives?.[0];
      if (!alt?.transcript) return;

      const segment: TranscriptSegment = {
        speaker:    (data.channel_index?.[0] ?? 0) as 0 | 1,
        text:       alt.transcript,
        confidence: alt.confidence ?? 1,
        is_final:   data.is_final ?? false,
        timestamp:  Date.now(),
      };

      onSegment(segment);
    });

    socket.onClose(() => {
      setStatus("closed");
      audioStore.setDeepgramConnected(false);
      attemptReconnect();
    });

    socket.onError(() => {
      setStatus("error");
      attemptReconnect();
    });
  }, [onSegment]);

  // ── Auto-reconnect (exponential back-off, max 5 attempts) ─────

  function attemptReconnect() {
    if (reconnectCount.current >= 5) return;
    reconnectCount.current += 1;
    const delay = Math.min(1000 * 2 ** reconnectCount.current, 30_000);
    setStatus("reconnecting");
    reconnectTimer.current = setTimeout(() => connect(), delay);
  }

  // ── Send audio chunk ──────────────────────────────────────────

  const sendAudio = useCallback((chunk: ArrayBuffer | Blob): void => {
    socketRef.current?.send(chunk);
  }, []);

  // ── Disconnect ────────────────────────────────────────────────

  const disconnect = useCallback((): void => {
    if (reconnectTimer.current) clearTimeout(reconnectTimer.current);
    socketRef.current?.close();
    socketRef.current = null;
    setStatus("idle");
    audioStore.setDeepgramConnected(false);
  }, []);

  // ── Keep-alive ping every 8 seconds ──────────────────────────

  const keepAlive = useCallback((): (() => void) => {
    const id = setInterval(() => {
      if (socketRef.current?.isOpen()) {
        socketRef.current.keepAlive();
      }
    }, 8_000);
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
