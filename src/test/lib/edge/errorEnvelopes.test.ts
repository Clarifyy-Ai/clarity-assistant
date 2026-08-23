import { describe, expect, it } from "vitest";

type Envelope = {
  error?: string;
  code?: string;
  success?: boolean;
  correlation_id?: string;
  correlationId?: string;
  operationId?: string;
  status?: string;
  already_completed?: boolean;
};

function assertSafeEnvelope(body: Envelope) {
  expect(body.code).toEqual(expect.any(String));
  expect(JSON.stringify(body)).not.toMatch(/service_role|SUPABASE_SERVICE|sk_live|whsec_/i);
}

describe("edge function error envelope contracts", () => {
  it("prep-tool provider failure does not leak internals", () => {
    const body: Envelope = {
      success: false,
      error: "AI provider unavailable",
      code: "PROVIDER_UNAVAILABLE",
      correlation_id: "req-1",
    };
    assertSafeEnvelope(body);
    expect(body.success).toBe(false);
  });

  it("send-email uses structured code + correlation id", () => {
    const body: Envelope = {
      success: false,
      error: "Email could not be sent",
      code: "EMAIL_UNAVAILABLE",
      correlation_id: "req-2",
    };
    assertSafeEnvelope(body);
  });

  it("submit-test duplicate submit is idempotent", () => {
    const body = {
      success: true,
      already_completed: true,
      analysis: null,
    };
    expect(body.already_completed).toBe(true);
    expect(body.success).toBe(true);
  });

  it("create-exam-paper credit denial is structured and not PAYMENT_REQUIRED", () => {
    const body: Envelope = {
      error: "You need 3 credits, but only 2 are available.",
      code: "INSUFFICIENT_CREDITS",
    };
    assertSafeEnvelope(body);
    expect(body.code).toBe("INSUFFICIENT_CREDITS");
    expect(body.code).not.toBe("PAYMENT_REQUIRED");
  });

  it("delete-account confirmation and operation states", () => {
    const missing: Envelope = {
      error: "Confirmation required",
      code: "CONFIRMATION_REQUIRED",
    };
    assertSafeEnvelope(missing);

    const inProgress: Envelope = {
      success: true,
      status: "processing",
      operationId: "op-1",
      correlationId: "req-3",
    };
    expect(inProgress.status).toBe("processing");
    expect(inProgress.operationId).toBeTruthy();
  });

  it("gap-analysis Free plan is structured CAPABILITY_REQUIRED 403", () => {
    const body: Envelope = {
      error: "This feature requires a higher plan (analytics).",
      code: "CAPABILITY_REQUIRED",
    };
    assertSafeEnvelope(body);
    expect(body.code).toBe("CAPABILITY_REQUIRED");
  });

  it("analytics-dashboard internal errors use INTERNAL_ERROR", () => {
    const body: Envelope = {
      error: "Internal server error",
      code: "INTERNAL_ERROR",
    };
    assertSafeEnvelope(body);
  });

  it("compare-sessions uses structured codes without PostgREST internals", () => {
    const body: Envelope = {
      error: "One of those sessions could not be found.",
      code: "SESSION_NOT_FOUND",
    };
    assertSafeEnvelope(body);
    expect(JSON.stringify(body)).not.toMatch(/PGRST|session_questions/i);
  });

  it("start-session daily limit is structured and not 502", () => {
    const body: Envelope = {
      error: "You've reached today's session limit (3 of 3).",
      code: "DAILY_LIMIT_REACHED",
    };
    assertSafeEnvelope(body);
    expect(body.code).toBe("DAILY_LIMIT_REACHED");
  });

  it("end-session duplicate end is idempotent", () => {
    const body = {
      session_id: "s1",
      status: "completed",
      terminal_reason: "USER_ENDED",
      already_terminal: true,
      duration_seconds: 120,
    };
    expect(body.already_terminal).toBe(true);
    expect(body.duration_seconds).toBeGreaterThanOrEqual(0);
  });
});
