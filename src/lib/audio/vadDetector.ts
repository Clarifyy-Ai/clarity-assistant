import type { VADConfig, VADEvent } from "@/types/audio.types";
import { useAudioStore } from "@/store/audioStore";

// ─────────────────────────────────────────────────────────────────
// Voice Activity Detection (VAD)
// Detects speech start/end boundaries using RMS energy analysis.
// Fires callbacks on speech_start, speech_end, and silence events.
// Used to trigger AI hint generation at the right moment.
// ─────────────────────────────────────────────────────────────────

export interface VADOptions {
  config?: Partial<VADConfig>;
  onSpeechStart?: () => void;
  onSpeechEnd?: (durationMs: number) => void;
  onSilence?: (durationMs: number) => void;
  onEvent?: (event: VADEvent) => void;
}

export class VADDetector {
  private config: VADConfig;
  private callbacks: VADOptions;
  private isSpeaking = false;
  private speechStartTime: number | null = null;
  private silenceStartTime: number | null = null;
  private rafHandle: number | null = null;
  private getLevel: (() => number) | null = null;
  private isRunning = false;

  // Rolling energy buffer for noise floor estimation
  private energyBuffer: number[] = [];
  private readonly ENERGY_BUFFER_SIZE = 30;

  constructor(opts: VADOptions = {}) {
    this.callbacks = opts;
    this.config = {
      silence_threshold_ms:    1200,
      min_speech_duration_ms:  300,
      noise_floor:             0.05,
      ...opts.config,
    };
  }

  // ── Start VAD ─────────────────────────────────────────────────

  start(getLevelFn: () => number): void {
    this.getLevel = getLevelFn;
    this.isRunning = true;
    this.scheduleFrame();
  }

  // ── Stop VAD ──────────────────────────────────────────────────

  stop(): void {
    this.isRunning = false;
    if (this.rafHandle !== null) {
      cancelAnimationFrame(this.rafHandle);
      this.rafHandle = null;
    }
    this.isSpeaking = false;
    this.speechStartTime = null;
    this.silenceStartTime = null;
  }

  // ── Update config ─────────────────────────────────────────────

  updateConfig(patch: Partial<VADConfig>): void {
    this.config = { ...this.config, ...patch };
  }

  // ── Frame loop ────────────────────────────────────────────────

  private scheduleFrame(): void {
    if (!this.isRunning) return;
    this.rafHandle = requestAnimationFrame(() => this.processFrame());
  }

  private processFrame(): void {
    if (!this.isRunning || !this.getLevel) return;

    const level = this.getLevel();
    const now   = Date.now();

    // Update energy buffer for adaptive noise floor
    this.energyBuffer.push(level);
    if (this.energyBuffer.length > this.ENERGY_BUFFER_SIZE) {
      this.energyBuffer.shift();
    }

    // Adaptive threshold: noise floor + hysteresis
    const adaptiveFloor = this.computeAdaptiveNoiseFloor();
    const speakingThreshold = Math.max(this.config.noise_floor, adaptiveFloor * 1.5);
    const silenceThreshold  = Math.max(this.config.noise_floor * 0.8, adaptiveFloor * 1.2);

    // Update store audio level
    useAudioStore.getState().pushLevelSample({
      timestamp:   now,
      level,
      is_speaking: this.isSpeaking,
    });

    if (!this.isSpeaking) {
      // Detect speech start
      if (level > speakingThreshold) {
        this.isSpeaking = true;
        this.speechStartTime = now;
        this.silenceStartTime = null;

        const event: VADEvent = { type: "speech_start", timestamp: now };
        this.callbacks.onSpeechStart?.();
        this.callbacks.onEvent?.(event);
        useAudioStore.getState().setIsSpeaking(true);
      } else {
        // Track silence duration
        if (this.silenceStartTime === null) {
          this.silenceStartTime = now;
        } else {
          const silenceDuration = now - this.silenceStartTime;
          if (silenceDuration >= this.config.silence_threshold_ms) {
            const event: VADEvent = {
              type:        "silence",
              timestamp:   now,
              duration_ms: silenceDuration,
            };
            this.callbacks.onSilence?.(silenceDuration);
            this.callbacks.onEvent?.(event);
          }
        }
      }
    } else {
      // Currently speaking — detect end of speech
      if (level <= silenceThreshold) {
        const speechDuration = now - (this.speechStartTime ?? now);

        // Ignore very short bursts (noise spikes)
        if (speechDuration >= this.config.min_speech_duration_ms) {
          this.isSpeaking = false;
          this.silenceStartTime = now;
          useAudioStore.getState().setIsSpeaking(false);

          const event: VADEvent = {
            type:        "speech_end",
            timestamp:   now,
            duration_ms: speechDuration,
          };
          this.callbacks.onSpeechEnd?.(speechDuration);
          this.callbacks.onEvent?.(event);
        }
      } else {
        // Still speaking — reset silence tracker
        this.silenceStartTime = null;
      }
    }

    this.scheduleFrame();
  }

  // ── Adaptive noise floor ──────────────────────────────────────

  private computeAdaptiveNoiseFloor(): number {
    if (this.energyBuffer.length === 0) return this.config.noise_floor;
    // Use 20th percentile of recent energy as noise floor estimate
    const sorted = [...this.energyBuffer].sort((a, b) => a - b);
    const idx = Math.floor(sorted.length * 0.2);
    return sorted[idx] ?? this.config.noise_floor;
  }

  // ── Getters ───────────────────────────────────────────────────

  get speaking(): boolean {
    return this.isSpeaking;
  }

  get speechDurationMs(): number {
    if (!this.isSpeaking || !this.speechStartTime) return 0;
    return Date.now() - this.speechStartTime;
  }
}

// ─────────────────────────────────────────────────────────────────
// Silence boundary detector
// Emits an event when interviewer stops talking (question complete).
// This is the primary trigger for AI hint generation.
// ─────────────────────────────────────────────────────────────────

export class SilenceBoundaryDetector {
  private lastInterviewerSpeechEnd: number | null = null;
  private triggerThresholdMs: number;
  private onQuestionComplete: (question: string) => void;
  private triggered = false;
  private pendingQuestion: string | null = null;
  private timer: ReturnType<typeof setTimeout> | null = null;

  constructor(
    onQuestionComplete: (question: string) => void,
    triggerThresholdMs = 1200
  ) {
    this.onQuestionComplete = onQuestionComplete;
    this.triggerThresholdMs = triggerThresholdMs;
  }

  onInterviewerUtteranceEnd(question: string): void {
    this.pendingQuestion = question;
    this.triggered = false;

    if (this.timer) clearTimeout(this.timer);

    // Wait for silence threshold before triggering hint
    this.timer = setTimeout(() => {
      if (this.pendingQuestion && !this.triggered) {
        this.triggered = true;
        this.onQuestionComplete(this.pendingQuestion);
        this.pendingQuestion = null;
      }
    }, this.triggerThresholdMs);
  }

  onCandidateSpeechStart(): void {
    // Candidate started answering — cancel pending trigger
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
  }

  destroy(): void {
    if (this.timer) clearTimeout(this.timer);
  }
}
