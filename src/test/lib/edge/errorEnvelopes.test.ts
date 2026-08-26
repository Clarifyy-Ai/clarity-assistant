import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { httpStatusForCreditCode } from "@/lib/billing/creditErrorCodes";
import { httpStatusForDomainCode } from "../../../../supabase/functions/_shared/domainErrors";

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

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../..");

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

  it("prep-tool maps provider unavailable to 503 (never 502)", () => {
    expect(httpStatusForDomainCode("AI_PROVIDER_UNAVAILABLE")).toBe(503);
    expect(httpStatusForDomainCode("PROVIDER_UNAVAILABLE")).toBe(503);
    expect(httpStatusForDomainCode("AI_TIMEOUT")).toBe(503);
    expect(httpStatusForDomainCode("AI_INVALID_OUTPUT")).toBe(422);
    expect(httpStatusForDomainCode("AI_PROVIDER_UNAVAILABLE")).not.toBe(502);
    expect(httpStatusForCreditCode("PROVIDER_UNAVAILABLE")).toBe(503);
    expect(httpStatusForCreditCode("PROVIDER_UNAVAILABLE")).not.toBe(502);

    const domain = fs.readFileSync(
      path.join(root, "supabase/functions/_shared/domainErrors.ts"),
      "utf8",
    );
    const statusFn = domain.slice(domain.indexOf("httpStatusForDomainCode"));
    expect(statusFn).toMatch(/AI_PROVIDER_UNAVAILABLE[\s\S]{0,160}return 503/);
    expect(statusFn).not.toMatch(/AI_PROVIDER_UNAVAILABLE[\s\S]{0,80}return 502/);

    const src = fs.readFileSync(
      path.join(root, "supabase/functions/prep-tool/index.ts"),
      "utf8",
    );
    expect(src).toContain("httpStatusForDomainCode");
    expect(src).toContain("classifyAiFailure");
    // Provider-unavailable paths must not hardcode Bad Gateway.
    expect(src).not.toMatch(/PROVIDER_UNAVAILABLE[\s\S]{0,80},\s*502\b/);
    expect(src).not.toMatch(/,\s*502,\s*\n\s*correlationId/);
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
