/**
 * LiveTranscriptionService — live overlay STT boundary.
 *
 * One Deepgram streaming client per audio channel, one service instance per
 * session. Tokens are minted via the deepgram-token edge function.
 * There is no NVIDIA / Parakeet cloud API.
 */

import { DeepgramStreamClient } from "@/lib/audio/deepgramStream";
import type { DeepgramClientHealthSnapshot } from "@/lib/audio/deepgramStream";
import { resetDeepgramTokenClient } from "@/lib/audio/deepgramToken";
import { useAudioStore } from "@/store/audioStore";
import { generateId } from "@/lib/utils";
import type { DeepgramConnectionStatus, TranscriptUtterance } from "@/types/audio.types";
import { loadLiveTranscriptionConfig } from "./config";
import { finalSegmentFingerprint, rememberFinalKey } from "./finalKeys";
import { partialTextToSegment, utteranceToSegment } from "./segmentMap";
import type {
  LiveTranscriptionCallbacks,
  LiveTranscriptionServiceOptions,
  TranscriptionChannel,
  TranscriptionProviderStatus,
} from "./types";

export type ChannelHealthProbe = {
  stream: MediaStream | null;
  lastTranscriptEventAt: number | null;
  sttStatus: TranscriptionProviderStatus;
  frames: DeepgramClientHealthSnapshot | null;
};

