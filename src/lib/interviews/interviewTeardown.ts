import { fetchEdgeJson } from "@/lib/network/fetchEdge";

export type InterviewTeardownInput = {
  interviewId: string;
  companyName?: string | null;
  roleTitle?: string | null;
  calendarEventId?: string | null;
};

export type CalendarDeleteFn = (input: {
  interviewId: string;
  eventId?: string | null;
}) => Promise<{ error?: string | null; code?: string | null }>;

export type TeardownInterviewOptions = {
  calendarSyncAvailable?: boolean;
  calendarConnected?: boolean;
  deleteCalendarEvent?: CalendarDeleteFn;
};

export type TeardownInterviewResult = {
  remindersCleared: boolean;
  calendarWarning?: string;
};

/** Cancel queued reminders and remove linked calendar events before hard delete. */
export async function teardownInterviewSideEffects(
  input: InterviewTeardownInput,
  opts: TeardownInterviewOptions = {},
): Promise<TeardownInterviewResult> {
  let remindersCleared = false;
  let calendarWarning: string | undefined;

  try {
    await fetchEdgeJson("schedule-interview", {
      action: "cancel",
      interview_id: input.interviewId,
      company_name: input.companyName ?? "Interview",
      role_title: input.roleTitle ?? "Role",
      scheduled_at: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
    });
    remindersCleared = true;
  } catch {
    remindersCleared = false;
  }

  if (
    opts.calendarSyncAvailable &&
    opts.calendarConnected &&
    opts.deleteCalendarEvent
  ) {
    try {
      const calResult = await opts.deleteCalendarEvent({
        interviewId: input.interviewId,
        eventId: input.calendarEventId,
      });
      if (calResult.error) {
        calendarWarning =
          calResult.code === "REAUTH_REQUIRED"
            ? "Reconnect Google Calendar to remove the calendar event."
            : "The Google Calendar event could not be removed.";
      }
    } catch {
      calendarWarning = "The Google Calendar event could not be removed.";
    }
  }

  return { remindersCleared, calendarWarning };
}
