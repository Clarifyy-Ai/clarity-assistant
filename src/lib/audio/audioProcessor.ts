// ─────────────────────────────────────────────────────────────────────────────
// audioProcessor.ts — Central audio pipeline processor
// Sits between raw audio capture and downstream consumers (Deepgram, VAD,
// filler detection, WPM tracking, diarization). Applies gain, noise gate,
// resampling, and chunking before dispatching to each consumer.
// ─────────────────────────────────────────────────────────────────────────────

import { AudioError } from "@/lib/errors";
import { ErrorCode } from "@/lib/errors";

// ─── Constants ────────────────────────────────────────────────────────────────

const DEFAULT_SAMPLE_RATE     = 16000;  // Hz — Deepgram optimal
const DEFAULT_CHUNK_SIZE_MS   = 100;    // ms per processing chunk
const DEFAULT_GAIN            = 1.2;    // slight boost
const NOISE_GATE_THRESHOLD    = 0.01;   // amplitude below this = silence
const MAX_GAIN                = 4.0;
const MIN_GAIN                = 0.1;

// ─── Types ────────────────────────────────────────────────────────────────────

export type AudioFormat = "pcm16" | "float32" | "opus";

export interface AudioChunk {
  data: Float32Array | Int16Array;
  format: AudioFormat;
  sampleRate: number;
  channelCount: number;
  timestampMs: number;
  durationMs: number;
  isSilent: boolean;
  rms: number;         // root mean square amplitude 0–1
  peakAmplitude: number;
}

export interface AudioProcessorConfig {
  sampleRate?: number;
  chunkSizeMs?: number;
  gain?: number;
  noiseGateThreshold?: number;
  enableNoiseGate?: boolean;
  enableAutoGain?: boolean;
  enableResampling?: boolean;
  outputFormat?: AudioFormat;
  channelCount?: 1 | 2;
  onChunk?: (chunk: AudioChunk) => void;
  onSilenceStart?: (timestampMs: number) => void;
  onSilenceEnd?: (timestampMs: number, silenceDurationMs: number) => void;
  onVolumeChange?: (rms: number, peak: number) => void;
  onError?: (error: AudioError) => void;
}

export interface AudioProcessorStats {
  totalChunksProcessed: number;
  totalSilentChunks: number;
  totalDurationMs: number;
  averageRMS: number;
  peakRMS: number;
  droppedChunks: number;
  resampleRatio: number;
}

// ─── RMS & Peak Helpers ───────────────────────────────────────────────────────

function computeRMS(samples: Float32Array): number {
  if (samples.length === 0) return 0;
  let sum = 0;
  for (let i = 0; i < samples.length; i++) {
    sum += samples[i] * samples[i];
  }
  return Math.sqrt(sum / samples.length);
}

function computePeak(samples: Float32Array): number {
  let peak = 0;
  for (let i = 0; i < samples.length; i++) {
    const abs = Math.abs(samples[i]);
    if (abs > peak) peak = abs;
  }
  return peak;
}

// ─── Resampler (linear interpolation) ────────────────────────────────────────

function resampleLinear(
  input: Float32Array,
  inputRate: number,
  outputRate: number
): Float32Array {
  if (inputRate === outputRate) return input;

  const ratio = inputRate / outputRate;
  const outputLength = Math.round(input.length / ratio);
  const output = new Float32Array(outputLength);

  for (let i = 0; i < outputLength; i++) {
    const srcIndex = i * ratio;
    const srcFloor = Math.floor(srcIndex);
    const srcCeil  = Math.min(srcFloor + 1, input.length - 1);
    const t = srcIndex - srcFloor;
    output[i] = input[srcFloor] * (1 - t) + input[srcCeil] * t;
  }

  return output;
}

// ─── Float32 → PCM16 Converter ────────────────────────────────────────────────

function float32ToPCM16(float32: Float32Array): Int16Array {
  const pcm = new Int16Array(float32.length);
  for (let i = 0; i < float32.length; i++) {
    const clamped = Math.max(-1, Math.min(1, float32[i]));
    pcm[i] = clamped < 0 ? clamped * 0x8000 : clamped * 0x7fff;
  }
  return pcm;
}

// ─── Auto Gain Control ────────────────────────────────────────────────────────

class AutoGainController {
  private targetRMS  = 0.15;
  private currentGain = 1.0;
  private smoothing   = 0.95; // exponential smoothing factor

  adjust(rms: number): number {
    if (rms < 0.001) return this.currentGain; // don't adjust during silence

    const desiredGain = this.targetRMS / rms;
    const clampedGain = Math.max(MIN_GAIN, Math.min(MAX_GAIN, desiredGain));

    // Smooth gain changes to avoid clicks
    this.currentGain =
      this.smoothing * this.currentGain + (1 - this.smoothing) * clampedGain;

    return this.currentGain;
  }

  reset() {
    this.currentGain = 1.0;
  }
}

// ─── AudioProcessor Class ─────────────────────────────────────────────────────

