// src/lib/audio/deepgramStream.ts
// Manages Deepgram WebSocket lifecycle, reconnection, and transcript parsing.
// Tokens are re-fetched before every connection attempt (including reconnects)
// so an expired 60s scoped token never causes a silent auth failure.

import { EDGE_BASE } from "@/lib/env";
// REMOVED: SUPABASE_URL — was imported but never used
import { getAuthHeaders } from "@/lib/network/fetchEdge";
import type {
  DeepgramConfig,
  TranscriptUtterance,
  TranscriptWord,
  DeepgramConnectionStatus,
} from "@/types/audio.types";
import { useAudioStore } from "@/store/audioStore";
import { generateId } from "@/lib/utils";

/* ─── CONSTANTS ─────────────────────────────────────────────────────────── */

const DEEPGRAM_WSS_URL        = "wss://api.deepgram.com/v1/listen";
const MAX_RECONNECT_ATTEMPTS  = 5;
const RECONNECT_BASE_DELAY_MS = 1000;
// Refresh the token this many seconds before it expires to avoid
// reconnect attempts failing with an expired token.
const TOKEN_REFRESH_BUFFER_S  = 10;

/* ─── TYPES ─────────────────────────────────────────────────────────────── */

export interface DeepgramStreamOptions {
  stream:          MediaStream;
  config?:         Partial<DeepgramConfig>;
  onUtterance:     (utterance: TranscriptUtterance) => void;
  onInterim:       (text: string) => void;
  onError:         (error: Error) => void;
  onStatusChange:  (status: DeepgramConnectionStatus) => void;
}

interface TokenResponse {
  token:      string;
  expires_in: number;  // seconds
  key_id:     string | null;
  type:       "scoped" | "raw";
}

/* ─── DEEPGRAM STREAM CLIENT ────────────────────────────────────────────── */

export class DeepgramStreamClient {
  private ws:                WebSocket | null = null;
  private mediaRecorder:     MediaRecorder | null = null;
  private reconnectAttempts: number = 0;
  private isDestroyed:       boolean = false;
  private pingInterval:      ReturnType<typeof setInterval> | null = null;

  // Token state — stored so reconnects can check freshness before re-fetching
  private currentToken:     string | null = null;
  private tokenExpiresAt:   number = 0;  // Unix ms timestamp

  private stream:    MediaStream;
  private config:    DeepgramConfig;
  private callbacks: Omit<DeepgramStreamOptions, "stream" | "config">;

  constructor(opts: DeepgramStreamOptions) {
    this.stream    = opts.stream;
    this.callbacks = {
      onUtterance:    opts.onUtterance,
      onInterim:      opts.onInterim,
      onError:        opts.onError,
      onStatusChange: opts.onStatusChange,
    };
    this.config = {
      model:            "nova-2-meeting",
      language:         "en-US",
      smart_format:     true,
      interim_results:  true,
      utterance_end_ms: 1200,
      vad_events:       true,
      diarize:          true,
      punctuate:        true,
      filler_words:     true,
      ...opts.config,
    };
  }

  /* ── PUBLIC: CONNECT ─────────────────────────────────────────────────── */

  async connect(): Promise<void> {
    if (this.isDestroyed) return;

    this.callbacks.onStatusChange("connecting");

    try {
      await this.ensureFreshToken();
    } catch (err) {
      this.callbacks.onError(
        new Error("Failed to obtain Deepgram token. Check DEEPGRAM_PROJECT_ID secret."),
      );
      this.callbacks.onStatusChange("error");
      return;
    }

    const url = this.buildWebSocketURL();

    // Deepgram supports token auth via WebSocket subprotocol for browser clients
    // (browsers cannot set Authorization headers on WebSocket connections).
    this.ws            = new WebSocket(url, ["token", this.currentToken!]);
    this.ws.binaryType = "arraybuffer";

    this.ws.onopen    = ()  => this.handleOpen();
    this.ws.onclose   = (e) => this.handleClose(e);
    this.ws.onerror   = (e) => this.handleError(e);
    this.ws.onmessage = (e) => this.handleMessage(e);
  }

  /* ── PUBLIC: DISCONNECT ──────────────────────────────────────────────── */

