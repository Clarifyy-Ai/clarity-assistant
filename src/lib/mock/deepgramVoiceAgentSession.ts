/**
 * Deepgram Voice Agent WebSocket client for mock interviews.
 * Inject-only: Connect → Settings (no greeting) → InjectAgentMessage for scripted Qs.
 * Default: no mic capture (candidate STT stays on nova-3 LiveTranscription).
 */

import { fetchDeepgramTokenBounded } from "@/lib/audio/deepgramToken";
import {
  DEEPGRAM_AGENT_WS_URL,
  type DeepgramAgentSettings,
  buildMockInterviewAgentSettings,
  type MockAgentContext,
} from "@/lib/mock/deepgramVoiceAgentSettings";

export type VoiceAgentStatus =
  | "idle"
  | "connecting"
  | "ready"
  | "speaking"
  | "listening"
  | "error"
  | "closed";

export type VoiceAgentHandlers = {
  onStatus?: (status: VoiceAgentStatus) => void;
  onUserTranscript?: (text: string, isFinal: boolean) => void;
  onAgentTranscript?: (text: string) => void;
  onAgentAudioDone?: () => void;
  onError?: (error: Error) => void;
  onSettingsApplied?: () => void;
};

function pcm16ToAudioBuffer(
  ctx: AudioContext,
  pcm: ArrayBuffer,
  sampleRate: number,
): AudioBuffer {
  const view = new DataView(pcm);
  const sampleCount = Math.floor(pcm.byteLength / 2);
  const buffer = ctx.createBuffer(1, sampleCount, sampleRate);
  const channel = buffer.getChannelData(0);
  for (let i = 0; i < sampleCount; i += 1) {
    channel[i] = view.getInt16(i * 2, true) / 0x8000;
  }
  return buffer;
}

export type DeepgramVoiceAgentSessionOptions = {
  /**
   * When true, stream mic PCM into the agent (Flux listen).
   * Default false for mock inject-only — avoids dual STT with nova-3.
   */
  captureMic?: boolean;
};

type SpeakWaiter = {
  resolve: () => void;
  reject: (err: Error) => void;
  timer: ReturnType<typeof setTimeout>;
  audioDone: boolean;
  playbackDrainTimer: ReturnType<typeof setTimeout> | null;
};

/** Exported for unit tests — decide when a speak waiter may resolve. */
export function shouldResolveSpeakAfterAudioDone(args: {
  audioDone: boolean;
  playbackRemainingMs: number;
}): boolean {
  return args.audioDone && args.playbackRemainingMs <= 0;
}

export class DeepgramVoiceAgentSession {
  private ws: WebSocket | null = null;
  private mediaStream: MediaStream | null = null;
  private audioContext: AudioContext | null = null;
  private processor: ScriptProcessorNode | null = null;
  private source: MediaStreamAudioSourceNode | null = null;
  private silentGain: GainNode | null = null;
  private playbackCtx: AudioContext | null = null;
  private nextPlayTime = 0;
  private destroyed = false;
  private settingsApplied = false;
  private status: VoiceAgentStatus = "idle";
  private settings: DeepgramAgentSettings;
  private handlers: VoiceAgentHandlers;
  private captureMic: boolean;
  private speakWaiters = new Map<string, SpeakWaiter>();
  private pendingSpeakId: string | null = null;

  constructor(
    settings: DeepgramAgentSettings,
    handlers: VoiceAgentHandlers = {},
    options: DeepgramVoiceAgentSessionOptions = {},
  ) {
    this.settings = settings;
    this.handlers = handlers;
    // Inject-only default: no mic capture unless explicitly enabled.
    this.captureMic = options.captureMic === true;
  }

  get isReady(): boolean {
    return this.settingsApplied && this.ws?.readyState === WebSocket.OPEN;
  }

  /** Test helper — whether mic capture is enabled for this session. */
  get isCapturingMic(): boolean {
    return this.captureMic;
  }

  private setStatus(next: VoiceAgentStatus) {
    this.status = next;
    this.handlers.onStatus?.(next);
  }

  async connect(micStream?: MediaStream | null): Promise<void> {
    if (this.destroyed) throw new Error("Voice agent session was closed.");
    this.setStatus("connecting");
    this.mediaStream = micStream ?? null;

    const tokenEntry = await fetchDeepgramTokenBounded({ purpose: "agent" });
    if (this.destroyed) return;

    await new Promise<void>((resolve, reject) => {
      const ws = new WebSocket(DEEPGRAM_AGENT_WS_URL, ["token", tokenEntry.token]);
      this.ws = ws;
      ws.binaryType = "arraybuffer";

      const fail = (err: Error) => {
        this.setStatus("error");
        this.handlers.onError?.(err);
        reject(err);
      };

      ws.onopen = () => {
        try {
          // Ensure no greeting races Q1 even if Settings were overridden.
          const payload = {
            ...this.settings,
            agent: { ...this.settings.agent, greeting: "" },
          };
          ws.send(JSON.stringify(payload));
        } catch (err) {
          fail(err instanceof Error ? err : new Error("Failed to send Settings"));
        }
      };

      ws.onerror = () => {
        fail(new Error("Deepgram Voice Agent connection failed."));
      };

      ws.onclose = () => {
        this.settingsApplied = false;
        if (!this.destroyed) this.setStatus("closed");
        this.rejectPendingSpeak(new Error("Voice agent disconnected."));
      };

      ws.onmessage = (event) => {
        if (typeof event.data !== "string") {
          void this.playAgentPcm(event.data as ArrayBuffer);
          return;
        }
        this.handleControlMessage(event.data, resolve);
      };
    });
  }

