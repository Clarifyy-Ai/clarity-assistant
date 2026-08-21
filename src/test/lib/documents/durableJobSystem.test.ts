import { describe, expect, it } from "vitest";

export const DOCUMENT_JOB_STATES = [
  "queued",
  "leased",
  "downloading",
  "extracting",
  "OCR",
  "segmenting",
  "validating",
  "awaiting_review",
  "completed",
  "failed_retryable",
  "failed_permanent",
  "cancelled",
] as const;

export type DocumentJobState = (typeof DOCUMENT_JOB_STATES)[number];

export interface DocumentProcessingJob {
  id: string;
  document_id: string;
  owner_id: string;
  operation: "parse" | "exam_source" | "validate_paper";
  status: DocumentJobState;
  idempotency_key: string;
  request_hash: string;
  attempt_count: number;
  max_attempts: number;
  available_at: Date;
  lease_expires_at: Date | null;
  heartbeat_at: Date | null;
  worker_id: string | null;
  cancel_requested_at: Date | null;
  credits_reserved: number;
  credits_settled_at: Date | null;
  credits_refunded_at: Date | null;
  retryable: boolean;
  result_reference: string | null;
  warnings: any[];
  error_code: string | null;
  error_message: string | null;
  error_stage: string | null;
  created_at: Date;
  updated_at: Date;
  completed_at: Date | null;
}

export class MockJobEngine {
  public jobs = new Map<string, DocumentProcessingJob>();
  public userCredits = new Map<string, number>();
  public ledger: Array<{ userId: string; amount: number; action: string; reason: string }> = [];

  constructor() {
    this.userCredits.set("user-1", 100);
    this.userCredits.set("user-2", 100);
  }

  public createJob(params: {
    jobId: string;
    documentId: string;
    ownerId: string;
    idempotencyKey: string;
    requestHash: string;
    cost: number;
  }): { success: boolean; job?: DocumentProcessingJob; idempotent?: boolean; error?: string } {
    for (const job of this.jobs.values()) {
      if (job.owner_id === params.ownerId && job.idempotency_key === params.idempotencyKey) {
        return { success: true, job, idempotent: true };
      }
    }

    const currentBalance = this.userCredits.get(params.ownerId) ?? 0;
    if (currentBalance < params.cost) {
      return { success: false, error: "INSUFFICIENT_CREDITS" };
    }

    this.userCredits.set(params.ownerId, currentBalance - params.cost);
    this.ledger.push({
      userId: params.ownerId,
      amount: -params.cost,
      action: "usage",
      reason: `parse_document:${params.documentId}`,
    });

    const now = new Date();
    const job: DocumentProcessingJob = {
      id: params.jobId,
      document_id: params.documentId,
      owner_id: params.ownerId,
      operation: "parse",
      status: "queued",
      idempotency_key: params.idempotencyKey,
      request_hash: params.requestHash,
      attempt_count: 0,
      max_attempts: 3,
      available_at: now,
      lease_expires_at: null,
      heartbeat_at: null,
      worker_id: null,
      cancel_requested_at: null,
      credits_reserved: params.cost,
      credits_settled_at: null,
      credits_refunded_at: null,
      retryable: true,
      result_reference: null,
      warnings: [],
      error_code: null,
      error_message: null,
      error_stage: null,
      created_at: now,
      updated_at: now,
      completed_at: null,
    };
    this.jobs.set(params.jobId, job);
    return { success: true, job, idempotent: false };
  }

  public claimJob(workerId: string, leaseSeconds = 180): { ok: boolean; job?: DocumentProcessingJob; code?: string } {
    const now = new Date();

    // Dead-letter pass
    for (const job of this.jobs.values()) {
      if (
        job.attempt_count >= job.max_attempts &&
        job.status !== "completed" &&
        job.status !== "failed_permanent" &&
        job.status !== "cancelled"
      ) {
        job.status = "failed_permanent";
        job.retryable = false;
        job.completed_at = now;
        job.lease_expires_at = null;
        job.worker_id = null;
        this.refundJob(job.id, "max_attempts");
      }
    }

    for (const job of this.jobs.values()) {
      const isClaimable =
        (job.status === "queued" || job.status === "failed_retryable") &&
        job.available_at <= now;
      const isExpiredLease =
        [
          "leased",
          "downloading",
          "extracting",
          "OCR",
          "segmenting",
          "validating",
          "awaiting_review",
        ].includes(job.status) &&
        job.lease_expires_at !== null &&
        job.lease_expires_at < now;

      if ((isClaimable || isExpiredLease) && job.attempt_count < job.max_attempts && !job.cancel_requested_at) {
        job.status = "leased";
        job.worker_id = workerId;
        job.lease_expires_at = new Date(now.getTime() + leaseSeconds * 1000);
        job.heartbeat_at = now;
        job.attempt_count += 1;
        job.updated_at = now;
        return { ok: true, job: { ...job } };
      }
    }

    return { ok: false, code: "NO_CLAIMABLE_JOB" };
  }