type ChannelState = {
  client: DeepgramStreamClient | null;
  stream: MediaStream | null;
  sequence: number;
  seenFinalKeys: Set<string>;
  connectInFlight: Promise<void> | null;
  lastTranscriptEventAt: number | null;
  sttStatus: TranscriptionProviderStatus;
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

export class LiveTranscriptionService {
  private readonly sessionId: string;
  private readonly correlationId: string;
  private readonly callbacks: LiveTranscriptionCallbacks;
  private readonly config = loadLiveTranscriptionConfig();

  private destroyed = false;
  private paused = false;
  private globalSequence = 0;

  /** Bounded rolling window of recent interviewer finals (for AI Help freeze). */
  private readonly interviewerRing: string[] = [];
  private static readonly INTERVIEWER_RING_MAX = 12;

  private readonly channels: Record<TranscriptionChannel, ChannelState> = {
    candidate: {
      client: null,
      stream: null,
      sequence: 0,
      seenFinalKeys: new Set(),
      connectInFlight: null,
      lastTranscriptEventAt: null,
      sttStatus: "idle",
    },
    interviewer: {
      client: null,
      stream: null,
      sequence: 0,
      seenFinalKeys: new Set(),
      connectInFlight: null,
      lastTranscriptEventAt: null,
      sttStatus: "idle",
    },
  };

  constructor(opts: LiveTranscriptionServiceOptions) {
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

  getChannelHealthProbe(channel: TranscriptionChannel): ChannelHealthProbe {
    const state = this.channels[channel];
    return {
      stream: state.stream,
      lastTranscriptEventAt: state.lastTranscriptEventAt,
      sttStatus: state.sttStatus,
      frames: state.client?.getHealthSnapshot() ?? null,
    };
  }

  async connectChannel(stream: MediaStream, channel: TranscriptionChannel): Promise<void> {
    if (this.destroyed) {
      throw new Error("Transcription service has been destroyed.");
    }
    if (this.paused) {
      throw new Error("Transcription service is paused.");
    }
    if (!this.config.enabled) {
      this.callbacks.onStatusChange("unavailable", channel);
      throw Object.assign(
        new Error(
          "Live transcription is disabled in this environment. You can still type questions in Chat.",
        ),
        { code: "provider_unavailable" },
      );
    }

    const state = this.channels[channel];
    if (state.connectInFlight) return state.connectInFlight;

    const run = (async () => {
      await this.disconnectChannelInternal(channel, { preserveStream: true });

      state.stream = stream;
      state.sequence = 0;
      state.seenFinalKeys.clear();
      state.lastTranscriptEventAt = null;
      state.sttStatus = "connecting";
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
          state.sttStatus = "error";
          this.callbacks.onError(error, true, channel);
        },
        onStatusChange: (status) => {
          if (this.destroyed) return;
          if (this.paused && status !== "disconnected") return;
          const mapped = mapDeepgramStatus(status);
          state.sttStatus = mapped;
          this.callbacks.onStatusChange(mapped, channel);
        },
        onAudioFrame:
          channel === "interviewer"
            ? (sent) => {
                useAudioStore.getState().noteInterviewerCaptureFrame(sent);
              }
            : undefined,
        onHeartbeat:
          channel === "interviewer"
            ? () => {
                useAudioStore.getState().noteInterviewerCaptureHeartbeat();
              }
            : undefined,
      });

      state.client = client;
      await client.connect();
    })();

    state.connectInFlight = run;
    try {
      await run;
    } finally {
      if (state.connectInFlight === run) state.connectInFlight = null;
    }
  }

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
      if (state.stream && (state.client || state.connectInFlight)) {
        tasks.push(this.reconnectChannel(channel));
      }
    }
    await Promise.all(tasks);
  }

  pause(): void {
    this.paused = true;
    for (const channel of ["candidate", "interviewer"] as const) {
      this.disconnectChannelInternal(channel, { preserveStream: true });
    }
    this.callbacks.onStatusChange("paused");
  }

  async resume(): Promise<void> {
    if (this.destroyed) return;
    this.paused = false;
    const tasks: Promise<void>[] = [];
    for (const channel of ["candidate", "interviewer"] as const) {
      const state = this.channels[channel];
      if (state.stream && state.stream.getAudioTracks().some((t) => t.readyState === "live")) {
        tasks.push(this.connectChannel(state.stream, channel));
      }
    }
    await Promise.all(tasks);
  }

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

  disconnectChannel(channel: TranscriptionChannel): void {
    if (this.destroyed) return;
    this.disconnectChannelInternal(channel, { preserveStream: false });
  }

  /**
   * Snapshot recent interviewer transcript text from the bounded ring buffer.
   * Call on AI Help click to freeze the window used for question confirmation.
   */
  snapshotRecentInterviewerTranscript(maxChars = 2_000): string {
    const joined = this.interviewerRing.join(" ").replace(/\s+/g, " ").trim();
    if (joined.length <= maxChars) return joined;
    return joined.slice(-maxChars).trim();
  }

  private pushInterviewerRing(text: string): void {
    const trimmed = text.trim();
    if (!trimmed) return;
    this.interviewerRing.push(trimmed);
    while (this.interviewerRing.length > LiveTranscriptionService.INTERVIEWER_RING_MAX) {
      this.interviewerRing.shift();
    }
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
    this.channels[channel].sequence += 1;
    return this.channels[channel].sequence;
  }

  private handlePartial(text: string, channel: TranscriptionChannel): void {
    if (this.destroyed || this.paused || !text.trim()) return;
    this.channels[channel].lastTranscriptEventAt = Date.now();
    const seq = this.nextSequence(channel);
    this.callbacks.onPartial(partialTextToSegment(this.sessionId, text, channel, seq), channel);
  }

  private handleFinalUtterance(
    utterance: TranscriptUtterance,
    channel: TranscriptionChannel,
  ): void {
    if (this.destroyed || this.paused) return;
    if (!utterance.is_final) return;
    const fingerprint = finalSegmentFingerprint(
      channel,
      utterance.text,
      utterance.start_ms,
      utterance.end_ms,
    );
    if (!rememberFinalKey(this.channels[channel].seenFinalKeys, fingerprint)) return;
    this.channels[channel].lastTranscriptEventAt = Date.now();
    const seq = this.nextSequence(channel);
    if (channel === "interviewer") {
      this.pushInterviewerRing(utterance.text);
    }
    this.callbacks.onFinal(utteranceToSegment(utterance, this.sessionId, seq), channel);
  }
}

export function createLiveTranscriptionService(
  opts: LiveTranscriptionServiceOptions,
): LiveTranscriptionService {
  return new LiveTranscriptionService(opts);
}
