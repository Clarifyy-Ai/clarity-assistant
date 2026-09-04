import { beforeEach, describe, expect, it, vi } from "vitest";
import type { DeepgramStreamOptions } from "@/lib/audio/deepgramStream";
import type { TranscriptUtterance } from "@/types/audio.types";
import * as liveTranscription from "@/lib/audio/transcription";
import { finalSegmentFingerprint, rememberFinalKey } from "@/lib/audio/transcription/finalKeys";
import type { TranscriptSegment, TranscriptionChannel } from "@/lib/audio/transcription/types";

type FakeDeepgramClient = {
  opts: DeepgramStreamOptions;
  connect: ReturnType<typeof vi.fn>;
  disconnect: ReturnType<typeof vi.fn>;
  emitInterim: (text: string) => void;
  emitFinal: (utterance: TranscriptUtterance) => void;
  noteFrame: (sent: boolean) => void;
};

const mockClients: FakeDeepgramClient[] = [];
let mockNextConnectError: Error | null = null;

vi.mock("@/lib/audio/deepgramStream", () => {
  class DeepgramStreamClient {
    opts: DeepgramStreamOptions;
    private received = 0;
    private transmitted = 0;
    private queued = 0;
    connect = vi.fn(async () => {
      if (mockNextConnectError) {
        const error = mockNextConnectError;
        this.opts.onError(error);
        this.opts.onStatusChange("error");
        throw error;
      }
      this.opts.onStatusChange("connected");
    });
    disconnect = vi.fn(() => {
      this.opts.onStatusChange("disconnected");
    });
    getHealthSnapshot = vi.fn(() => ({
      receivedFrameCount: this.received,
      transmittedFrameCount: this.transmitted,
      queuedFrameCount: this.queued,
      sttSocketOpen: true,
      lastKeepAliveAt: null,
      lastSttMessageAt: null,
    }));
    constructor(opts: DeepgramStreamOptions) {
      this.opts = opts;
      const self = this;
      mockClients.push({
        get opts() {
          return self.opts;
        },
        connect: self.connect,
        disconnect: self.disconnect,
        emitInterim: (text: string) => self.opts.onInterim(text),
        emitFinal: (utterance: TranscriptUtterance) => self.opts.onUtterance(utterance),
        noteFrame: (sent: boolean) => {
          self.received += 1;
          if (sent) self.transmitted += 1;
          else self.queued += 1;
          self.opts.onAudioFrame?.(sent);
        },
      });
    }
  }
  return { DeepgramStreamClient };
});

vi.mock("@/lib/audio/transcription/finalKeys", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/audio/transcription/finalKeys")>();
  return {
    ...actual,
    finalSegmentFingerprint: (
      channelOrInput: unknown,
      text?: string,
      startMs?: number,
      endMs?: number,
    ) => {
      if (channelOrInput && typeof channelOrInput === "object") {
        const input = channelOrInput as {
          channel: TranscriptionChannel;
          text: string;
          startMs: number;
          endMs: number;
        };
        if ("channel" in input && "text" in input) {
          return [input.channel, input.text.trim().toLowerCase(), input.startMs, input.endMs].join(
            ":",
          );
        }
      }
      return actual.finalSegmentFingerprint(
        channelOrInput as TranscriptionChannel,
        text ?? "",
        startMs ?? 0,
        endMs ?? 0,
      );
    },
  };
});

type LiveCallbacks = {
  onPartial: (segment: TranscriptSegment, channel: TranscriptionChannel) => void;
  onFinal: (segment: TranscriptSegment, channel: TranscriptionChannel) => void;
  onStatusChange: (status: string, channel?: TranscriptionChannel) => void;
  onError: (error: Error, recoverable: boolean, channel?: TranscriptionChannel) => void;
};

type LiveService = {
  getSessionId: () => string;
  connectChannel: (stream: MediaStream, channel: TranscriptionChannel) => Promise<void>;
  reconnectChannel: (channel: TranscriptionChannel) => Promise<void>;
  pause: () => void;
  resume: () => Promise<void>;
  destroy: (options?: { releaseTokenCache?: boolean }) => void;
};

function createLiveTranscriptionService(opts: {
  sessionId: string;
  correlationId?: string;
  callbacks: LiveCallbacks;
}): LiveService {
  const api = liveTranscription as typeof liveTranscription & {
    createLiveTranscriptionService?: (o: typeof opts) => LiveService;
    createParakeetTranscriptionService?: (o: typeof opts) => LiveService;
    LiveTranscriptionService?: new (o: typeof opts) => LiveService;
    ParakeetTranscriptionService?: new (o: typeof opts) => LiveService;
  };
  if (typeof api.createLiveTranscriptionService === "function") {
    return api.createLiveTranscriptionService(opts);
  }
  if (typeof api.createParakeetTranscriptionService === "function") {
    return api.createParakeetTranscriptionService(opts);
  }
  const Ctor = api.LiveTranscriptionService ?? api.ParakeetTranscriptionService;
  if (Ctor) return new Ctor(opts);
  throw new Error("createLiveTranscriptionService is not exported from @/lib/audio/transcription");
}

function liveStream(): MediaStream {
  return {
    getAudioTracks: () => [{ readyState: "live" } as MediaStreamTrack],
  } as MediaStream;
}

