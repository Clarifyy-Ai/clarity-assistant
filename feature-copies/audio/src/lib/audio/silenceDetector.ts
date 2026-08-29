// src/lib/audio/silenceDetector.ts
// Detects 3-second silences based on RMS threshold. [file:1][file:3][web:118]

const SILENCE_THRESHOLD_MS = 3000; // 3 seconds
const RMS_THRESHOLD = 0.01;        // 1% of full-scale amplitude

export interface SilenceEvent {
  startTime: number;  // ms epoch
  endTime: number;    // ms epoch
  duration: number;   // seconds
}

export class SilenceDetector {
  private silenceStartTime: number | null = null;
  private events: SilenceEvent[] = [];
  private onSilenceEvent?: (event: SilenceEvent) => void;

  constructor(onEvent?: (event: SilenceEvent) => void) {
    this.onSilenceEvent = onEvent;
  }

  processChunk(chunk: Float32Array): void {
    const rms = this.calculateRms(chunk);
    const isSilent = rms < RMS_THRESHOLD;

    const now = Date.now();

    if (isSilent) {
      if (!this.silenceStartTime) {
        this.silenceStartTime = now;
      }
    } else if (this.silenceStartTime) {
      const durationMs = now - this.silenceStartTime;
      if (durationMs >= SILENCE_THRESHOLD_MS) {
        const event: SilenceEvent = {
          startTime: this.silenceStartTime,
          endTime: now,
          duration: durationMs / 1000,
        };
        this.events.push(event);
        this.onSilenceEvent?.(event);
      }
      this.silenceStartTime = null;
    }
  }

  private calculateRms(chunk: Float32Array): number {
    if (chunk.length === 0) return 0;
    let sum = 0;
    for (let i = 0; i < chunk.length; i++) {
      const val = chunk[i];
      sum += val * val;
    }
    return Math.sqrt(sum / chunk.length);
  }

  getEventCount(): number {
    return this.events.length;
  }

  getTotalDuration(): number {
    return this.events.reduce((sum, e) => sum + e.duration, 0);
  }

  getMaxDuration(): number {
    if (this.events.length === 0) return 0;
    return Math.max(...this.events.map((e) => e.duration));
  }

  getEvents(): SilenceEvent[] {
    return [...this.events];
  }
}
