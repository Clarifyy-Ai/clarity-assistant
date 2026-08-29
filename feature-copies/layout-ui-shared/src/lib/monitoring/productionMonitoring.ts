/**
 * Production Monitoring, Health Telemetry, and Alerting Engine.
 * Tracks pipeline reliability, client audio/STT status, queue depth, lease health, and security alerts.
 */

export interface SystemMetrics {
  sourceRetrievalSuccess: number;
  sourceDomainFailures: number;
  documentDownloadFailures: number;
  virusScanFailures: number;
  ocrConfidenceSum: number;
  ocrSampleCount: number;
  parserFailures: number;
  jobQueueDepth: number;
  leaseExpirations: number;
  retryCount: number;
  aiMalformedResponses: number;
  questionValidationRejections: number;
  duplicateQuestionsDetected: number;
  paperGenerationFailures: number;
  creditReservations: number;
  creditCompensations: number;
  onboardingAbandonment: number;
  micPermissionDenials: number;
  sttDisconnections: number;
  documentParsingFailures: number;
}

export interface ProductionAlert {
  id: string;
  alert: string;
  severity: "info" | "warning" | "critical";
  message: string;
  timestamp: string;
  metadata?: Record<string, unknown>;
}

export class ProductionTelemetryEngine {
  private metrics: SystemMetrics = {
    sourceRetrievalSuccess: 0,
    sourceDomainFailures: 0,
    documentDownloadFailures: 0,
    virusScanFailures: 0,
    ocrConfidenceSum: 0,
    ocrSampleCount: 0,
    parserFailures: 0,
    jobQueueDepth: 0,
    leaseExpirations: 0,
    retryCount: 0,
    aiMalformedResponses: 0,
    questionValidationRejections: 0,
    duplicateQuestionsDetected: 0,
    paperGenerationFailures: 0,
    creditReservations: 0,
    creditCompensations: 0,
    onboardingAbandonment: 0,
    micPermissionDenials: 0,
    sttDisconnections: 0,
    documentParsingFailures: 0,
  };

  private alerts: ProductionAlert[] = [];

  // --- Metrics Recording ---

  public increment(metric: keyof SystemMetrics, by: number = 1): void {
    this.metrics[metric] += by;
  }

  public recordOcrConfidence(confidence: number): void {
    const clamped = Math.max(0, Math.min(1, confidence));
    this.metrics.ocrConfidenceSum += clamped;
    this.metrics.ocrSampleCount += 1;
  }

  public getAverageOcrConfidence(): number {
    if (this.metrics.ocrSampleCount === 0) return 1.0;
    return this.metrics.ocrConfidenceSum / this.metrics.ocrSampleCount;
  }

  public setQueueDepth(depth: number): void {
    this.metrics.jobQueueDepth = Math.max(0, depth);
  }

  public getSnapshot(): SystemMetrics {
    return { ...this.metrics };
  }

  // --- Alert Evaluation ---

  public emitAlert(
    alertName: string,
    severity: "info" | "warning" | "critical",
    message: string,
    metadata?: Record<string, unknown>,
  ): ProductionAlert {
    const cleanMeta = metadata ? this.sanitizePayload(metadata) : undefined;
    const alert: ProductionAlert = {
      id: `alert-${Math.random().toString(36).slice(2, 9)}`,
      alert: alertName,
      severity,
      message,
      timestamp: new Date().toISOString(),
      metadata: cleanMeta,
    };
    this.alerts.push(alert);
    return alert;
  }

  public getActiveAlerts(): ProductionAlert[] {
    return [...this.alerts];
  }

  public evaluateAlertConditions(opts: {
    queueDepth: number;
    oldestJobWaitSeconds: number;
    leaseExpirationsInWindow: number;
    ocrFailureRate: number;
    publishedPaperMissingAnswer: boolean;
    paperCountMismatch: boolean;
    crossUserAccessDetected: boolean;
    duplicateCreditChargeDetected: boolean;
    providerAuthFailure: boolean;
    requiredWorkerAvailable: boolean;
  }): ProductionAlert[] {
    const triggered: ProductionAlert[] = [];

    // 1. Stuck processing queue
    if (opts.queueDepth > 100 || opts.oldestJobWaitSeconds > 300) {
      triggered.push(
        this.emitAlert(
          "StuckProcessingQueue",
          opts.oldestJobWaitSeconds > 600 ? "critical" : "warning",
          `Job queue contains ${opts.queueDepth} pending jobs. Oldest job wait: ${opts.oldestJobWaitSeconds}s.`,
        ),
      );
    }

    // 2. Repeated worker lease expiration
    if (opts.leaseExpirationsInWindow >= 3) {
      triggered.push(
        this.emitAlert(
          "RepeatedWorkerLeaseExpiration",
          "critical",
          `Detected ${opts.leaseExpirationsInWindow} worker lease expirations within observation window.`,
        ),
      );
    }

    // 3. High OCR failure
    if (opts.ocrFailureRate > 0.2) {
      triggered.push(
        this.emitAlert(
          "HighOcrFailureRate",
          "warning",
          `OCR failure rate is ${(opts.ocrFailureRate * 100).toFixed(1)}%, exceeding 20% limit.`,
        ),
      );
    }

    // 4. Published paper missing answer
    if (opts.publishedPaperMissingAnswer) {
      triggered.push(
        this.emitAlert(
          "PublishedPaperMissingAnswer",
          "critical",
          "Integrity violation: Generated paper published with missing answer keys.",
        ),
      );
    }

    // 5. Paper count mismatch
    if (opts.paperCountMismatch) {
      triggered.push(
        this.emitAlert(
          "PaperCountMismatch",
          "critical",
          "Assembled question paper count does not match blueprint total questions.",
        ),
      );
    }

    // 6. Cross-user access attempt
    if (opts.crossUserAccessDetected) {
      triggered.push(
        this.emitAlert(
          "CrossUserAccessAttempt",
          "critical",
          "Security alert: Intercepted cross-tenant data access attempt.",
        ),
      );
    }

    // 7. Duplicate credit charge
    if (opts.duplicateCreditChargeDetected) {
      triggered.push(
        this.emitAlert(
          "DuplicateCreditChargeAttempt",
          "critical",
          "Idempotency violation: duplicate credit deduction intercepted.",
        ),
      );
    }

    // 8. Provider authentication failure
    if (opts.providerAuthFailure) {
      triggered.push(
        this.emitAlert(
          "ProviderAuthenticationFailure",
          "critical",
          "AI provider rejected credentials or returned authentication failure.",
        ),
      );
    }

    // 9. Required worker unavailable
    if (!opts.requiredWorkerAvailable) {
      triggered.push(
        this.emitAlert(
          "RequiredWorkerUnavailable",
          "critical",
          "No active background document worker heartbeats recorded.",
        ),
      );
    }

    return triggered;
  }

  // --- Secret Redaction ---
  public sanitizePayload(obj: Record<string, unknown>): Record<string, unknown> {
    const sensitive = ["token", "secret", "key", "password", "authorization", "service_role"];
    const result: Record<string, unknown> = {};

    for (const [k, v] of Object.entries(obj)) {
      if (sensitive.some((s) => k.toLowerCase().includes(s))) {
        result[k] = "[REDACTED]";
      } else if (v && typeof v === "object" && !Array.isArray(v)) {
        result[k] = this.sanitizePayload(v as Record<string, unknown>);
      } else {
        result[k] = v;
      }
    }
    return result;
  }
}

export const productionTelemetry = new ProductionTelemetryEngine();
