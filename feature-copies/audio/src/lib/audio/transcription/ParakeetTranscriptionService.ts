/**
 * ParakeetTranscriptionService — single provider boundary for live STT.
 *
 * Wraps Deepgram streaming (server-minted tokens only). React hooks and overlay
 * components must not import Deepgram directly; use this service or useAudioSession.
 */

import { DeepgramStreamClient } from "@/lib/audio/deepgramStream";
import { resetDeepgramTokenClient } from "@/lib/audio/deepgramToken";
import { generateId } from "@/lib/utils";
import type { DeepgramConnectionStatus, TranscriptUtterance } from "@/types/audio.types";
import { loadParakeetTranscriptionConfig } from "./config";
import { partialTextToSegment, utteranceToSegment } from "./segmentMap";
import type {
  ParakeetTranscriptionCallbacks,
  ParakeetTranscriptionServiceOptions,
  TranscriptionChannel,
  TranscriptionProviderStatus,
} from "./types";

type ChannelState = {
  client: DeepgramStreamClient | null;
  stream: MediaStream | null;
  sequence: number;
  seenFinalKeys: Set<string>;
};

function mapDeepgramStatus(status: DeepgramConnectionStatus): TranscriptionProviderStatus {
  switch (status) {
    case "connecting":
      return "connecting";
    case "connected":
      return "connected";
    case "reconnecting":
      return "reconnecting";
    case "error":
      return "error";
    case "disconnected":
      return "idle";
    default:
      return "idle";
  }
}

export class ParakeetTranscriptionService {
  private readonly sessionId: string;
  private readonly correlationId: string;
  private readonly callbacks: ParakeetTranscriptionCallbacks;
  private readonly config = loadParakeetTranscriptionConfig();

  private destroyed = false;
  private paused = false;
  private globalSequence = 0;

  private readonly channels: Record<TranscriptionChannel, ChannelState> = {
    candidate: { client: null, stream: null, sequence: 0, seenFinalKeys: new Set() },
    interviewer: { client: null, stream: null, sequence: 0, seenFinalKeys: new Set() },
  };

  constructor(opts: ParakeetTranscriptionServiceOptions) {
    this.sessionId = opts.sessionId;
    this.correlationId = opts.correlationId ?? generateId();
    this.callbacks = opts.callbacks;
  }

  getSessionId(): string {
    return this.sessionId;
  }

  getCorrelationId(): string {
    return this.correlationId;
  }

  isProviderEnabled(): boolean {
    return this.config.enabled;
  }

  /**
   * Open a streaming transcription channel for the given MediaStream.
   */
  async connectChannel(stream: MediaStream, channel: TranscriptionChannel): Promise<void> {
    if (this.destroyed) {
      throw new Error("Transcription service has been destroyed.");
    }
    if (this.paused) {
      throw new Error("Transcription service is paused.");
    }
    if (!this.config.enabled) {
      this.callbacks.onStatusChange("unavailable", channel);
      throw new Error(
        "Live transcription is disabled in this environment. You can still type questions in Chat.",
      );
    }

    await this.disconnectChannelInternal(channel, { preserveStream: true });

    const state = this.channels[channel];
    state.stream = stream;
    state.sequence = 0;
    state.seenFinalKeys.clear();

    this.callbacks.onStatusChange("connecting", channel);

    const client = new DeepgramStreamClient({
      stream,
      config: {
        model: this.config.model,
        language: this.config.language,
        smart_format: true,
        interim_results: this.config.interimResults,
        utterance_end_ms: this.config.utteranceEndMs,
        vad_events: true,
        diarize: channel === "candidate",
        punctuate: true,
        filler_words: this.config.fillerWords,
      },
      onUtterance: (utterance) => this.handleFinalUtterance(utterance, channel),
      onInterim: (text) => this.handlePartial(text, channel),
      onError: (error) => {
        if (this.destroyed || this.paused) return;
        this.callbacks.onError(error, true, channel);
      },
      onStatusChange: (status) => {
        if (this.destroyed) return;
        if (this.paused && status !== "disconnected") return;
        const mapped = mapDeepgramStatus(status);
        this.callbacks.onStatusChange(mapped, channel);
      },
    });

    state.client = client;
    await client.connect();
  }

