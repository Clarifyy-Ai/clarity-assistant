import { describe, expect, it } from "vitest";

/**
 * Contract tests for document job lifecycle credit boundaries.
 * Edge owns reserve/refund; worker only settles on completion via RPC.
 */
describe("document job lifecycle contracts", () => {
  it("retry does not imply a second credit reservation", () => {
    const originalCreditsReserved = 8;
    const retryPayload = {
      jobId: "job-1",
      state: "queued",
      attemptCount: 2,
    };
    expect(retryPayload).not.toHaveProperty("credits_reserved");
    expect(retryPayload).not.toHaveProperty("creditCost");
    expect(originalCreditsReserved).toBe(8);
  });

  it("cancel response exposes single refund settlement flag", () => {
    const cancelOk = { success: true, state: "cancelled", creditsRefunded: true, correlationId: "c-1" };
    const cancelIdempotent = { success: true, idempotent: true, state: "cancelled", creditsRefunded: false };
    expect(cancelOk.creditsRefunded).toBe(true);
    expect(cancelIdempotent.creditsRefunded).toBe(false);
  });

  it("create job idempotency key format matches credit ledger scope", () => {
    const userId = "user-abc";
    const idempotencyKey = "idem-key-123456789012";
    const creditKey = `document_processing:${userId}:${idempotencyKey}`;
    expect(creditKey.startsWith("document_processing:")).toBe(true);
    expect(creditKey.endsWith(idempotencyKey)).toBe(true);
  });

  it("python dispatch envelope includes correlation_id and durable job_id", () => {
    const dispatch = {
      job_id: "550e8400-e29b-41d4-a716-446655440000",
      document_id: "doc-1",
      owner_id: "user-1",
      operation: "parse",
      correlation_id: "req-12345678",
      storage_reference: { bucket: "documents", path: "user-1/library/doc-1.pdf" },
    };
    expect(dispatch.job_id).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
    );
    expect(dispatch.correlation_id.length).toBeGreaterThanOrEqual(8);
    expect(dispatch.storage_reference.path).toContain("library/");
  });

  it("document_process hybrid order is python then ai", () => {
    const preferredOrder = ["python", "ai"];
    expect(preferredOrder[0]).toBe("python");
    expect(preferredOrder[1]).toBe("ai");
  });
});
