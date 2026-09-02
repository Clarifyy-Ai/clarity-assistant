import { afterEach, describe, expect, it, vi } from "vitest";

const fetchEdgeJson = vi.fn();

vi.mock("@/lib/network/fetchEdge", () => ({
  fetchEdgeJson: (...args: unknown[]) => fetchEdgeJson(...args),
}));

import { teardownInterviewSideEffects } from "@/lib/interviews/interviewTeardown";

describe("teardownInterviewSideEffects", () => {
  afterEach(() => {
    fetchEdgeJson.mockReset();
  });

  it("cancels reminders via schedule-interview", async () => {
    fetchEdgeJson.mockResolvedValue({ success: true, cancelled: true });
    const deleteCalendarEvent = vi.fn();

    const result = await teardownInterviewSideEffects(
      {
        interviewId: "iv-1",
        companyName: "Acme",
        roleTitle: "Engineer",
      },
      {
        calendarSyncAvailable: false,
        calendarConnected: false,
        deleteCalendarEvent,
      },
    );

    expect(fetchEdgeJson).toHaveBeenCalledWith(
      "schedule-interview",
      expect.objectContaining({ action: "cancel", interview_id: "iv-1" }),
    );
    expect(deleteCalendarEvent).not.toHaveBeenCalled();
    expect(result.remindersCleared).toBe(true);
  });

  it("deletes calendar event when connected", async () => {
    fetchEdgeJson.mockResolvedValue({ success: true });
    const deleteCalendarEvent = vi.fn().mockResolvedValue({ error: null });

    await teardownInterviewSideEffects(
      {
        interviewId: "iv-2",
        calendarEventId: "evt-1",
      },
      {
        calendarSyncAvailable: true,
        calendarConnected: true,
        deleteCalendarEvent,
      },
    );

    expect(deleteCalendarEvent).toHaveBeenCalledWith({
      interviewId: "iv-2",
      eventId: "evt-1",
    });
  });

  it("returns calendar warning on delete failure", async () => {
    fetchEdgeJson.mockResolvedValue({ success: true });
    const deleteCalendarEvent = vi.fn().mockResolvedValue({
      error: "failed",
      code: "REAUTH_REQUIRED",
    });

    const result = await teardownInterviewSideEffects(
      { interviewId: "iv-3", calendarEventId: "evt-2" },
      {
        calendarSyncAvailable: true,
        calendarConnected: true,
        deleteCalendarEvent,
      },
    );

    expect(result.calendarWarning).toMatch(/Reconnect Google Calendar/i);
  });
});
