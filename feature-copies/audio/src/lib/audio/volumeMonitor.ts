// src/lib/audio/volumeMonitor.ts
// Monitors RMS-based volume, baseline, variance and alerts. [file:1][file:3]

export interface VolumeAlert {
  timestamp: number;         // ms epoch
  type: "too_loud" | "too_quiet";
  baseline: number;
  current: number;
}

export class VolumeMonitor {
  private baselineDb = 0;
  private samples: number[] = [];
  private alerts: VolumeAlert[] = [];
  private onAlert?: (alert: VolumeAlert) => void;
  private calibrated = false;

  constructor(onAlert?: (alert: VolumeAlert) => void) {
    this.onAlert = onAlert;
  }

  calibrate(chunk: Float32Array): void {
    if (this.calibrated) return;
    this.baselineDb = this.rmsToDb(this.calculateRms(chunk));
    this.calibrated = true;
  }

  processChunk(chunk: Float32Array): void {
    if (!this.calibrated) {
      this.calibrate(chunk);
      return;
    }

    const currentDb = this.rmsToDb(this.calculateRms(chunk));
    this.samples.push(currentDb);

    const threshold = this.baselineDb * 0.5; // ±50% around baseline [file:1][file:3]
    if (currentDb > this.baselineDb + threshold) {
      this.addAlert("too_loud", currentDb);
    } else if (currentDb < this.baselineDb - threshold) {
      this.addAlert("too_quiet", currentDb);
    }
  }

  private addAlert(type: "too_loud" | "too_quiet", current: number): void {
    const alert: VolumeAlert = {
      timestamp: Date.now(),
      type,
      baseline: this.baselineDb,
      current,
    };
    this.alerts.push(alert);
    this.onAlert?.(alert);
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

  private rmsToDb(rms: number): number {
    const safe = Math.max(rms, 0.00001);
    return 20 * Math.log10(safe);
  }

  getBaseline(): number {
    return this.baselineDb;
  }

  getCurrentDb(): number {
    if (this.samples.length === 0) return this.baselineDb;
    return this.samples[this.samples.length - 1];
  }

  getVariance(): number {
    if (this.samples.length === 0) return 0;
    const mean =
      this.samples.reduce((a, b) => a + b, 0) / this.samples.length;
    const variance =
      this.samples.reduce((sum, v) => sum + Math.pow(v - mean, 2), 0) /
      this.samples.length;
    return Math.sqrt(variance);
  }

  getAlerts(): VolumeAlert[] {
    return [...this.alerts];
  }
}