export class AudioProcessor {
  private config: Required<AudioProcessorConfig>;
  private audioContext: AudioContext | null = null;
  private sourceNode: AudioBufferSourceNode | MediaStreamAudioSourceNode | null = null;
  private processorNode: ScriptProcessorNode | null = null;
  private gainNode: GainNode | null = null;
  private isRunning = false;
  private agc = new AutoGainController();
  private silenceStartMs: number | null = null;
  private inputSampleRate = 0;

  private stats: AudioProcessorStats = {
    totalChunksProcessed: 0,
    totalSilentChunks:    0,
    totalDurationMs:      0,
    averageRMS:           0,
    peakRMS:              0,
    droppedChunks:        0,
    resampleRatio:        1,
  };

  constructor(config: AudioProcessorConfig = {}) {
    this.config = {
      sampleRate:           config.sampleRate          ?? DEFAULT_SAMPLE_RATE,
      chunkSizeMs:          config.chunkSizeMs         ?? DEFAULT_CHUNK_SIZE_MS,
      gain:                 config.gain                ?? DEFAULT_GAIN,
      noiseGateThreshold:   config.noiseGateThreshold  ?? NOISE_GATE_THRESHOLD,
      enableNoiseGate:      config.enableNoiseGate     ?? true,
      enableAutoGain:       config.enableAutoGain      ?? false,
      enableResampling:     config.enableResampling    ?? true,
      outputFormat:         config.outputFormat        ?? "pcm16",
      channelCount:         config.channelCount        ?? 1,
      onChunk:              config.onChunk             ?? (() => {}),
      onSilenceStart:       config.onSilenceStart      ?? (() => {}),
      onSilenceEnd:         config.onSilenceEnd        ?? (() => {}),
      onVolumeChange:       config.onVolumeChange      ?? (() => {}),
      onError:              config.onError             ?? (() => {}),
    };
  }

  // ── Connect to a MediaStream (mic or system audio) ──────────────────────────
  async connectStream(stream: MediaStream): Promise<void> {
    try {
      this.audioContext = new AudioContext({
        sampleRate: this.config.sampleRate,
        latencyHint: "interactive",
      });

      this.inputSampleRate = this.audioContext.sampleRate;
      this.stats.resampleRatio = this.inputSampleRate / this.config.sampleRate;

      // Gain node
      this.gainNode = this.audioContext.createGain();
      this.gainNode.gain.value = this.config.gain;

      // Source from MediaStream
      this.sourceNode = this.audioContext.createMediaStreamSource(stream);

      // ScriptProcessor for raw sample access (256 samples = ~16ms at 16kHz)
      const bufferSize = this.computeBufferSize();
      this.processorNode = this.audioContext.createScriptProcessor(
        bufferSize,
        this.config.channelCount,
        this.config.channelCount
      );

      this.processorNode.onaudioprocess = this.handleAudioProcess.bind(this);

      // Connect graph: source → gain → processor → destination
      this.sourceNode.connect(this.gainNode);
      this.gainNode.connect(this.processorNode);
      this.processorNode.connect(this.audioContext.destination);

      this.isRunning = true;
    } catch (error) {
      const err = new AudioError(
        `AudioProcessor failed to connect stream: ${error}`,
        ErrorCode.AUDIO_STREAM_FAILED,
        { originalError: String(error) }
      );
      this.config.onError(err);
      throw err;
    }
  }

  // ── Process a raw Float32Array chunk directly (offline / test usage) ────────
  processRawChunk(
    samples: Float32Array,
    inputSampleRate: number,
    timestampMs = Date.now()
  ): AudioChunk {
    return this.processFloat32(samples, inputSampleRate, timestampMs);
  }

  // ── Internal: ScriptProcessor callback ────────────────────────────────────
  private handleAudioProcess(event: AudioProcessingEvent): void {
    if (!this.isRunning) return;

    const inputBuffer = event.inputBuffer;
    const raw = inputBuffer.getChannelData(0); // mono
    const samples = new Float32Array(raw);
    const timestampMs = performance.now();

    this.processFloat32(samples, inputBuffer.sampleRate, timestampMs);
  }

  // ── Core processing pipeline ───────────────────────────────────────────────
  private processFloat32(
    samples: Float32Array,
    inputSampleRate: number,
    timestampMs: number
  ): AudioChunk {
    let processed = samples;

    // 1. Resample to target sample rate
    if (this.config.enableResampling && inputSampleRate !== this.config.sampleRate) {
      processed = resampleLinear(processed, inputSampleRate, this.config.sampleRate);
    }

    // 2. Apply gain
    const effectiveGain = this.config.enableAutoGain
      ? this.agc.adjust(computeRMS(processed))
      : this.config.gain;

    if (effectiveGain !== 1.0) {
      processed = processed.map((s) => Math.max(-1, Math.min(1, s * effectiveGain)));
    }

    // 3. Compute metrics
    const rms  = computeRMS(processed);
    const peak = computePeak(processed);
    const isSilent =
      this.config.enableNoiseGate && rms < this.config.noiseGateThreshold;

    // 4. Silence boundary detection
    this.detectSilenceBoundary(isSilent, timestampMs);

    // 5. Volume change callback
    this.config.onVolumeChange(rms, peak);

    // 6. Convert to output format
    const durationMs =
      (processed.length / this.config.sampleRate) * 1000;

    const outputData: Float32Array | Int16Array =
      this.config.outputFormat === "pcm16"
        ? float32ToPCM16(processed)
        : processed;

    // 7. Build chunk
    const chunk: AudioChunk = {
      data:         outputData,
      format:       this.config.outputFormat,
      sampleRate:   this.config.sampleRate,
      channelCount: this.config.channelCount,
      timestampMs,
      durationMs,
      isSilent,
      rms,
      peakAmplitude: peak,
    };

    // 8. Update stats
    this.updateStats(rms, isSilent, durationMs);

    // 9. Dispatch to consumer
    if (!isSilent) {
      this.config.onChunk(chunk);
    }

    return chunk;
  }