  disconnect(): void {
    this.isDestroyed = true;
    this.stopMediaRecorder();
    this.stopPing();

    if (this.ws) {
      if (this.ws.readyState === WebSocket.OPEN) {
        // Graceful close — tells Deepgram to flush remaining transcript
        this.ws.send(JSON.stringify({ type: "CloseStream" }));
      }
      this.ws.close(1000, "User disconnected");
      this.ws = null;
    }

    this.callbacks.onStatusChange("disconnected");
  }

  /* ── TOKEN MANAGEMENT ────────────────────────────────────────────────── */

  /**
   * Ensures we have a non-expired token before connecting.
   * For 60s TTL tokens: always re-fetch since the token is likely stale
   * by the time a reconnect is attempted.
   * For longer TTL tokens: only re-fetch if within TOKEN_REFRESH_BUFFER_S of expiry.
   */
  private async ensureFreshToken(): Promise<void> {
    const nowMs            = Date.now();
    const bufferMs         = TOKEN_REFRESH_BUFFER_S * 1000;
    const isExpiredOrClose = !this.currentToken || (nowMs + bufferMs) >= this.tokenExpiresAt;

    if (isExpiredOrClose) {
      const tokenData = await fetchDeepgramToken();
      this.currentToken   = tokenData.token;
      // expires_in is in seconds from now
      this.tokenExpiresAt = nowMs + tokenData.expires_in * 1000;
    }
  }

  /* ── PRIVATE: EVENT HANDLERS ─────────────────────────────────────────── */

  private handleOpen(): void {
    this.reconnectAttempts = 0;
    this.callbacks.onStatusChange("connected");
    this.startMediaRecorder();
    this.startPing();
  }

  private handleClose(event: CloseEvent): void {
    this.stopMediaRecorder();
    this.stopPing();

    if (this.isDestroyed) return;

    // Unexpected close — attempt exponential backoff reconnect
    if (event.code !== 1000 && this.reconnectAttempts < MAX_RECONNECT_ATTEMPTS) {
      this.reconnectAttempts++;
      const delay = RECONNECT_BASE_DELAY_MS * Math.pow(2, this.reconnectAttempts - 1);
      this.callbacks.onStatusChange("reconnecting");
      setTimeout(() => {
        if (!this.isDestroyed) {
          // connect() calls ensureFreshToken() which re-fetches if the
          // 60s token has expired during the backoff delay
          void this.connect();
        }
      }, delay);
    } else {
      this.callbacks.onStatusChange("disconnected");
    }
  }

  private handleError(_event: Event): void {
    this.callbacks.onError(new Error("Deepgram WebSocket connection error"));
    this.callbacks.onStatusChange("error");
  }

  private handleMessage(event: MessageEvent): void {
    try {
      const data = JSON.parse(event.data as string) as Record<string, unknown>;

      // Interim result — update live transcript display
      if (data.type === "Results" && !data.is_final) {
        const channel     = data.channel as { alternatives?: Array<{ transcript?: string }> };
        const interimText = channel?.alternatives?.[0]?.transcript ?? "";
        if (interimText) this.callbacks.onInterim(interimText);
        return;
      }

      // Final result — build utterance and deliver
      if (data.type === "Results" && data.is_final) {
        const channel = data.channel as {
          alternatives?: Array<{
            transcript?: string;
            confidence?: number;
            words?: Array<{
              word:             string;
              start:            number;
              end:              number;
              confidence:       number;
              speaker?:         number;
              punctuated_word?: string;
            }>;
          }>;
        };

        const alt = channel?.alternatives?.[0];
        if (!alt?.transcript) return;

        const words: TranscriptWord[] = (alt.words ?? []).map((w) => ({
          word:            w.word,
          start:           w.start,
          end:             w.end,
          confidence:      w.confidence,
          speaker:         w.speaker,
          punctuated_word: w.punctuated_word,
        }));

        // Speaker diarization: index 0 = first detected voice (usually interviewer)
        const speakerIndex = words[0]?.speaker ?? 0;
        const speaker      = speakerIndex === 0 ? "interviewer" : "candidate";
        const text         = alt.transcript.trim();

        const utterance: TranscriptUtterance = {
          id:                      generateId(),
          speaker,
          text,
          words,
          start_ms:                Math.round(((data.start as number) ?? 0) * 1000),
          end_ms:                  Math.round((
            ((data.start as number) ?? 0) + ((data.duration as number) ?? 0)
          ) * 1000),
          is_final:                true,
          is_interviewer_question: speaker === "interviewer" && text.endsWith("?"),
          confidence:              alt.confidence ?? 0,
        };

        this.callbacks.onUtterance(utterance);
        return;
      }

      // VAD: utterance boundary — clear interim display
      if (data.type === "UtteranceEnd") {
        useAudioStore.getState().updateInterimText("");
        return;
      }
    } catch {
      // Malformed JSON from Deepgram — skip silently
    }
  }

