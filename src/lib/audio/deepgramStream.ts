import { EDGE_BASE, SUPABASE_ANON_KEY, SUPABASE_URL } from "@/lib/env";
import type {
  DeepgramConfig,
  TranscriptUtterance,
  TranscriptWord,
  DeepgramConnectionStatus,
} from "@/types/audio.types";
import { useAudioStore } from "@/store/audioStore";
import { generateId } from "@/lib/utils";

// ─────────────────────────────────────────────────────────────────
// Deepgram WebSocket Streaming STT
// Manages WebSocket lifecycle, reconnection, and transcript parsing.
// ─────────────────────────────────────────────────────────────────

const DEEPGRAM_STT_URL = "wss://api.deepgram.com/v1/listen";
const MAX_RECONNECT_ATTEMPTS = 5;
const RECONNECT_BASE_DELAY_MS = 1000;

export interface DeepgramStreamOptions {
  stream: MediaStream;
  config?: Partial<DeepgramConfig>;
  onUtterance: (utterance: TranscriptUtterance) => void;
  onInterim: (text: string) => void;
  onError: (error: Error) => void;
  onStatusChange: (status: DeepgramConnectionStatus) => void;
}

export class DeepgramStreamClient {
  private ws: WebSocket | null = null;
  private mediaRecorder: MediaRecorder | null = null;
  private reconnectAttempts = 0;
  private isDestroyed = false;
  private apiToken: string | null = null;
  private stream: MediaStream;
  private config: DeepgramConfig;
  private callbacks: Omit<DeepgramStreamOptions, "stream" | "config">;
  private pingInterval: ReturnType<typeof setInterval> | null = null;