  public heartbeatJob(jobId: string, workerId: string, leaseSeconds = 180): boolean {
    const now = new Date();
    const job = this.jobs.get(jobId);
    if (
      !job ||
      job.worker_id !== workerId ||
      !job.lease_expires_at ||
      job.lease_expires_at <= now ||
      ![
        "leased",
        "downloading",
        "extracting",
        "OCR",
        "segmenting",
        "validating",
        "awaiting_review",
      ].includes(job.status)
    ) {
      return false;
    }
    job.heartbeat_at = now;
    job.lease_expires_at = new Date(now.getTime() + leaseSeconds * 1000);
    job.updated_at = now;
    return true;
  }

  public transitionJob(params: {
    jobId: string;
    workerId: string;
    status: DocumentJobState;
    stage?: string;
    resultReference?: string;
    errorCode?: string;
    errorMessage?: string;
    retryable?: boolean;
    backoffSeconds?: number;
  }): { ok: boolean; job?: DocumentProcessingJob; code?: string } {
    const now = new Date();
    const job = this.jobs.get(params.jobId);
    if (
      !job ||
      job.worker_id !== params.workerId ||
      !job.lease_expires_at ||
      job.lease_expires_at <= now ||
      ["completed", "failed_permanent", "cancelled"].includes(job.status)
    ) {
      return { ok: false, code: "LEASE_LOST_OR_TERMINAL" };
    }

    let effectiveStatus = params.status;
    if (params.status === "failed_retryable" && job.attempt_count >= job.max_attempts) {
      effectiveStatus = "failed_permanent";
    }

    job.status = effectiveStatus;
    job.error_stage = params.stage ?? null;
    job.error_code = params.errorCode ?? null;
    job.error_message = params.errorMessage ?? null;
    if (params.resultReference) job.result_reference = params.resultReference;
    job.updated_at = now;

    if (effectiveStatus === "completed") {
      job.retryable = false;
      job.completed_at = now;
      job.lease_expires_at = null;
      job.worker_id = null;
    } else if (effectiveStatus === "failed_permanent") {
      job.retryable = false;
      job.completed_at = now;
      job.lease_expires_at = null;
      job.worker_id = null;
      this.refundJob(job.id, "failed_permanent");
    } else if (effectiveStatus === "failed_retryable") {
      job.retryable = true;
      job.available_at = new Date(now.getTime() + (params.backoffSeconds ?? 5) * 1000);
      job.lease_expires_at = null;
      job.worker_id = null;
    }

    return { ok: true, job: { ...job } };
  }

  public retryJob(jobId: string, userId: string): { success: boolean; job?: DocumentProcessingJob; error?: string } {
    const job = this.jobs.get(jobId);
    if (!job || job.owner_id !== userId) {
      return { success: false, error: "JOB_NOT_FOUND" };
    }
    if (job.status === "completed") {
      return { success: true, job };
    }
    if (job.status !== "failed_retryable") {
      return { success: false, error: "JOB_NOT_RETRYABLE" };
    }

    job.status = "queued";
    job.available_at = new Date();
    job.lease_expires_at = null;
    job.worker_id = null;
    job.error_code = null;
    job.error_message = null;
    job.error_stage = null;
    job.updated_at = new Date();

    return { success: true, job: { ...job } };
  }