  /** Visible for tests — parse a control frame. */
  handleControlMessageForTests(raw: string): void {
    this.handleControlMessage(raw, () => undefined);
  }

  private handleControlMessage(raw: string, onSettingsApplied: () => void) {
    try {
      const msg = JSON.parse(raw) as Record<string, unknown>;
      const type = String(msg.type ?? "");
      if (type === "SettingsApplied") {
        this.settingsApplied = true;
        this.setStatus("ready");
        this.handlers.onSettingsApplied?.();
        if (this.captureMic) this.startMicCapture();
        onSettingsApplied();
        return;
      }
      if (type === "InjectionRefused") {
        this.rejectPendingSpeak(
          new Error(
            String(msg.description ?? msg.message ?? "InjectionRefused — speak refused by agent."),
          ),
        );
        this.setStatus("ready");
        return;
      }
      if (type === "ConversationText") {
        const role = String(msg.role ?? "");
        const content = String(msg.content ?? "").trim();
        if (!content) return;
        if (role === "user") {
          this.handlers.onUserTranscript?.(content, true);
          this.setStatus("listening");
        } else if (role === "assistant") {
          this.handlers.onAgentTranscript?.(content);
          this.setStatus("speaking");
        }
        return;
      }
      if (type === "UserStartedSpeaking") {
        this.setStatus("listening");
        return;
      }
      if (type === "AgentStartedSpeaking") {
        this.setStatus("speaking");
        return;
      }
      if (type === "AgentAudioDone") {
        this.handlers.onAgentAudioDone?.();
        this.markAudioDoneAndMaybeResolve();
        return;
      }
      if (type === "Error") {
        const desc = String(msg.description ?? msg.message ?? "Voice agent error");
        this.handlers.onError?.(new Error(desc));
        this.rejectPendingSpeak(new Error(desc));
        this.setStatus("error");
        return;
      }
      if (type === "Warning") {
        /* non-fatal */
      }
    } catch {
      /* ignore malformed control frames */
    }
  }

  private startMicCapture() {
    if (!this.mediaStream || this.destroyed) return;
    const inputRate = this.settings.audio.input.sample_rate || 48000;
    const ctx = new AudioContext({ sampleRate: inputRate });
    this.audioContext = ctx;
    const source = ctx.createMediaStreamSource(this.mediaStream);
    this.source = source;
    const processor = ctx.createScriptProcessor(4096, 1, 1);
    this.processor = processor;
    processor.onaudioprocess = (ev) => {
      if (!this.ws || this.ws.readyState !== WebSocket.OPEN || !this.settingsApplied) return;
      const input = ev.inputBuffer.getChannelData(0);
      const pcm = new Int16Array(input.length);
      for (let i = 0; i < input.length; i += 1) {
        const s = Math.max(-1, Math.min(1, input[i] ?? 0));
        pcm[i] = s < 0 ? s * 0x8000 : s * 0x7fff;
      }
      try {
        this.ws.send(pcm.buffer);
      } catch {
        /* socket may close mid-frame */
      }
    };
    // Silent gain — keep ScriptProcessor alive without leaking mic to speakers.
    const gain = ctx.createGain();
    gain.gain.value = 0;
    this.silentGain = gain;
    source.connect(processor);
    processor.connect(gain);
    gain.connect(ctx.destination);
  }

  private playbackRemainingMs(): number {
    if (!this.playbackCtx) return 0;
    const remainingSec = Math.max(0, this.nextPlayTime - this.playbackCtx.currentTime);
    return Math.ceil(remainingSec * 1000);
  }

  private markAudioDoneAndMaybeResolve() {
    const id = this.pendingSpeakId;
    if (!id) {
      this.setStatus("ready");
      return;
    }
    const waiter = this.speakWaiters.get(id);
    if (!waiter) {
      this.setStatus("ready");
      return;
    }
    waiter.audioDone = true;
    const remaining = this.playbackRemainingMs();
    if (
      shouldResolveSpeakAfterAudioDone({
        audioDone: true,
        playbackRemainingMs: remaining,
      })
    ) {
      this.setStatus("ready");
      this.resolvePendingSpeak();
      return;
    }
    if (waiter.playbackDrainTimer) clearTimeout(waiter.playbackDrainTimer);
    waiter.playbackDrainTimer = setTimeout(() => {
      if (this.pendingSpeakId !== id) return;
      this.setStatus("ready");
      this.resolvePendingSpeak();
    }, remaining + 40);
  }

