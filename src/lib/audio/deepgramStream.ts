// src/lib/audio/deepgramStream.ts — PRODUCTION FIXED
// Fixes:
// - Imports hoisted to top (were scattered after class body — caused runtime reference errors)
// - buildEdgeFunctionUrl regex: removed double-escaped backslashes (\\/ → \/)
// - handleClose: permanent auth error codes (4001, 4008) skip retry loop entirely
// - handleError: preserves event type context for better error surfacing
// - WebSocket subprotocol auth confirmed correct: new WebSocket(url, ["token", token])
// - RESTART_CLOSE_CODE check in handleClose prevents reconnect on controlled restart

import { fetchEdgeJson } from "@/lib/network/fetchEdge";
import { useAuthStore } from "@/store/authStore";
import { useAudioStore } from "@/store/audioStore";
import { FEATURE_FLAGS, FEATURE_PLAN_GATE } from "@/lib/constants/features";
import { generateId } from "@/lib/utils";
import { isInterviewerQuestionText } from "./interviewerQuestion";
import type {
  DeepgramConfig,
  TranscriptUtterance,
  TranscriptWord,
  DeepgramConnectionStatus,
} from "@/types/audio.types";

/* ─── CONSTANTS ─────────────────────────────────────────────────────────── */

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

// ✅ FIX: Deepgram permanent auth failure close codes — do NOT retry these.
// 4001 = Invalid credentials (bad token / wrong subprotocol format)
// 4008 = Token expired at handshake time
// 1008 = Policy violation (project limits exceeded)
const PERMANENT_CLOSE_CODES = new Set([4001, 4008, 1008]);

/* ─── TYPES ─────────────────────────────────────────────────────────────── */

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

/* ─── CLIENT ─────────────────────────────────────────────────────────────── */

export class DeepgramStreamClient {
  private ws: WebSocket | null = null;
  private mediaRecorder: MediaRecorder | null = null;

  private reconnectAttempts = 0;
  private seenFinalSegments = new Set<string>();

  // IMPORTANT:
  // - destroyed: permanent teardown (disconnect/unmount). connect() should not proceed.
  // - restarting: controlled close+reopen where we do NOT want reconnect loop to kick in.
  private destroyed = false;
  private restarting = false;