  public cancelJob(jobId: string, userId: string): { success: boolean; creditsRefunded: boolean; error?: string } {
    const job = this.jobs.get(jobId);
    if (!job || job.owner_id !== userId) {
      return { success: false, creditsRefunded: false, error: "JOB_NOT_FOUND" };
    }
    if (job.status === "completed") {
      return { success: false, creditsRefunded: false, error: "JOB_COMPLETED" };
    }
    if (job.status === "failed_permanent") {
      return { success: false, creditsRefunded: false, error: "JOB_TERMINAL" };
    }
    if (job.status === "cancelled") {
      return { success: true, creditsRefunded: false };
    }

    const now = new Date();
    job.status = "cancelled";
    job.cancel_requested_at = now;
    job.completed_at = now;
    job.lease_expires_at = null;
    job.worker_id = null;
    job.retryable = false;
    job.updated_at = now;

    const refund = this.refundJob(jobId, "document_processing_cancelled");
    return { success: true, creditsRefunded: refund.refunded };
  }

  public settleJob(jobId: string): { success: boolean; alreadySettled: boolean } {
    const job = this.jobs.get(jobId);
    if (!job || job.status !== "completed") {
      return { success: false, alreadySettled: false };
    }
    const alreadySettled = job.credits_settled_at !== null;
    job.credits_settled_at = job.credits_settled_at ?? new Date();
    return { success: true, alreadySettled };
  }

  public refundJob(jobId: string, reason: string): { success: boolean; refunded: boolean } {
    const job = this.jobs.get(jobId);
    if (!job) return { success: false, refunded: false };
    if (job.credits_refunded_at !== null || job.credits_reserved === 0) {
      return { success: true, refunded: false };
    }

    const currentBalance = this.userCredits.get(job.owner_id) ?? 0;
    this.userCredits.set(job.owner_id, currentBalance + job.credits_reserved);
    this.ledger.push({
      userId: job.owner_id,
      amount: job.credits_reserved,
      action: "refund",
      reason,
    });
    job.credits_refunded_at = new Date();
    job.credits_reserved = 0;
    return { success: true, refunded: true };
  }
}

