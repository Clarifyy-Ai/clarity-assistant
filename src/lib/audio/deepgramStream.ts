// src/lib/audio/deepgramStream.ts// src/lib/audio/deepgramStream "@/store/audioStore";
import { useAuthStore } from "@/store/authStore";
import { FEATURE_FLAGS, FEATURE_PLAN_GATE } from "@/lib/constants/features";
import { generateId } from "@/lib/utils";

function isDiarizationAllowed(): boolean {
  try {
    const planId = useAuthStore.getState().planId ?? "free";
    const required = FEATURE_PLAN_GATE[FEATURE_FLAGS.DIARIZATION];
    const ORDER = ["free", "starter", "pro", "elite", "enterprise"];
    return ORDER.indexOf(planId) >= ORDER.indexOf(required);
  } catch {
    return false;
  }
}

const DEEPGRAM_WSS_URL = "wss://api.deepgram.com/v1/listen";
const MAX_RECONNECT_ATTEMPTS = 5;
const RECONNECT_BASE_DELAY_MS = 1000;
const TOKEN_REFRESH_BUFFER_S = 50;

// Used for controlled restart without triggering reconnect loop
const RESTART_CLOSE_CODE = 4000;

export interface DeepgramStreamOptions {
  stream: MediaStream;
  config?: Partial<DeepgramConfig>;
  onUtterance: (utterance: TranscriptUtterance) => void;
  onInterim: (text: string) => void;
  onError: (error: Error) => void;
  onStatusChange: (status: DeepgramConnectionStatus) => void;
}

interface TokenResponse {
  token: string;
  expires_in: number;
  key_id: string | null;
  type: "scoped" | "raw";
}

interface DeepgramWord {
  word: string;
  start: number;
  end: number;
  confidence: number;
  speaker?: number;
  punctuated_word?: string;
  type?: "word" | "filler" | "punctuation";
}

export class DeepgramStreamClient {
  private ws: WebSocket | null = null;
  private mediaRecorder: MediaRecorder | null = null;

  private reconnectAttempts = 0;

  // IMPORTANT:
  // - destroyed: permanent teardown (disconnect/unmount). connect() should not proceed.
  // - restarting: controlled close+reopen where we do NOT want reconnect loop to kick in.
  private destroyed = false;
  private restarting = false;

  private pingInterval: ReturnType<typeof setInterval> | null = null;

  private currentToken: string | null = null;
  private tokenExpiresAt = 0;

  private stream: MediaStream;
  private config: DeepgramConfig;
  private callbacks: Omit<DeepgramStreamOptions, "stream" | "config">;

  constructor(opts: DeepgramStreamOptions) {
    this.stream = opts.stream;
    this.callbacks = {
      onUtterance: opts.onUtterance,
      onInterim: opts.onInterim,
      onError: opts.onError,
      onStatusChange: opts.onStatusChange,
    };

    this.config = {
      model: "nova-2-meeting",
      language: "en-US",
      smart_format: true,
      interim_results: true,
      utterance_end_ms: 1200,
      vad_events: true,
      diarize: isDiarizationAllowed(),
      punctuate: true,
      filler_words: true,
      ...opts.config,
    };
  }

  async connect(): Promise<void> {
    if (this.destroyed) return;

    this.callbacks.onStatusChange("connecting");

    try {
      await this.ensureFreshToken();
    } catch (err) {
      this.callbacks.onError(
        new Error(
          "Failed to obtain Deepgram token. Check DEEPGRAM_PROJECT_ID / DEEPGRAM_API_KEY secrets and edge function logs.",
        ),
      );
      this.callbacks.onStatusChange("error");
      return;
    }

    if (!this.currentToken) {
      this.callbacks.onError(new Error("No Deepgram token available"));
      this.callbacks.onStatusChange("error");
      return;
    }

    const url = this.buildWebSocketURL();

    // Deepgram docs: in client-side environments where custom headers aren't supported,
    // pass auth via Sec-WebSocket-Protocol (subprotocol). 【1-161d4f】
    this.ws = new WebSocket(url, ["token", this.currentToken]);
    this.ws.binaryType = "arraybuffer";

    this.ws.onopen = () => this.handleOpen();
    this.ws.onclose = (e) => this.handleClose(e);
    this.ws.onerror = (e) => this.handleError(e);
    this.ws.onmessage = (e) => this.handleMessage(e);
  }

