// src/lib/audio/speechMetricsCalculator.ts
// High-level speech metrics aggregator for WPM, fillers, silence, volume, and confidence. [file:1][file:3]

import { WPMTracker } from "./wpmTracker";
import type { WPMDataPoint } from "./wpmTracker";
import { FillerDetector } from "./fillerDetector";
import { SilenceDetector, type SilenceEvent } from "./silenceDetector";
import { VolumeMonitor, type VolumeAlert } from "./volumeMonitor";

export interface SpeechMetrics {
  wpm: number;
  wpmHistory: WPMDataPoint[];
  fillerWords: {
    count: number;
    perMinute: number;
    examples: string[];
  };
  silence: {
    totalDuration: number;     // seconds
    eventCount: number;
    maxDuration: number;       // seconds
    events: SilenceEvent[];
  };
  volume: {
    baselineDb: number;
    currentDb: number;
    variance: number;
    alerts: VolumeAlert[];
  };
  speakingRatio: number;       // % of session time
  confidenceScore: number;     // 0–100
}

export class SpeechMetricsCalculator {
  private wpmTracker: WPMTracker;
  private fillerDetector: FillerDetector;
  private silenceDetector: SilenceDetector;
  private volumeMonitor: VolumeMonitor;

  private sessionStartTime = Date.now();
  private speakingDurationMs = 0;
  private lastChunkTimestamp = Date.now();
  private totalDurationMs = 0;

  private onMetricsUpdate: (metrics: SpeechMetrics) => void;

  constructor(onMetricsUpdate: (metrics: SpeechMetrics) => void) {
    this.onMetricsUpdate = onMetricsUpdate;

    this.wpmTracker = new WPMTracker();
    this.fillerDetector = new FillerDetector();
    this.silenceDetector = new SilenceDetector(() => {
      this.broadcastMetrics();
    });
    this.volumeMonitor = new VolumeMonitor(() => {
      this.broadcastMetrics();
    });
  }

  calibrate(): void {
    this.sessionStartTime = Date.now();
    this.lastChunkTimestamp = this.sessionStartTime;
  }

  // Called for each audio chunk for the candidate (16 kHz mono, Float32Array). [file:3][web:118]
  processAudioChunk(chunk: Float32Array, isCandidate: boolean): void {
    const now = Date.now();
    this.totalDurationMs = now - this.sessionStartTime;

    if (isCandidate) {
      const chunkDurationMs = (chunk.length / 16000) * 1000;
      this.speakingDurationMs += chunkDurationMs;
      this.silenceDetector.processChunk(chunk);
      this.volumeMonitor.processChunk(chunk);
    }

    this.lastChunkTimestamp = now;
    this.broadcastMetrics();
  }

  // Called when transcript text updates (final or interim). [file:3]
  processTranscript(text: string): void {
    this.wpmTracker.processText(text);
    this.fillerDetector.processText(text);
    this.broadcastMetrics();
  }

  getMetrics(): SpeechMetrics {
    const wpm = this.wpmTracker.getCurrentWPM();
    const wpmHistory = this.wpmTracker.getDataPoints();

    const fillerCount = this.fillerDetector.getCount();
    const fillerPerMinute = this.fillerDetector.getPerMinute();
    const fillerExamples = this.fillerDetector.getExamples();

    const silenceEvents = this.silenceDetector.getEvents();
    const silenceTotal = this.silenceDetector.getTotalDuration();
    const silenceMax = this.silenceDetector.getMaxDuration();

    const baselineDb = this.volumeMonitor.getBaseline();
    const currentDb = this.volumeMonitor.getCurrentDb();
    const variance = this.volumeMonitor.getVariance();
    const volumeAlerts = this.volumeMonitor.getAlerts();

    const speakingRatio = this.totalDurationMs
      ? (this.speakingDurationMs / this.totalDurationMs) * 100
      : 0;

    const confidenceScore = this.calculateConfidenceScore(
      wpm,
      fillerCount,
      this.silenceDetector.getEventCount(),
      variance,
      this.estimateAnswerCompleteness(), // placeholder
    );

    return {
      wpm,
      wpmHistory,
      fillerWords: {
        count: fillerCount,
        perMinute: fillerPerMinute,
        examples: fillerExamples,
      },
      silence: {
        totalDuration: silenceTotal,
        eventCount: this.silenceDetector.getEventCount(),
        maxDuration: silenceMax,
        events: silenceEvents,
      },
      volume: {
        baselineDb,
        currentDb,
        variance,
        alerts: volumeAlerts,
      },
      speakingRatio,
      confidenceScore,
    };
  }

  /* ──────────────────────────────────────────────────────────── */

  private broadcastMetrics(): void {
    this.onMetricsUpdate(this.getMetrics());
  }

  // 5‑dimensional confidence scoring per manual. [file:1][file:3]
  private calculateConfidenceScore(
    wpm: number,
    fillerCount: number,
    silenceEvents: number,
    volumeVariance: number,
    answerCompleteness: number,
  ): number {
    const speakingPaceScore = this.scoreWpm(wpm);             // 0–25
    const fillerScore = this.scoreFiller(fillerCount);        // 0–25
    const silenceScore = this.scoreSilence(silenceEvents);    // 0–20
    const volumeScore = this.scoreVolume(volumeVariance);     // 0–15
    const completenessScore = Math.max(0, Math.min(15, answerCompleteness));

    const total = speakingPaceScore + fillerScore + silenceScore + volumeScore + completenessScore;
    return Math.min(100, total);
  }

  private scoreWpm(wpm: number): number {
    // Target 120–160 WPM. [file:1][file:3][web:113]
    if (wpm >= 120 && wpm <= 160) return 25;
    if ((wpm >= 100 && wpm < 120) || (wpm > 160 && wpm <= 180)) return 20;
    if (wpm < 100 || wpm > 180) return 10;
    return 15;
  }

  private scoreFiller(count: number): number {
    const elapsedMinutes = this.totalDurationMs / 1000 / 60;
    const perMinute = elapsedMinutes > 0 ? count / elapsedMinutes : count;
    if (perMinute <= 1) return 25;
    if (perMinute <= 2) return 15;
    if (perMinute <= 3) return 5;
    return 0;
  }

  private scoreSilence(events: number): number {
    // Target: ~2 pauses of 3s per session. [file:1][file:3]
    if (events === 0) return 20;
    if (events <= 2) return 15;
    if (events <= 5) return 8;
    return 0;
  }

  private scoreVolume(variance: number): number {
    // Lower variance = more consistent volume. [file:1][file:3][web:125]
    if (variance <= 5) return 15;
    if (variance <= 10) return 10;
    if (variance <= 15) return 5;
    return 0;
  }

  private estimateAnswerCompleteness(): number {
    // Placeholder until you implement content‑based scoring (Chapter 9). [file:3]
    return 10;
  }
}
