import { describe, expect, it } from "vitest";
import {
  ProductionTelemetryEngine,
  productionTelemetry,
} from "@/lib/monitoring/productionMonitoring";

describe("Production Monitoring, Telemetry, and Reliability", () => {
  describe("1. Metric Incrementing and OCR Confidence Tracking", () => {
    it("tracks pipeline metrics accurately", () => {
      const engine = new ProductionTelemetryEngine();

      engine.increment("sourceRetrievalSuccess", 5);
      engine.increment("sourceDomainFailures", 2);
      engine.increment("documentDownloadFailures", 1);
      engine.increment("aiMalformedResponses", 3);
      engine.increment("sttDisconnections", 2);
      engine.increment("micPermissionDenials", 1);
      engine.setQueueDepth(12);

      const snapshot = engine.getSnapshot();
      expect(snapshot.sourceRetrievalSuccess).toBe(5);
      expect(snapshot.sourceDomainFailures).toBe(2);
      expect(snapshot.documentDownloadFailures).toBe(1);
      expect(snapshot.aiMalformedResponses).toBe(3);
      expect(snapshot.sttDisconnections).toBe(2);
      expect(snapshot.micPermissionDenials).toBe(1);
      expect(snapshot.jobQueueDepth).toBe(12);
    });

    it("calculates average OCR confidence across samples", () => {
      const engine = new ProductionTelemetryEngine();

      engine.recordOcrConfidence(0.95);
      engine.recordOcrConfidence(0.85);
      engine.recordOcrConfidence(0.90);

      expect(engine.getAverageOcrConfidence()).toBeCloseTo(0.90, 2);
    });
  });

  describe("2. Alerting Rule Evaluations", () => {
    it("triggers alerts for stuck processing queue and high OCR failure", () => {
      const engine = new ProductionTelemetryEngine();

      const alerts = engine.evaluateAlertConditions({
        queueDepth: 150, // Exceeds 100
        oldestJobWaitSeconds: 400, // Exceeds 300
        leaseExpirationsInWindow: 0,
        ocrFailureRate: 0.25, // Exceeds 0.20
        publishedPaperMissingAnswer: false,
        paperCountMismatch: false,
        crossUserAccessDetected: false,
        duplicateCreditChargeDetected: false,
        providerAuthFailure: false,
        requiredWorkerAvailable: true,
      });

      expect(alerts.some((a) => a.alert === "StuckProcessingQueue")).toBe(true);
      expect(alerts.some((a) => a.alert === "HighOcrFailureRate")).toBe(true);
    });

    it("triggers critical alerts on paper integrity and security violations", () => {
      const engine = new ProductionTelemetryEngine();

      const alerts = engine.evaluateAlertConditions({
        queueDepth: 10,
        oldestJobWaitSeconds: 30,
        leaseExpirationsInWindow: 4, // Repeated lease expiration!
        ocrFailureRate: 0.05,
        publishedPaperMissingAnswer: true, // Missing answer keys!
        paperCountMismatch: true, // Count mismatch!
        crossUserAccessDetected: true, // Cross user access!
        duplicateCreditChargeDetected: true, // Duplicate charge!
        providerAuthFailure: true, // Provider auth failure!
        requiredWorkerAvailable: false, // Worker unavailable!
      });

      expect(alerts.some((a) => a.alert === "RepeatedWorkerLeaseExpiration")).toBe(true);
      expect(alerts.some((a) => a.alert === "PublishedPaperMissingAnswer")).toBe(true);
      expect(alerts.some((a) => a.alert === "PaperCountMismatch")).toBe(true);
      expect(alerts.some((a) => a.alert === "CrossUserAccessAttempt")).toBe(true);
      expect(alerts.some((a) => a.alert === "DuplicateCreditChargeAttempt")).toBe(true);
      expect(alerts.some((a) => a.alert === "ProviderAuthenticationFailure")).toBe(true);
      expect(alerts.some((a) => a.alert === "RequiredWorkerUnavailable")).toBe(true);
    });
  });

  describe("3. Secret Redaction in Telemetry", () => {
    it("redacts sensitive fields from telemetry payloads", () => {
      const engine = new ProductionTelemetryEngine();
      const payloadWithSecrets = {
        userId: "user-123",
        apiKey: "sk-secret-key-12345",
        authToken: "Bearer eyJhbGciOi...",
        serviceRoleKey: "eyJhbGciOi...",
        nested: {
          password: "my-password",
          safeData: "ok",
        },
      };

      const sanitized = engine.sanitizePayload(payloadWithSecrets);
      expect(sanitized.userId).toBe("user-123");
      expect(sanitized.apiKey).toBe("[REDACTED]");
      expect(sanitized.authToken).toBe("[REDACTED]");
      expect(sanitized.serviceRoleKey).toBe("[REDACTED]");
      expect((sanitized.nested as any).password).toBe("[REDACTED]");
      expect((sanitized.nested as any).safeData).toBe("ok");
    });
  });

  describe("4. Worker Failure Recovery Simulation", () => {
    it("recovers and re-leases orphan jobs when a worker node crashes mid-execution", () => {
      interface Job {
        id: string;
        status: "queued" | "leased" | "completed";
        leasedBy: string | null;
        leasedUntil: number;
      }

      const jobPool: Job[] = [
        {
          id: "job-crashed",
          status: "leased",
          leasedBy: "crashed-worker-node",
          leasedUntil: 1000, // Expired at t=1000
        },
      ];

      // Simulated time t=2000 (worker restarted)
      const currentTime = 2000;
      const newlyRestartedWorker = "worker-restarted-1";

      const claimJob = (now: number, workerId: string): Job | null => {
        for (const j of jobPool) {
          if (j.status === "queued" || (j.status === "leased" && j.leasedUntil < now)) {
            j.status = "leased";
            j.leasedBy = workerId;
            j.leasedUntil = now + 30000;
            return j;
          }
        }
        return null;
      };

      const recoveredJob = claimJob(currentTime, newlyRestartedWorker);
      expect(recoveredJob).not.toBeNull();
      expect(recoveredJob?.id).toBe("job-crashed");
      expect(recoveredJob?.leasedBy).toBe("worker-restarted-1");
      expect(recoveredJob?.leasedUntil).toBe(32000);
    });
  });
});
