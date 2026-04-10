// src/lib/audio/deepgramStream.ts
// Manages Deepgram WebSocket lifecycle, reconnection, and transcript parsing.
//
// Fixes applied (all rounds):
//   Round 2 — Token security: ensureFreshToken() re-fetches expired 60s scoped tokens
//             before every connect() including reconnects. SUPABASE_URL removed (unused).
//   Round 2 — buildWebSocketURL: was "\\n" split bug (unrelated path), kept clean here.
//   Round 3 — getMajoritySpeaker: majority-vote over all word speaker indices instead
//             of trusting only words[0].speaker.
//   Round 3 — Filler word parsing: Deepgram type:"filler" on words is now read and
//             surfaced as filler_word_count + filler_words_used on each utterance.
//   Round 3 — utterances=true added to WebSocket URL params.

import { EDGE_BASE } from "@/lib/env";
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
/**
 * Re-fetch the token this many seconds before it expires.
 * Our scoped tokens have a 60s TTL — reconnects happening more than
 * 50s after initial connect will get a fresh token automatically.
 */
const TOKEN_REFRESH_BUFFER_S = 10;

/* ─── TYPES ─────────────────────────────────────────────────────────────── */

export interface DeepgramStreamOptions {
  stream:         MediaStream;
  config?:        Partial<DeepgramConfig>;
  onUtterance:    (utterance: TranscriptUtterance) => void;
  onInterim:      (text: string) => void;
  onError:        (error: Error) => void;
  onStatusChange: (status: DeepgramConnectionStatus) => void;
}

interface TokenResponse {
  token:      string;
  expires_in: number;       // seconds
  key_id:     string | null;
  type:       "scoped" | "raw";
}

/**
 * Deepgram word object from a streaming Results message.
 * type:"filler" is set when filler_words=true is in the URL params.
 */
interface DeepgramWord {
  word:             string;
  start:            number;
  end:              number;
  confidence:       number;
  speaker?:         number;
  punctuated_word?: string;
  type?:            "word" | "filler" | "punctuation";
}

/* ─── DEEPGRAM STREAM CLIENT ────────────────────────────────────────────── */

export class DeepgramStreamClient {
  private ws:                WebSocket | null = null;
  private mediaRecorder:     MediaRecorder | null = null;
  private reconnectAttempts: number = 0;
  private isDestroyed:       boolean = false;
  private pingInterval:      ReturnType<typeof setInterval> | null = null;

  // Token state — stored so reconnects can check freshness before re-fetching
  private currentToken:   string | null = null;
  private tokenExpiresAt: number = 0;    // Unix ms timestamp

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
      diarize:          true,   // word-level speaker index (0, 1, ...)
      punctuate:        true,
      filler_words:     true,   // marks words with type:"filler"
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