describe("Durable Document Processing Job System", () => {
  it("1. Normal Processing: advances through durable states to completion and credit settlement", () => {
    const engine = new MockJobEngine();
    const created = engine.createJob({
      jobId: "job-1",
      documentId: "doc-1",
      ownerId: "user-1",
      idempotencyKey: "idem-key-12345678",
      requestHash: "hash-123",
      cost: 8,
    });
    expect(created.success).toBe(true);
    expect(engine.userCredits.get("user-1")).toBe(92);

    const claimed = engine.claimJob("worker-node-1", 120);
    expect(claimed.ok).toBe(true);
    expect(claimed.job?.status).toBe("leased");
    expect(claimed.job?.attempt_count).toBe(1);

    const stages: DocumentJobState[] = [
      "downloading",
      "extracting",
      "OCR",
      "segmenting",
      "validating",
      "completed",
    ];

    for (const stage of stages) {
      const res = engine.transitionJob({
        jobId: "job-1",
        workerId: "worker-node-1",
        status: stage,
        stage,
        resultReference: stage === "completed" ? "parsed-content-ref-1" : undefined,
      });
      expect(res.ok).toBe(true);
      expect(engine.heartbeatJob("job-1", "worker-node-1", 120)).toBe(stage !== "completed");
    }

    const settled = engine.settleJob("job-1");
    expect(settled.success).toBe(true);
    expect(engine.jobs.get("job-1")?.status).toBe("completed");
    expect(engine.jobs.get("job-1")?.result_reference).toBe("parsed-content-ref-1");
    expect(engine.userCredits.get("user-1")).toBe(92); // Balance untouched on settlement
  });

  it("2. Duplicate Request: returns existing job without duplicate charge", () => {
    const engine = new MockJobEngine();
    const first = engine.createJob({
      jobId: "job-dup",
      documentId: "doc-dup",
      ownerId: "user-1",
      idempotencyKey: "idem-exact-key-123",
      requestHash: "hash-dup",
      cost: 8,
    });
    expect(first.success).toBe(true);
    expect(first.idempotent).toBe(false);
    expect(engine.userCredits.get("user-1")).toBe(92);

    const second = engine.createJob({
      jobId: "job-dup-race",
      documentId: "doc-dup",
      ownerId: "user-1",
      idempotencyKey: "idem-exact-key-123",
      requestHash: "hash-dup",
      cost: 8,
    });
    expect(second.success).toBe(true);
    expect(second.idempotent).toBe(true);
    expect(second.job?.id).toBe("job-dup");
    expect(engine.userCredits.get("user-1")).toBe(92); // Still 92, no second charge
  });

  it("3. Worker Crash: expired lease is reclaimed by another worker", () => {
    const engine = new MockJobEngine();
    engine.createJob({
      jobId: "job-crash",
      documentId: "doc-crash",
      ownerId: "user-1",
      idempotencyKey: "idem-crash-key",
      requestHash: "hash-crash",
      cost: 8,
    });

    const claimed1 = engine.claimJob("worker-1", 60);
    expect(claimed1.ok).toBe(true);
    expect(claimed1.job?.attempt_count).toBe(1);

    engine.transitionJob({
      jobId: "job-crash",
      workerId: "worker-1",
      status: "downloading",
    });

    // Simulate worker 1 dying and lease expiring
    const job = engine.jobs.get("job-crash")!;
    job.lease_expires_at = new Date(Date.now() - 5000);

    // Worker 2 reclaims the job
    const claimed2 = engine.claimJob("worker-2", 60);
    expect(claimed2.ok).toBe(true);
    expect(claimed2.job?.id).toBe("job-crash");
    expect(claimed2.job?.attempt_count).toBe(2);
    expect(claimed2.job?.worker_id).toBe("worker-2");

    // Worker 2 completes job
    const done = engine.transitionJob({
      jobId: "job-crash",
      workerId: "worker-2",
      status: "completed",
    });
    expect(done.ok).toBe(true);
    expect(engine.jobs.get("job-crash")?.status).toBe("completed");
  });

  it("4. Lease Expiration: heartbeat and transition fail after lease lapses", () => {
    const engine = new MockJobEngine();
    engine.createJob({
      jobId: "job-lease-exp",
      documentId: "doc-exp",
      ownerId: "user-1",
      idempotencyKey: "idem-exp-key",
      requestHash: "hash-exp",
      cost: 8,
    });

    engine.claimJob("worker-1", 60);
    expect(engine.heartbeatJob("job-lease-exp", "worker-1", 60)).toBe(true);

    // Force lease expiration
    engine.jobs.get("job-lease-exp")!.lease_expires_at = new Date(Date.now() - 1000);

    expect(engine.heartbeatJob("job-lease-exp", "worker-1", 60)).toBe(false);
    const trans = engine.transitionJob({
      jobId: "job-lease-exp",
      workerId: "worker-1",
      status: "extracting",
    });
    expect(trans.ok).toBe(false);
    expect(trans.code).toBe("LEASE_LOST_OR_TERMINAL");
  });

  it("5. Retry & Dead-Letter Handling: retryable failure recovers, max attempts dead-letters and refunds", () => {
    const engine = new MockJobEngine();
    engine.createJob({
      jobId: "job-retry",
      documentId: "doc-retry",
      ownerId: "user-1",
      idempotencyKey: "idem-retry-key",
      requestHash: "hash-retry",
      cost: 8,
    });
    const job = engine.jobs.get("job-retry")!;
    job.max_attempts = 2;

    // Attempt 1: fail retryable
    engine.claimJob("worker-1", 60);
    const fail1 = engine.transitionJob({
      jobId: "job-retry",
      workerId: "worker-1",
      status: "failed_retryable",
      errorCode: "TRANSIENT_TIMEOUT",
      retryable: true,
      backoffSeconds: 5,
    });
    expect(fail1.ok).toBe(true);
    expect(job.status).toBe("failed_retryable");

    // Retry request resets to queued without charging credits
    const retried = engine.retryJob("job-retry", "user-1");
    expect(retried.success).toBe(true);
    expect(job.status).toBe("queued");
    expect(engine.userCredits.get("user-1")).toBe(92);

    // Attempt 2: fail retryable again (now reached max_attempts = 2)
    engine.claimJob("worker-2", 60);
    const fail2 = engine.transitionJob({
      jobId: "job-retry",
      workerId: "worker-2",
      status: "failed_retryable",
      errorCode: "PARSER_CRASH",
      retryable: true,
      backoffSeconds: 10,
    });
    expect(fail2.ok).toBe(true);
    // Automatically promoted to failed_permanent and refunded
    expect(job.status).toBe("failed_permanent");
    expect(job.retryable).toBe(false);
    expect(engine.userCredits.get("user-1")).toBe(100); // 8 credits refunded
  });

  it("6. Cancellation: in-flight job cancellation revokes lease, refunds credits, rejects completed jobs", () => {
    const engine = new MockJobEngine();
    engine.createJob({
      jobId: "job-cancel",
      documentId: "doc-cancel",
      ownerId: "user-1",
      idempotencyKey: "idem-cancel-key",
      requestHash: "hash-cancel",
      cost: 8,
    });
    engine.claimJob("worker-1", 60);

    const cancelRes = engine.cancelJob("job-cancel", "user-1");
    expect(cancelRes.success).toBe(true);
    expect(cancelRes.creditsRefunded).toBe(true);
    expect(engine.jobs.get("job-cancel")?.status).toBe("cancelled");
    expect(engine.userCredits.get("user-1")).toBe(100); // 8 credits refunded

    // Worker cannot transition or heartbeat cancelled job
    expect(engine.heartbeatJob("job-cancel", "worker-1")).toBe(false);
    expect(
      engine.transitionJob({
        jobId: "job-cancel",
        workerId: "worker-1",
        status: "completed",
      }).ok,
    ).toBe(false);

    // Cannot cancel completed jobs
    engine.createJob({
      jobId: "job-done",
      documentId: "doc-done",
      ownerId: "user-1",
      idempotencyKey: "idem-done-key",
      requestHash: "hash-done",
      cost: 8,
    });
    engine.claimJob("worker-1", 60);
    engine.transitionJob({ jobId: "job-done", workerId: "worker-1", status: "completed" });
    const cancelDone = engine.cancelJob("job-done", "user-1");
    expect(cancelDone.success).toBe(false);
    expect(cancelDone.error).toBe("JOB_COMPLETED");
  });

  it("7. Duplicate Worker Protection: stale worker cannot hijack or overwrite newer lease", () => {
    const engine = new MockJobEngine();
    engine.createJob({
      jobId: "job-dup-worker",
      documentId: "doc-dup",
      ownerId: "user-1",
      idempotencyKey: "idem-dup-worker",
      requestHash: "hash-dup-worker",
      cost: 8,
    });

    const claimedA = engine.claimJob("worker-A", 30);
    expect(claimedA.ok).toBe(true);

    // Worker A's lease expires
    engine.jobs.get("job-dup-worker")!.lease_expires_at = new Date(Date.now() - 1000);

    // Worker B claims the job
    const claimedB = engine.claimJob("worker-B", 30);
    expect(claimedB.ok).toBe(true);
    expect(engine.jobs.get("job-dup-worker")?.worker_id).toBe("worker-B");

    // Worker A wakes up and attempts update -> rejected
    const updateA = engine.transitionJob({
      jobId: "job-dup-worker",
      workerId: "worker-A",
      status: "extracting",
    });
    expect(updateA.ok).toBe(false);
    expect(updateA.code).toBe("LEASE_LOST_OR_TERMINAL");

    // Worker B updates successfully
    const updateB = engine.transitionJob({
      jobId: "job-dup-worker",
      workerId: "worker-B",
      status: "extracting",
    });
    expect(updateB.ok).toBe(true);
  });

  it("8. Credit Finalization: settlement confirms deduction; refund restores profile balance", () => {
    const engine = new MockJobEngine();
    engine.createJob({
      jobId: "job-credit-fin",
      documentId: "doc-fin",
      ownerId: "user-1",
      idempotencyKey: "idem-fin-key",
      requestHash: "hash-fin",
      cost: 8,
    });
    expect(engine.userCredits.get("user-1")).toBe(92);

    engine.claimJob("worker-1", 60);
    engine.transitionJob({ jobId: "job-credit-fin", workerId: "worker-1", status: "completed" });

    // First settlement
    const s1 = engine.settleJob("job-credit-fin");
    expect(s1.success).toBe(true);
    expect(s1.alreadySettled).toBe(false);

    // Second settlement idempotent
    const s2 = engine.settleJob("job-credit-fin");
    expect(s2.success).toBe(true);
    expect(s2.alreadySettled).toBe(true);

    // Balance remains 92
    expect(engine.userCredits.get("user-1")).toBe(92);
  });
});