function sampleUtterance(text: string): TranscriptUtterance {
  return {
    id: "utt-1",
    speaker: "candidate",
    text,
    words: [],
    start_ms: 0,
    end_ms: 1200,
    is_final: true,
    is_interviewer_question: false,
    confidence: 0.94,
  };
}

function createHarness() {
  const partials: TranscriptSegment[] = [];
  const finals: TranscriptSegment[] = [];
  const statuses: string[] = [];
  const errors: Error[] = [];
  const service = createLiveTranscriptionService({
    sessionId: "11111111-1111-4111-8111-111111111111",
    callbacks: {
      onPartial: (seg) => partials.push(seg),
      onFinal: (seg) => finals.push(seg),
      onStatusChange: (status) => statuses.push(status),
      onError: (err) => errors.push(err),
    },
  });
  return { service, partials, finals, statuses, errors };
}

describe("Live transcription pipeline (Deepgram adapter)", () => {
  beforeEach(() => {
    mockClients.length = 0;
    mockNextConnectError = null;
    vi.unstubAllEnvs();
  });

  it("uses one service instance; reconnect opens a new Deepgram client on the same stream", async () => {
    const { service } = createHarness();
    const stream = liveStream();
    await service.connectChannel(stream, "candidate");
    expect(mockClients).toHaveLength(1);
    await service.reconnectChannel("candidate");
    expect(mockClients).toHaveLength(2);
    expect(mockClients[0]?.disconnect).toHaveBeenCalled();
    expect(mockClients[1]?.opts.stream).toBe(stream);
    expect(service.getSessionId()).toBe("11111111-1111-4111-8111-111111111111");
    service.destroy();
  });

  it("emits partial then final and drops duplicate finals", async () => {
    const { service, partials, finals } = createHarness();
    await service.connectChannel(liveStream(), "candidate");
    const client = mockClients[0]!;
    client.emitInterim("Hello wor");
    client.emitFinal(sampleUtterance("Hello world"));
    client.emitFinal(sampleUtterance("Hello world"));
    expect(partials[0]?.text).toBe("Hello wor");
    expect(partials[0]?.isFinal).toBe(false);
    expect(finals).toHaveLength(1);
    expect(finals[0]?.text).toBe("Hello world");
    service.destroy();
  });

  it("tracks frame health snapshots and transcript timestamps on interviewer channel", async () => {
    const { service } = createHarness();
    await service.connectChannel(liveStream(), "interviewer");
    const client = mockClients[0]!;
    client.noteFrame(true);
    client.noteFrame(false);
    client.emitInterim("What is");
    const probe = service.getChannelHealthProbe("interviewer");
    expect(probe.frames?.receivedFrameCount).toBe(2);
    expect(probe.frames?.transmittedFrameCount).toBe(1);
    expect(probe.frames?.queuedFrameCount).toBe(1);
    expect(probe.lastTranscriptEventAt).toBeTypeOf("number");
    expect(probe.sttStatus).toBe("connected");
    service.destroy();
  });

  it("pause/resume/destroy tears down Deepgram clients without fabricating transcript text", async () => {
    const { service, partials, finals } = createHarness();
    await service.connectChannel(liveStream(), "candidate");
    expect(mockClients[0]?.disconnect).not.toHaveBeenCalled();
    service.pause();
    expect(mockClients[0]?.disconnect).toHaveBeenCalled();
    const beforeResume = mockClients.length;
    await service.resume();
    expect(mockClients.length).toBeGreaterThan(beforeResume);
    expect(partials).toHaveLength(0);
    expect(finals).toHaveLength(0);
    service.destroy();
    expect(mockClients.at(-1)?.disconnect).toHaveBeenCalled();
  });

  it("surfaces provider_unavailable when live transcription is disabled", async () => {
    vi.stubEnv("VITE_ENABLE_LIVE_TRANSCRIPTION", "false");
    const { service, partials, finals, statuses } = createHarness();
    await expect(service.connectChannel(liveStream(), "candidate")).rejects.toMatchObject({
      message: expect.stringMatching(/disabled|unavailable/i),
    });
    expect(mockClients).toHaveLength(0);
    expect(partials).toHaveLength(0);
    expect(finals).toHaveLength(0);
    expect(statuses).toContain("unavailable");
    service.destroy();
  });

  it("does not emit fake speech when Deepgram is unavailable", async () => {
    mockNextConnectError = Object.assign(new Error("Live transcription is unavailable."), {
      code: "provider_unavailable",
    });
    const { service, partials, finals, errors } = createHarness();
    await expect(service.connectChannel(liveStream(), "candidate")).rejects.toThrow(/unavailable/i);
    expect(partials).toHaveLength(0);
    expect(finals).toHaveLength(0);
    expect(errors[0]?.message).toMatch(/unavailable/i);
    service.destroy();
  });
});

describe("final key de-dupe", () => {
  it("rejects duplicate fingerprints", () => {
    const seen = new Set<string>();
    const objectKey = finalSegmentFingerprint({
      channel: "candidate",
      text: "Hi",
      startMs: 0,
      endMs: 10,
    } as never);
    const key =
      typeof objectKey === "string" && !String(objectKey).startsWith("[object Object]")
        ? objectKey
        : finalSegmentFingerprint("candidate" as TranscriptionChannel, "Hi", 0, 10);
    expect(rememberFinalKey(seen, key)).toBe(true);
    expect(rememberFinalKey(seen, key)).toBe(false);
  });
});