  private async playAgentPcm(pcm: ArrayBuffer) {
    if (this.destroyed || pcm.byteLength < 2) return;
    const sampleRate = this.settings.audio.output.sample_rate || 24000;
    if (!this.playbackCtx) {
      this.playbackCtx = new AudioContext({ sampleRate });
    }
    const ctx = this.playbackCtx;
    if (ctx.state === "suspended") {
      try {
        await ctx.resume();
      } catch {
        /* autoplay policies */
      }
    }
    const buffer = pcm16ToAudioBuffer(ctx, pcm, sampleRate);
    const node = ctx.createBufferSource();
    node.buffer = buffer;
    node.connect(ctx.destination);
    const startAt = Math.max(ctx.currentTime, this.nextPlayTime);
    node.start(startAt);
    this.nextPlayTime = startAt + buffer.duration;
  }

  /**
   * Speak a scripted mock question through the agent (Flux TTS).
   * Rejects immediately on InjectionRefused / Error so caller can fall back to Edge TTS.
   */
  speakInjected(message: string, opts?: { behavior?: "default" | "queue" | "interrupt" }): Promise<void> {
    const text = message.trim();
    if (!text) return Promise.resolve();
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN || !this.settingsApplied) {
      return Promise.reject(new Error("Voice agent is not ready."));
    }

    this.rejectPendingSpeak(new Error("Superseded by a newer speak request."));
    const id = `speak-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    this.pendingSpeakId = id;

    return new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => {
        if (this.pendingSpeakId === id) this.pendingSpeakId = null;
        const w = this.speakWaiters.get(id);
        if (w?.playbackDrainTimer) clearTimeout(w.playbackDrainTimer);
        this.speakWaiters.delete(id);
        reject(new Error("Voice agent speak timed out."));
      }, 45_000);
      this.speakWaiters.set(id, {
        resolve,
        reject,
        timer,
        audioDone: false,
        playbackDrainTimer: null,
      });
      try {
        this.ws!.send(
          JSON.stringify({
            type: "InjectAgentMessage",
            message: text,
            behavior: opts?.behavior ?? "interrupt",
          }),
        );
        this.setStatus("speaking");
      } catch (err) {
        clearTimeout(timer);
        this.speakWaiters.delete(id);
        reject(err instanceof Error ? err : new Error("Failed to inject agent message"));
      }
    });
  }

  private resolvePendingSpeak() {
    const id = this.pendingSpeakId;
    if (!id) return;
    const waiter = this.speakWaiters.get(id);
    if (!waiter) return;
    clearTimeout(waiter.timer);
    if (waiter.playbackDrainTimer) clearTimeout(waiter.playbackDrainTimer);
    this.speakWaiters.delete(id);
    this.pendingSpeakId = null;
    waiter.resolve();
  }

  private rejectPendingSpeak(err: Error) {
    for (const [, waiter] of this.speakWaiters) {
      clearTimeout(waiter.timer);
      if (waiter.playbackDrainTimer) clearTimeout(waiter.playbackDrainTimer);
      waiter.reject(err);
    }
    this.speakWaiters.clear();
    this.pendingSpeakId = null;
  }

  updatePrompt(prompt: string) {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return;
    try {
      this.ws.send(JSON.stringify({ type: "UpdatePrompt", prompt }));
    } catch {
      /* ignore */
    }
  }

  disconnect() {
    this.destroyed = true;
    this.rejectPendingSpeak(new Error("Voice agent closed."));
    try {
      this.processor?.disconnect();
    } catch {
      /* ignore */
    }
    try {
      this.source?.disconnect();
    } catch {
      /* ignore */
    }
    try {
      this.silentGain?.disconnect();
    } catch {
      /* ignore */
    }
    void this.audioContext?.close().catch(() => undefined);
    void this.playbackCtx?.close().catch(() => undefined);
    this.processor = null;
    this.source = null;
    this.silentGain = null;
    this.audioContext = null;
    this.playbackCtx = null;
    try {
      this.ws?.close();
    } catch {
      /* ignore */
    }
    this.ws = null;
    this.settingsApplied = false;
    this.setStatus("closed");
  }
}

export async function createMockVoiceAgentSession(options: {
  micStream?: MediaStream | null;
  context?: MockAgentContext;
  voiceId?: string | null;
  handlers?: VoiceAgentHandlers;
  settingsOverride?: DeepgramAgentSettings;
  /** Default false — inject-only speak; nova-3 owns candidate STT. */
  captureMic?: boolean;
}): Promise<DeepgramVoiceAgentSession> {
  const settings =
    options.settingsOverride ??
    buildMockInterviewAgentSettings(options.context ?? {}, { voiceId: options.voiceId });
  const session = new DeepgramVoiceAgentSession(settings, options.handlers, {
    captureMic: options.captureMic === true,
  });
  await session.connect(options.micStream ?? null);
  return session;
}
