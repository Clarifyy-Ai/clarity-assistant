import { describe, expect, it } from "vitest";
import { upcomingInterviewsForDashboard } from "@/lib/interviews/upcomingInterviews";
import { zonedWallTimeToUtc, formatInTimeZone } from "@/lib/interviews/scheduleTime";

describe("upcomingInterviewsForDashboard", () => {
  it("excludes cancelled interviews", () => {
    const future = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
    const list = upcomingInterviewsForDashboard([
      { created_at: future, scheduled_at: future, status: "cancelled" },
      { created_at: future, scheduled_at: future, status: "scheduled" },
    ]);
    expect(list).toHaveLength(1);
    expect(list[0].status).toBe("scheduled");
  });
});

describe("scheduleTime", () => {
  it("converts Asia/Kolkata wall time", () => {
    const d = zonedWallTimeToUtc("2026-08-30", "10:30", "Asia/Kolkata");
    expect(d?.toISOString()).toBe("2026-08-30T05:00:00.000Z");
    expect(formatInTimeZone(d!.toISOString(), "Asia/Kolkata")).toMatch(/2026/);
  });
});