  private pingInterval: ReturnType<typeof setInterval> | null = null;
  private tokenRefreshTimer: ReturnType<typeof setTimeout> | null = null;

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
      const msg = err instanceof Error ? err.message : String(err);
      this.callbacks.onError(new Error(`Deepgram token error: ${msg}`));
      this.callbacks.onStatusChange("error");
      throw new Error(`Deepgram token error: ${msg}`);
    }

    if (!this.currentToken) {
      this.callbacks.onError(new Error("No Deepgram token available"));
      this.callbacks.onStatusChange("error");
      throw new Error("No Deepgram token available");
    }

    const url = this.buildWebSocketURL();

    // ✅ CORRECT: Deepgram scoped/temporary tokens MUST be passed via the
    // WebSocket subprotocol header. Query-param auth (?access_token=...) only
    // works for permanent API keys and will 401 on temporary/scoped tokens.
    // Spec: https://developers.deepgram.com/docs/authenticating#websocket
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
    this.stopTokenRefresh();

    if (this.ws) {
      try {
        if (this.ws.readyState === WebSocket.OPEN) {
          this.ws.send(JSON.stringify({ type: "CloseStream" }));
        }
      } catch {
        // ignore send failures on teardown
      }

      try {
        this.ws.close(1000, "User disconnected");
      } catch {
        // ignore close failures on teardown
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
      this.tokenExpiresAt = Date.now() + tokenData.expires_in * 1000;
    }
  }

  private handleOpen(): void {
    this.reconnectAttempts = 0;
    this.callbacks.onStatusChange("connected");
    this.startMediaRecorder();
    this.startPing();
    this.scheduleTokenRefresh();
    void import("@/lib/overlay/qaDeepgramDisconnect").then((mod) => {
      if (!mod.isQaDeepgramDisconnectEnabled()) return;
      window.setTimeout(() => {
        if (this.destroyed || !this.ws) return;
        this.callbacks.onStatusChange("reconnecting");
        this.ws.close(1001, "qa_simulated_disconnect");
      }, 1500);
    });
  }

  private handleClose(event: CloseEvent): void {
    this.stopMediaRecorder();
    this.stopPing();

    if (this.destroyed) return;

    // Controlled restart — do not trigger reconnect loop
    if (this.restarting || event.code === RESTART_CLOSE_CODE) {
      return;
    }

    // ✅ FIX: Permanent Deepgram auth/policy failure codes — skip retry entirely.
    // Retrying on 4001/4008 would just loop until MAX_RECONNECT_ATTEMPTS with no chance
    // of success (the token itself is invalid; a new token is needed via ensureFreshToken,
    // which restart() handles, but an unexpected 4001 means the token was already bad).
    if (PERMANENT_CLOSE_CODES.has(event.code)) {
      const reason = event.reason || `Deepgram auth failure (code ${event.code})`;
      this.callbacks.onError(new Error(`Deepgram WS closed permanently: ${reason}`));
      this.callbacks.onStatusChange("error");
      return;
    }

    if (event.code !== 1000) {
      // Surface non-normal closes for diagnostics
      this.callbacks.onError(
        new Error(
          `Deepgram WS closed: code=${event.code}${event.reason ? ` reason=${event.reason}` : ""}`,
        ),
      );
    }

    if (event.code !== 1000 && this.reconnectAttempts < MAX_RECONNECT_ATTEMPTS) {
      this.reconnectAttempts++;
      const delay = RECONNECT_BASE_DELAY_MS * Math.pow(2, this.reconnectAttempts - 1);
      this.callbacks.onStatusChange("reconnecting");
      setTimeout(() => {
        if (!this.destroyed) {
          void this.connect().catch((error) => {
            this.callbacks.onError(
              error instanceof Error ? error : new Error("Deepgram reconnect failed"),
            );
            this.callbacks.onStatusChange("error");
          });
        }
      }, delay);
    } else {
      this.callbacks.onStatusChange("disconnected");
    }
  }

  private handleError(event: Event): void {
    // ✅ FIX: Include event type context — bare "WebSocket connection error" is
    // unhelpful for debugging. The WS onerror fires before onclose on auth failures,
    // so the permanent-close-code check in handleClose catches those; this handles
    // network-level errors (DNS, TCP reset, etc.).
    const detail = (event as ErrorEvent).message ?? event.type ?? "unknown";
    this.callbacks.onError(
      new Error(`Deepgram WebSocket connection error: ${detail}`),
    );
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

        // Do NOT assume speaker-0 = interviewer. Without word-level speaker
        // labels (or when diarize is off), leave as unknown — Live overrides
        // via forcedSpeaker on dual channels.
        const speakerIndex = getMajoritySpeaker(words);
        const speaker =
          speakerIndex === null
            ? "unknown"
            : speakerIndex === 0
              ? "interviewer"
              : "candidate";
        const text = String(alt.transcript ?? "").trim();
        if (!text) return;
        const fingerprint = [
          speaker,
          text.toLowerCase(),
          Math.round(((data.start as number) ?? 0) * 1000),
          Math.round((((data.start as number) ?? 0) + ((data.duration as number) ?? 0)) * 1000),
        ].join(":");
        if (this.seenFinalSegments.has(fingerprint)) return;
        this.seenFinalSegments.add(fingerprint);
        if (this.seenFinalSegments.size > 500) {
          const oldest = this.seenFinalSegments.values().next().value;
          if (oldest) this.seenFinalSegments.delete(oldest);
        }

        const fillerWords = words.filter((w) => w.type === "filler");
        const fillerCount = fillerWords.length;
        const fillerList = fillerWords.map((w) => String(w.word ?? "").toLowerCase());

        // Ambiguous speakers must not mark interviewer questions — Live dual
        // path re-evaluates after forcedSpeaker in processUtteranceForDiarization.
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
          is_interviewer_question:
            speaker === "interviewer" && isInterviewerQuestionText(text),
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

    // Send chunks every 250ms — prevents Deepgram timing out from silence gaps
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
    // Keepalive for when audio isn't continuously streaming (silence detection)
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

  private scheduleTokenRefresh(): void {
      this.stopTokenRefresh();
      const refreshIn = Math.max(5_000, this.tokenExpiresAt - Date.now() - TOKEN_REFRESH_BUFFER_S * 1000);
      this.tokenRefreshTimer = setTimeout(() => {
        if (!this.destroyed) void this.restart();
      }, refreshIn);
    }

  private stopTokenRefresh(): void {
      if (this.tokenRefreshTimer) {
        clearTimeout(this.tokenRefreshTimer);
        this.tokenRefreshTimer = null;
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

/* ─── HELPERS ────────────────────────────────────────────────────────────── */

async function fetchDeepgramToken(): Promise<TokenResponse> {
  try {
    const data = await fetchEdgeJson<TokenResponse>("deepgram-token", {});
    if (!data?.token) {
      throw new Error("Deepgram token response missing token field");
    }
    return data;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err ?? "");
    if (/503|502|unavailable|misconfigured|SERVICE_UNAVAILABLE|MISSING_PROJECT_ID/i.test(msg)) {
      throw new Error(
        "Live transcription is unavailable. You can still type questions in Chat.",
      );
    }
    throw new Error(
      msg.trim() || "Could not start speech recognition. Please try again.",
    );
  }
}

/** Returns null when no word-level speaker labels exist (do not invent 0). */
function getMajoritySpeaker(words: TranscriptWord[]): number | null {
  const counts = new Map<number, number>();

  for (const w of words) {
    if (w.speaker != null) {
      counts.set(w.speaker, (counts.get(w.speaker) ?? 0) + 1);
    }
  }

  if (counts.size === 0) return null;

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
