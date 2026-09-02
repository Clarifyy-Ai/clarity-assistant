import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/network/fetchEdge", () => ({
  fetchEdgeJson: vi.fn(),
}));

import {
  interpretReminderSetupResponse,
  interpretReminderSetupError,
  reminderOutcomeMessage,
} from "@/lib/interviews/scheduleReminders";

describe("scheduleReminders", () => {
  it("reports email success only when email_sent is true", () => {
    const outcome = interpretReminderSetupResponse({
      success: true,
      email_configured: true,
      email_sent: true,
      reminders_queued: 2,
    });
    expect(outcome).toEqual({
      status: "success",
      kind: "email_sent",
      remindersQueued: 2,
    });
    expect(reminderOutcomeMessage(outcome)).toMatch(/confirmation email sent/i);
  });

  it("does not claim email success when dispatch failed", () => {
    const outcome = interpretReminderSetupResponse({
      success: true,
      email_configured: true,
      email_sent: false,
      send_confirmation: true,
      reminders_queued: 2,
    });
    expect(outcome).toMatchObject({ status: "success", kind: "email_failed" });
    expect(reminderOutcomeMessage(outcome)).toMatch(/could not be sent/i);
    expect(reminderOutcomeMessage(outcome)).not.toMatch(/email sent/i);
  });

  it("marks timestamp validation errors as retryable", () => {
    const outcome = interpretReminderSetupError(
      new Error("scheduled_at must be a valid future timestamp"),
    );
    expect(outcome.status).toBe("failed");
    expect(outcome.retryable).toBe(true);
    expect(outcome.message).toMatch(/scheduled time was rejected/i);
  });

  it("reports not configured email honestly", () => {
    const outcome = interpretReminderSetupResponse({
      success: true,
      email_configured: false,
      reminders_queued: 0,
    });
    expect(outcome).toMatchObject({ kind: "email_not_configured" });
    expect(reminderOutcomeMessage(outcome)).toMatch(/not configured/i);
  });

  it("queues T-24h/T-1h reminders even when email is not configured", () => {
    const outcome = interpretReminderSetupResponse({
      success: true,
      email_configured: false,
      reminders_queued: 2,
    });
    expect(outcome).toEqual({
      status: "success",
      kind: "email_not_configured",
      remindersQueued: 2,
    });
    expect(reminderOutcomeMessage(outcome)).toMatch(/in-app reminder created/i);
    expect(reminderOutcomeMessage(outcome)).toMatch(/not configured/i);
  });
});