  /* ── PRIVATE: MEDIA RECORDER ─────────────────────────────────────────── */

  private startMediaRecorder(): void {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return;

    const mimeType = getSupportedMimeType();

    this.mediaRecorder = new MediaRecorder(this.stream, {
      mimeType,
      audioBitsPerSecond: 128_000,
    });

    this.mediaRecorder.ondataavailable = (e) => {
      if (e.data.size > 0 && this.ws?.readyState === WebSocket.OPEN) {
        this.ws.send(e.data);
      }
    };

    this.mediaRecorder.start(250); // 250ms chunks for low-latency transcription
  }

  private stopMediaRecorder(): void {
    if (this.mediaRecorder && this.mediaRecorder.state !== "inactive") {
      this.mediaRecorder.stop();
      this.mediaRecorder = null;
    }
  }

  /* ── PRIVATE: KEEPALIVE PING ─────────────────────────────────────────── */

  private startPing(): void {
    this.pingInterval = setInterval(() => {
      if (this.ws?.readyState === WebSocket.OPEN) {
        this.ws.send(JSON.stringify({ type: "KeepAlive" }));
      }
    }, 10_000);
  }

  private stopPing(): void {
    if (this.pingInterval) {
      clearInterval(this.pingInterval);
      this.pingInterval = null;
    }
  }

  /* ── PRIVATE: URL BUILDER ────────────────────────────────────────────── */

  private buildWebSocketURL(): string {
    const params = new URLSearchParams({
      model:            this.config.model,
      language:         this.config.language,
      smart_format:     String(this.config.smart_format),
      interim_results:  String(this.config.interim_results),
      utterance_end_ms: String(this.config.utterance_end_ms),
      vad_events:       String(this.config.vad_events),
      diarize:          String(this.config.diarize),
      punctuate:        String(this.config.punctuate),
      filler_words:     String(this.config.filler_words),
      encoding:         "opus",
    });
    return `${DEEPGRAM_WSS_URL}?${params.toString()}`;
  }

  /* ── PUBLIC GETTERS ──────────────────────────────────────────────────── */

  get isConnected(): boolean {
    return this.ws?.readyState === WebSocket.OPEN;
  }

  /** Seconds until the current token expires. Negative = already expired. */
  get tokenSecondsRemaining(): number {
    return Math.round((this.tokenExpiresAt - Date.now()) / 1000);
  }
}

/* ─── TOKEN FETCH ───────────────────────────────────────────────────────── */

async function fetchDeepgramToken(): Promise<TokenResponse> {
  const headers = await getAuthHeaders();

  const response = await fetch(`${EDGE_BASE}/deepgram-token`, {
    method: "POST",
    headers,
  });

  if (!response.ok) {
    const body = await response.json().catch(() => ({ error: `HTTP ${response.status}` })) as {
      error?: string;
      code?:  string;
    };
    throw new Error(body.error ?? `Token fetch failed: ${response.status}`);
  }

  const data = await response.json() as TokenResponse;

  if (!data.token) {
    throw new Error("Deepgram token response missing token field");
  }

  return data;
}

/* ─── HELPERS ───────────────────────────────────────────────────────────── */

function getSupportedMimeType(): string {
  const candidates = [
    "audio/webm;codecs=opus",
    "audio/webm",
    "audio/ogg;codecs=opus",
    "audio/ogg",
  ];
  for (const type of candidates) {
    if (MediaRecorder.isTypeSupported(type)) return type;
  }
  return "audio/webm"; // last resort — may not work in all browsers
}
