import { describe, expect, it } from "vitest";
import { interviewReminderWorkerCheck } from "@/pages/app/admin/AdminDiagnostics";

describe("interviewReminderWorkerCheck", () => {
  it("is NOT_CONFIGURED when email providers are absent", () => {
    const check = interviewReminderWorkerCheck(false);
    expect(check.id).toBe("interview_reminders");
    expect(check.status).toBe("NOT_CONFIGURED");
    expect(check.detail).toMatch(/Cron is scheduled in repo/);
    expect(check.detail).toMatch(/Hostinger Mail or Resend/);
  });

  it("is WARNING when an email provider is present because Vault is not verified from git", () => {
    const check = interviewReminderWorkerCheck(true);
    expect(check.status).toBe("WARNING");
    expect(check.detail).toMatch(/send-interview-reminders-every-15m/);
    expect(check.detail).toMatch(/interview_reminder_cron_secret/);
  });
});