  constructor(opts: DeepgramStreamOptions) {
    this.stream = opts.stream;
    this.callbacks = {
      onUtterance:   opts.onUtterance,
      onInterim:     opts.onInterim,
      onError:       opts.onError,
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

  // ── Connect ───────────────────────────────────────────────────

  async connect(): Promise<void> {
    if (this.isDestroyed) return;

    this.callbacks.onStatusChange("connecting");

    try {
      // Fetch short-lived token from Edge Function
      this.apiToken = await fetchDeepgramToken();
    } catch (err) {
      this.callbacks.onError(new Error("Failed to obtain Deepgram token"));
      this.callbacks.onStatusChange("error");
      return;
    }

    const url = this.buildWebSocketURL();

    this.ws = new WebSocket(url, ["token", this.apiToken]);
    this.ws.binaryType = "arraybuffer";

    this.ws.onopen  = () => this.handleOpen();
    this.ws.onclose = (e) => this.handleClose(e);
    this.ws.onerror = (e) => this.handleError(e);
    this.ws.onmessage = (e) => this.handleMessage(e);
  }

  // ── Disconnect ────────────────────────────────────────────────

  disconnect(): void {
    this.isDestroyed = true;
    this.stopMediaRecorder();
    this.stopPing();
    if (this.ws) {
      // Send CloseStream message before closing
      if (this.ws.readyState === WebSocket.OPEN) {
        this.ws.send(JSON.stringify({ type: "CloseStream" }));
      }
      this.ws.close(1000, "User disconnected");
      this.ws = null;
    }
    this.callbacks.onStatusChange("disconnected");
  }

  // ── Open handler ──────────────────────────────────────────────

  private handleOpen(): void {
    this.reconnectAttempts = 0;
    this.callbacks.onStatusChange("connected");
    this.startMediaRecorder();
    this.startPing();
  }

  // ── Close handler ─────────────────────────────────────────────

  private handleClose(event: CloseEvent): void {
    this.stopMediaRecorder();
    this.stopPing();

    if (this.isDestroyed) return;

    // Unexpected close — attempt reconnection
    if (event.code !== 1000 && this.reconnectAttempts < MAX_RECONNECT_ATTEMPTS) {
      this.reconnectAttempts++;
      const delay = RECONNECT_BASE_DELAY_MS * Math.pow(2, this.reconnectAttempts - 1);
      this.callbacks.onStatusChange("reconnecting");
      setTimeout(() => {
        if (!this.isDestroyed) this.connect();
      }, delay);
    } else {
      this.callbacks.onStatusChange("disconnected");
    }
  }

  // ── Error handler ─────────────────────────────────────────────

  private handleError(_event: Event): void {
    this.callbacks.onError(new Error("Deepgram WebSocket error"));
    this.callbacks.onStatusChange("error");
  }

  // ── Message handler ───────────────────────────────────────────

  private handleMessage(event: MessageEvent): void {
    try {
      const data = JSON.parse(event.data as string);

      // Interim results
      if (data.type === "Results" && !data.is_final) {
        const interim = data.channel?.alternatives?.[0]?.transcript ?? "";
        if (interim) this.callbacks.onInterim(interim);
        return;
      }

      // Final utterance
      if (data.type === "Results" && data.is_final) {
        const alt = data.channel?.alternatives?.[0];
        if (!alt || !alt.transcript) return;

        const words: TranscriptWord[] = (alt.words ?? []).map((w: {
          word: string;
          start: number;
          end: number;
          confidence: number;
          speaker?: number;
          punctuated_word?: string;
        }) => ({
          word:            w.word,
          start:           w.start,
          end:             w.end,
          confidence:      w.confidence,
          speaker:         w.speaker,
          punctuated_word: w.punctuated_word,
        }));

        // Determine speaker from diarization
        const speakerIndex = words[0]?.speaker ?? 0;
        const speaker = speakerIndex === 0 ? "interviewer" : "candidate";

        const utterance: TranscriptUtterance = {
          id:                       generateId(),
          speaker,
          text:                     alt.transcript,
          words,
          start_ms:                 Math.round((data.start ?? 0) * 1000),
          end_ms:                   Math.round(((data.start ?? 0) + (data.duration ?? 0)) * 1000),
          is_final:                 true,
          is_interviewer_question:  speaker === "interviewer" && alt.transcript.trim().endsWith("?"),
          confidence:               alt.confidence ?? 0,
        };

        this.callbacks.onUtterance(utterance);
        return;
      }

      // Utterance end (VAD event)
      if (data.type === "UtteranceEnd") {
        // Signal boundary for question detection
        useAudioStore.getState().updateInterimText("");
        return;
      }

    } catch {
      // Ignore malformed messages
    }
  }

  // ── MediaRecorder ─────────────────────────────────────────────

  private startMediaRecorder(): void {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return;

    // Choose supported MIME type
    const mimeType = getSupportedMimeType();

    this.mediaRecorder = new MediaRecorder(this.stream, {
      mimeType,
      audioBitsPerSecond: 128000,
    });

    this.mediaRecorder.ondataavailable = (e) => {
      if (
        e.data.size > 0 &&
        this.ws?.readyState === WebSocket.OPEN
      ) {
        this.ws.send(e.data);
      }
    };

    this.mediaRecorder.start(250); // 250ms chunks
  }

  private stopMediaRecorder(): void {
    if (this.mediaRecorder && this.mediaRecorder.state !== "inactive") {
      this.mediaRecorder.stop();
      this.mediaRecorder = null;
    }
  }

  // ── Keepalive ping ────────────────────────────────────────────

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

  // ── URL builder ───────────────────────────────────────────────

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
    return `${DEEPGRAM_STT_URL}?${params.toString()}`;
  }

  // ── Status ────────────────────────────────────────────────────

  get isConnected(): boolean {
    return this.ws?.readyState === WebSocket.OPEN;
  }
}

// ─────────────────────────────────────────────────────────────────
// Fetch Deepgram temporary token from Edge Function
// ─────────────────────────────────────────────────────────────────

async function fetchDeepgramToken(): Promise<string> {
  
  const response = await fetch(`${EDGE_BASE}/deepgram-token`, {
    method: "POST",
    headers: {
      "Content-Type":  "application/json",
      "Authorization": `Bearer ${SUPABASE_ANON_KEY}`,
    },
  });

  if (!response.ok) {
    throw new Error(`Token fetch failed: ${response.status}`);
  }

  const data = await response.json();
  return data.token;
}

// ─────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────

function getSupportedMimeType(): string {
  const types = [
    "audio/webm;codecs=opus",
    "audio/webm",
    "audio/ogg;codecs=opus",
    "audio/ogg",
  ];
  for (const type of types) {
    if (MediaRecorder.isTypeSupported(type)) return type;
  }
  return "audio/webm";
}