  /**
   * Permanent teardown. No further reconnect/restart should happen.
   */
  disconnect(): void {
    this.destroyed = true;
    this.restarting = false;
    this.stopMediaRecorder();
    this.stopPing();

    if (this.ws) {
      try {
        if (this.ws.readyState === WebSocket.OPEN) {
          this.ws.send(JSON.stringify({ type: "CloseStream" }));
        }
      } catch {
        // ignore send failures
      }

      try {
        this.ws.close(1000, "User disconnected");
      } catch {
        // ignore close failures
      }

      this.ws = null;
    }

    this.callbacks.onStatusChange("disconnected");
  }

  /**
   * Controlled restart (used for token refresh and "refresh connection" UX).
   * This does NOT permanently destroy the instance.
   */
  async restart(): Promise<void> {
    if (this.destroyed) return;

    this.restarting = true;
    this.stopMediaRecorder();
    this.stopPing();

    const wsToClose = this.ws;
    this.ws = null;

    if (wsToClose) {
      await this.closeWebSocket(wsToClose, RESTART_CLOSE_CODE, "Restarting connection");
    }

    this.reconnectAttempts = 0;
    this.restarting = false;

    await this.connect();
  }

  private async closeWebSocket(ws: WebSocket, code: number, reason: string): Promise<void> {
    await new Promise<void>((resolve) => {
      let done = false;

      const finish = () => {
        if (done) return;
        done = true;
        resolve();
      };

      const timeout = setTimeout(finish, 600);
      try {
        ws.onclose = () => {
          clearTimeout(timeout);
          finish();
        };
        ws.onerror = () => {
          clearTimeout(timeout);
          finish();
        };

        try {
          if (ws.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify({ type: "CloseStream" }));
          }
        } catch {
          // ignore
        }

        ws.close(code, reason);
      } catch {
        clearTimeout(timeout);
        finish();
      }
    });
  }

  private async ensureFreshToken(): Promise<void> {
    const nowMs = Date.now();
    const bufferMs = TOKEN_REFRESH_BUFFER_S * 1000;
    const isExpiredOrClose = !this.currentToken || nowMs + bufferMs >= this.tokenExpiresAt;

    if (isExpiredOrClose) {
      const tokenData = await fetchDeepgramToken();
      this.currentToken = tokenData.token;
      this.tokenExpiresAt = nowMs + tokenData.expires_in * 1000;
    }
  }

  private handleOpen(): void {
    this.reconnectAttempts = 0;
    this.callbacks.onStatusChange("connected");
    this.startMediaRecorder();
    this.startPing();
  }

  private handleClose(event: CloseEvent): void {
    this.stopMediaRecorder();
    this.stopPing();

    if (this.destroyed) return;

    // If we are restarting intentionally, do not trigger backoff loop here.
    if (this.restarting || event.code === RESTART_CLOSE_CODE) {
      return;
    }

    if (event.code !== 1000 && this.reconnectAttempts < MAX_RECONNECT_ATTEMPTS) {
      this.reconnectAttempts++;
      const delay = RECONNECT_BASE_DELAY_MS * Math.pow(2, this.reconnectAttempts - 1);
      this.callbacks.onStatusChange("reconnecting");
      setTimeout(() => {
        if (!this.destroyed) void this.connect();
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
      const data = JSON.parse(event.data as string) as Record<string, any>;

      if (data.type === "Results" && !data.is_final) {
        const interimText = data.channel?.alternatives?.[0]?.transcript ?? "";
        if (interimText) this.callbacks.onInterim(interimText);
        return;
      }

      if (data.type === "Results" && data.is_final) {
        const alt = data.channel?.alternatives?.[0];
        if (!alt?.transcript) return;

        const words: TranscriptWord[] = (alt.words ?? []).map((w: DeepgramWord) => ({
          word: w.word,
          start: w.start,
          end: w.end,
          confidence: w.confidence,
          speaker: w.speaker,
          punctuated_word: w.punctuated_word,
          type: w.type,
        }));

        const speakerIndex = getMajoritySpeaker(words);
        const speaker = speakerIndex === 0 ? "interviewer" : "candidate";
        const text = String(alt.transcript ?? "").trim();
        if (!text) return;

        const fillerWords = words.filter((w) => w.type === "filler");
        const fillerCount = fillerWords.length;
        const fillerList = fillerWords.map((w) => String(w.word ?? "").toLowerCase());

        const utterance: TranscriptUtterance = {
          id: generateId(),
          speaker,
          text,
          words,
          start_ms: Math.round(((data.start as number) ?? 0) * 1000),
          end_ms: Math.round(
            (((data.start as number) ?? 0) + ((data.duration as number) ?? 0)) * 1000,
          ),
          is_final: true,
          is_interviewer_question: speaker === "interviewer" && text.endsWith("?"),
          confidence: alt.confidence ?? 0,
          filler_word_count: fillerCount > 0 ? fillerCount : undefined,
          filler_words_used: fillerList.length > 0 ? fillerList : undefined,
        };

        this.callbacks.onUtterance(utterance);
        return;
      }

      if (data.type === "UtteranceEnd") {
        useAudioStore.getState().updateInterimText("");
        return;
      }
    } catch {
      // ignore malformed messages
    }
  }

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

    // Send chunks frequently to avoid Deepgram timing out due to no audio. 【2-499057】
    this.mediaRecorder.start(250);
  }

  private stopMediaRecorder(): void {
    try {
      if (this.mediaRecorder && this.mediaRecorder.state !== "inactive") {
        this.mediaRecorder.stop();
      }
    } catch {
      // ignore stop failures
    } finally {
      this.mediaRecorder = null;
    }
  }

  private startPing(): void {
    // Deepgram recommends keepalive when audio isn't continuously streaming. 【2-499057】【1-161d4f】
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

  private buildWebSocketURL(): string {
    const params = new URLSearchParams({
      model: this.config.model,
      language: this.config.language,
      smart_format: String(this.config.smart_format),
      interim_results: String(this.config.interim_results),
      utterance_end_ms: String(this.config.utterance_end_ms),
      vad_events: String(this.config.vad_events),
      diarize: String(this.config.diarize),
      punctuate: String(this.config.punctuate),
      filler_words: String(this.config.filler_words),
      utterances: "true",
      encoding: "opus",
    });

    return `${DEEPGRAM_WSS_URL}?${params.toString()}`;
  }

  get isConnected(): boolean {
    return this.ws?.readyState === WebSocket.OPEN;
  }

  get tokenSecondsRemaining(): number {
    return Math.round((this.tokenExpiresAt - Date.now()) / 1000);
  }
}

function buildEdgeFunctionUrl(fnName: string): string {
  const base = String(EDGE_BASE ?? "").replace(/\/+$/, "");

  // common patterns:
  // - https://xyz.supabase.co/functions/v1
  // - https://xyz.supabase.co (then we must append /functions/v1)
  if (base.endsWith("/functions/v1")) return `${base}/${fnName}`;
  if (base.includes("/functions/v1/")) return `${base.replace(/\/functions\/v1\/.*/, "/functions/v1")}/${fnName}`;

  return `${base}/functions/v1/${fnName}`;
}

async function fetchDeepgramToken(): Promise<TokenResponse> {
  const headers = await getAuthHeaders();

  const response = await fetch(buildEdgeFunctionUrl("deepgram-token"), {
    method: "POST",
    headers,
  });

  if (!response.ok) {
    const text = await response.text().catch(() => "");
    const maybeJson = (() => {
      try {
        return JSON.parse(text);
      } catch {
        return null;
      }
    })();

    const msg =
      maybeJson?.error ||
      maybeJson?.message ||
      text ||
      `Token fetch failed: ${response.status}`;

    throw new Error(msg);
  }

  const data = (await response.json()) as TokenResponse;

  if (!data.token) {
    throw new Error("Deepgram token response missing token field");
  }

  return data;
}

function getMajoritySpeaker(words: TranscriptWord[]): number {
  const counts = new Map<number, number>();

  for (const w of words) {
    if (w.speaker != null) {
      counts.set(w.speaker, (counts.get(w.speaker) ?? 0) + 1);
    }
  }

  if (counts.size === 0) return 0;

  let dominant = 0;
  let maxCount = 0;
  for (const [idx, count] of counts) {
    if (count > maxCount) {
      maxCount = count;
      dominant = idx;
    }
  }
  return dominant;
}

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
  return "audio/webm";
}
// Manages Deepgram WebSocket lifecycle, reconnection, and transcript parsing.

import { EDGE_BASE } from "@/lib/env";
import { getAuthHeaders } from "@/lib/network/fetchEdge";
import type {
  DeepgramConfig,
  TranscriptUtterance,
  TranscriptWord,
  DeepgramConnectionStatus,
} from "@/types/audio.types";