  // ── Silence boundary tracking ─────────────────────────────────────────────
  private detectSilenceBoundary(isSilent: boolean, timestampMs: number): void {
    if (isSilent && this.silenceStartMs === null) {
      this.silenceStartMs = timestampMs;
      this.config.onSilenceStart(timestampMs);
    } else if (!isSilent && this.silenceStartMs !== null) {
      const duration = timestampMs - this.silenceStartMs;
      this.config.onSilenceEnd(timestampMs, duration);
      this.silenceStartMs = null;
    }
  }

  // ── Stats tracking ────────────────────────────────────────────────────────
  private updateStats(rms: number, isSilent: boolean, durationMs: number): void {
    const s = this.stats;
    s.totalChunksProcessed++;
    s.totalDurationMs += durationMs;
    if (isSilent) s.totalSilentChunks++;

    // Running average RMS
    s.averageRMS =
      (s.averageRMS * (s.totalChunksProcessed - 1) + rms) /
      s.totalChunksProcessed;

    if (rms > s.peakRMS) s.peakRMS = rms;
  }

  // ── Buffer size — closest power of 2 to target chunk size ─────────────────
  private computeBufferSize(): number {
    const targetSamples =
      (this.config.chunkSizeMs / 1000) * this.config.sampleRate;
    const pow2 = Math.pow(2, Math.round(Math.log2(targetSamples)));
    // Valid ScriptProcessor buffer sizes: 256, 512, 1024, 2048, 4096, 8192, 16384
    return Math.max(256, Math.min(16384, pow2)) as
      | 256 | 512 | 1024 | 2048 | 4096 | 8192 | 16384;
  }

  // ── Public Controls ───────────────────────────────────────────────────────

  setGain(gain: number): void {
    const clamped = Math.max(MIN_GAIN, Math.min(MAX_GAIN, gain));
    this.config.gain = clamped;
    if (this.gainNode) {
      this.gainNode.gain.setTargetAtTime(clamped, this.audioContext!.currentTime, 0.01);
    }
  }

  setNoiseGateThreshold(threshold: number): void {
    this.config.noiseGateThreshold = Math.max(0, Math.min(1, threshold));
  }

  pause(): void {
    this.isRunning = false;
  }

  resume(): void {
    this.isRunning = true;
  }

  getStats(): Readonly<AudioProcessorStats> {
    return { ...this.stats };
  }

  isActive(): boolean {
    return this.isRunning;
  }

  async destroy(): Promise<void> {
    this.isRunning = false;
    this.agc.reset();

    if (this.processorNode) {
      this.processorNode.disconnect();
      this.processorNode.onaudioprocess = null;
      this.processorNode = null;
    }
    if (this.gainNode) {
      this.gainNode.disconnect();
      this.gainNode = null;
    }
    if (this.sourceNode) {
      this.sourceNode.disconnect();
      this.sourceNode = null;
    }
    if (this.audioContext && this.audioContext.state !== "closed") {
      await this.audioContext.close();
      this.audioContext = null;
    }
  }
}

// ─── Factory ──────────────────────────────────────────────────────────────────

/**
 * Create and connect an AudioProcessor to a MediaStream in one call.
 *
 * @example
 * const processor = await createAudioProcessor(stream, {
 *   outputFormat: "pcm16",
 *   enableNoiseGate: true,
 *   onChunk: (chunk) => sendToDeepgram(chunk.data),
 *   onSilenceStart: (ts) => console.log("Silence at", ts),
 * });
 *
 * // Later:
 * await processor.destroy();
 */
export async function createAudioProcessor(
  stream: MediaStream,
  config: AudioProcessorConfig = {}
): Promise<AudioProcessor> {
  const processor = new AudioProcessor(config);
  await processor.connectStream(stream);
  return processor;
}

/**
 * One-shot: process a static Float32Array buffer (e.g. from a recorded file).
 * Returns the processed AudioChunk without setting up any ongoing pipeline.
 */
export function processStaticBuffer(
  samples: Float32Array,
  inputSampleRate: number,
  config: AudioProcessorConfig = {}
): AudioChunk {
  const processor = new AudioProcessor(config);
  return processor.processRawChunk(samples, inputSampleRate);
}