  /**
   * Controlled reconnect — reuses the last stream for a channel when available.
   */
  async reconnectChannel(channel: TranscriptionChannel): Promise<void> {
    const state = this.channels[channel];
    if (!state.stream || state.stream.getAudioTracks().every((t) => t.readyState === "ended")) {
      throw new Error(`No active audio stream for ${channel} channel.`);
    }
    await this.connectChannel(state.stream, channel);
  }

  async reconnectAll(): Promise<void> {
    const tasks: Promise<void>[] = [];
    for (const channel of ["candidate", "interviewer"] as const) {
      const state = this.channels[channel];
      if (state.stream && state.client) {
        tasks.push(this.reconnectChannel(channel));
      }
    }
    await Promise.all(tasks);
  }

  /**
   * Pause streaming without destroying session correlation or transcript history.
   */
  pause(): void {
    this.paused = true;
    for (const channel of ["candidate", "interviewer"] as const) {
      this.disconnectChannelInternal(channel, { preserveStream: true });
    }
    this.callbacks.onStatusChange("paused");
  }

  /**
   * Resume after pause — reconnects all channels that still have live streams.
   */
  async resume(): Promise<void> {
    if (this.destroyed) return;
    this.paused = false;
    const tasks: Promise<void>[] = [];
    for (const channel of ["candidate", "interviewer"] as const) {
      const state = this.channels[channel];
      if (
        state.stream &&
        state.stream.getAudioTracks().some((t) => t.readyState === "live")
      ) {
        tasks.push(this.connectChannel(state.stream, channel));
      }
    }
    await Promise.all(tasks);
  }

  /**
   * Tear down all channels. When preserveTranscriptState is true, only STT clients stop.
   */
  destroy(options?: { releaseTokenCache?: boolean }): void {
    this.destroyed = true;
    this.paused = false;
    for (const channel of ["candidate", "interviewer"] as const) {
      this.disconnectChannelInternal(channel, { preserveStream: false });
    }
    if (options?.releaseTokenCache) {
      resetDeepgramTokenClient();
    }
    this.callbacks.onStatusChange("ended");
  }

  /**
   * Stop STT for one channel without tearing down the other or session correlation.
   */
  disconnectChannel(channel: TranscriptionChannel): void {
    if (this.destroyed) return;
    this.disconnectChannelInternal(channel, { preserveStream: false });
  }

  private disconnectChannelInternal(
    channel: TranscriptionChannel,
    opts: { preserveStream: boolean },
  ): void {
    const state = this.channels[channel];
    state.client?.disconnect();
    state.client = null;
    if (!opts.preserveStream) {
      state.stream = null;
    }
    state.seenFinalKeys.clear();
  }

  private nextSequence(channel: TranscriptionChannel): number {
    this.globalSequence += 1;
    const state = this.channels[channel];
    state.sequence += 1;
    return state.sequence;
  }

  private handlePartial(text: string, channel: TranscriptionChannel): void {
    if (this.destroyed || this.paused || !text.trim()) return;
    const seq = this.nextSequence(channel);
    const segment = partialTextToSegment(this.sessionId, text, channel, seq);
    this.callbacks.onPartial(segment, channel);
  }

  private handleFinalUtterance(
    utterance: TranscriptUtterance,
    channel: TranscriptionChannel,
  ): void {
    if (this.destroyed || this.paused) return;

    const fingerprint = [
      channel,
      utterance.text.trim().toLowerCase(),
      utterance.start_ms,
      utterance.end_ms,
    ].join(":");

    const state = this.channels[channel];
    if (state.seenFinalKeys.has(fingerprint)) return;
    state.seenFinalKeys.add(fingerprint);
    if (state.seenFinalKeys.size > 500) {
      const oldest = state.seenFinalKeys.values().next().value;
      if (oldest) state.seenFinalKeys.delete(oldest);
    }

    const seq = this.nextSequence(channel);
    const segment = utteranceToSegment(utterance, this.sessionId, seq);
    this.callbacks.onFinal(segment, channel);
  }
}

export function createParakeetTranscriptionService(
  opts: ParakeetTranscriptionServiceOptions,
): ParakeetTranscriptionService {
  return new ParakeetTranscriptionService(opts);
}