    // Browsers cannot set Authorization headers on WebSocket connections.
    // Deepgram supports token auth via the WebSocket subprotocol array.
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
        // Graceful close — tells Deepgram to flush any remaining transcript
        this.ws.send(JSON.stringify({ type: "CloseStream" }));
      }
      this.ws.close(1000, "User disconnected");
      this.ws = null;
    }

    this.callbacks.onStatusChange("disconnected");
  }

  /* ── TOKEN MANAGEMENT ────────────────────────────────────────────────── */

  /**
   * Ensures we have a non-expired token before opening a WebSocket.
   * For 60s TTL tokens: re-fetches whenever within TOKEN_REFRESH_BUFFER_S of
   * expiry, which for 60s tokens means effectively always on reconnect.
   */
  private async ensureFreshToken(): Promise<void> {
    const nowMs            = Date.now();
    const bufferMs         = TOKEN_REFRESH_BUFFER_S * 1000;
    const isExpiredOrClose = !this.currentToken || (nowMs + bufferMs) >= this.tokenExpiresAt;

    if (isExpiredOrClose) {
      const tokenData     = await fetchDeepgramToken();
      this.currentToken   = tokenData.token;
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

    // Unexpected close — exponential backoff reconnect
    if (event.code !== 1000 && this.reconnectAttempts < MAX_RECONNECT_ATTEMPTS) {
      this.reconnectAttempts++;
      const delay = RECONNECT_BASE_DELAY_MS * Math.pow(2, this.reconnectAttempts - 1);
      this.callbacks.onStatusChange("reconnecting");
      setTimeout(() => {
        if (!this.isDestroyed) {
          // connect() calls ensureFreshToken() — the 60s token is likely
          // expired during the backoff delay, so a new one will be fetched.
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

      /* ── Interim result ─────────────────────────────────────────────── */
      if (data.type === "Results" && !data.is_final) {
        const channel = data.channel as {
          alternatives?: Array<{ transcript?: string }>;
        };
        const interimText = channel?.alternatives?.[0]?.transcript ?? "";
        if (interimText) this.callbacks.onInterim(interimText);
        return;
      }

      /* ── Final result ───────────────────────────────────────────────── */
      if (data.type === "Results" && data.is_final) {
        const channel = data.channel as {
          alternatives?: Array<{
            transcript?: string;
            confidence?: number;
            words?:      DeepgramWord[];
          }>;
        };

        const alt = channel?.alternatives?.[0];
        if (!alt?.transcript) return;

        // Map Deepgram word objects to our TranscriptWord type,
        // preserving the type field so diarization.ts can count fillers.
        const words: TranscriptWord[] = (alt.words ?? []).map((w) => ({
          word:            w.word,
          start:           w.start,
          end:             w.end,
          confidence:      w.confidence,
          speaker:         w.speaker,
          punctuated_word: w.punctuated_word,
          type:            w.type,          // "word" | "filler" | "punctuation"
        }));

        // FIX: majority-vote speaker across all words instead of words[0].
        // When diarize=true, Deepgram assigns a numeric speaker index to each
        // word. An utterance can span a speaker boundary, so dominant speaker
        // by word count is more accurate than trusting the first word only.
        const speakerIndex = getMajoritySpeaker(words);
        const speaker      = speakerIndex === 0 ? "interviewer" : "candidate";
        const text         = alt.transcript.trim();

        // FIX: parse Deepgram's type:"filler" word flags.
        // Requires filler_words=true in the WebSocket URL (set in buildWebSocketURL).
        // diarization.ts analyseFillerWords() uses these for per-session coaching.
        const fillerWords  = words.filter((w) => w.type === "filler");
        const fillerCount  = fillerWords.length;
        const fillerList   = fillerWords.map((w) => w.word.toLowerCase());

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
          // Filler word data for coaching feedback panel
          filler_word_count:       fillerCount > 0 ? fillerCount : undefined,
          filler_words_used:       fillerList.length > 0 ? fillerList : undefined,
        };

        this.callbacks.onUtterance(utterance);
        return;
      }

      /* ── VAD: utterance boundary ────────────────────────────────────── */
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

  /* ── PRIVATE: URL BUILDER ─────────────────────────────────────────────── */

  /**
   * Builds the Deepgram streaming WebSocket URL with all required params.
   *
   * Key params:
   *   diarize=true        → word-level speaker index (0 = interviewer, 1 = candidate)
   *   filler_words=true   → marks fillers (um, uh, like) with type:"filler" per word
   *   utterances=true     → forward-compat for when Deepgram adds streaming utterances
   *   vad_events=true     → UtteranceEnd events for boundary detection
   *   utterance_end_ms    → ms of silence before Deepgram fires UtteranceEnd
   *   interim_results=true → partial transcript delivered as user speaks
   */
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
      utterances:       "true",
      encoding:         "opus",
    });
    return `${DEEPGRAM_WSS_URL}?${params.toString()}`;
  }

  /* ── PUBLIC GETTERS ───────────────────────────────────────────────────── */

  get isConnected(): boolean {
    return this.ws?.readyState === WebSocket.OPEN;
  }

  /** Seconds until the current scoped token expires. Negative = already expired. */
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
    const body = await response
      .json()
      .catch(() => ({ error: `HTTP ${response.status}` })) as {
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

/**
 * Returns the most frequent speaker index across all words in an utterance.
 *
 * Deepgram's diarize=true assigns a numeric speaker index to each word
 * independently. An utterance can span a speaker change mid-sentence
 * (e.g. interviewer finishes their question while candidate starts replying).
 * Majority vote gives the most accurate single-speaker attribution for
 * routing to "interviewer" vs "candidate".
 *
 * Falls back to 0 (interviewer) when:
 *   - No words have a speaker index (diarize was off or Nova-2 couldn't diarize)
 *   - This is the safest default because misidentifying the interviewer's question
 *     as a candidate utterance would suppress the AI hint trigger.
 */
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

/**
 * Selects the best supported MediaRecorder MIME type for the current browser.
 * Deepgram's streaming endpoint accepts WebM/Opus and OGG/Opus natively.
 * The encoding=opus URL param tells Deepgram what to expect.
 */
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
  return "audio/webm"; // last resort
}
