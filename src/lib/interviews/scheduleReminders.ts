import { fetchEdgeJson } from "@/lib/network/fetchEdge";

export type ScheduleReminderResponse = {
  success?: boolean;
  email_sent?: boolean;
  email_configured?: boolean;
  reminders_queued?: number;
  send_confirmation?: boolean;
  error?: string;
};

export type ReminderSetupOutcome =
  | {
      status: "success";
      kind: "email_sent" | "email_not_configured" | "in_app_only" | "email_failed";
      remindersQueued: number;
    }
  | {
      status: "failed";
      message: string;
      retryable: boolean;
    };

export type SetupInterviewRemindersInput = {
  interviewId: string;
  company: string;
  role: string;
  scheduledAt: string;
  timezone: string;
};

export function interpretReminderSetupResponse(
  res: ScheduleReminderResponse,
): ReminderSetupOutcome {
  if (!res?.success) {
    return {
      status: "failed",
      message: res?.error ?? "Reminder setup failed.",
      retryable: true,
    };
  }

  const remindersQueued = res.reminders_queued ?? 0;

  if (res.email_configured === false) {
    return { status: "success", kind: "email_not_configured", remindersQueued };
  }

  if (res.send_confirmation !== false && res.email_sent === true) {
    return { status: "success", kind: "email_sent", remindersQueued };
  }

  if (res.send_confirmation !== false && res.email_configured && res.email_sent === false) {
    return { status: "success", kind: "email_failed", remindersQueued };
  }

  return { status: "success", kind: "in_app_only", remindersQueued };
}

export function interpretReminderSetupError(err: unknown): ReminderSetupOutcome {
  const message =
    err instanceof Error
      ? err.message
      : typeof err === "string"
        ? err
        : "Reminder setup failed.";

  const lower = message.toLowerCase();
  const timestampRejected =
    lower.includes("scheduled_at") ||
    lower.includes("future timestamp") ||
    lower.includes("valid future");

  return {
    status: "failed",
    message: timestampRejected
      ? "Reminder setup failed: scheduled time was rejected. Adjust the time and retry."
      : message,
    retryable: true,
  };
}

export function reminderOutcomeMessage(outcome: ReminderSetupOutcome): string {
  if (outcome.status === "failed") {
    return `Interview saved. ${outcome.message}`;
  }

  switch (outcome.kind) {
    case "email_sent":
      return "In-app reminder created and confirmation email sent.";
    case "email_not_configured":
      return "In-app reminder created. Email reminders are not configured on this environment (requires Resend).";
    case "email_failed":
      return "In-app reminder created, but the confirmation email could not be sent. Use Retry reminders on the interview page.";
    default:
      return "In-app reminder created.";
  }
}

export async function setupInterviewReminders(
  input: SetupInterviewRemindersInput,
): Promise<ReminderSetupOutcome> {
  try {
    const res = await fetchEdgeJson<ScheduleReminderResponse>("schedule-interview", {
      interview_id: input.interviewId,
      company_name: input.company,
      role_title: input.role,
      scheduled_at: input.scheduledAt,
      timezone: input.timezone,
    });
    return interpretReminderSetupResponse(res);
  } catch (err) {
    console.warn("[scheduleReminders] schedule-interview:", err);
    return interpretReminderSetupError(err);
  }
}
