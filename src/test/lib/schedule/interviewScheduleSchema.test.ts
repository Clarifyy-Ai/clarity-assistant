import { describe, expect, it } from "vitest";
import { interviewScheduleInputSchema } from "@/lib/schedule/interviewScheduleSchema";

describe("interviewScheduleInputSchema", () => {
  it("accepts IANA timezone + company/role", () => {
    const parsed = interviewScheduleInputSchema.parse({
      company_name: "Acme Corp",
      role_title: "Software Engineer",
      scheduled_at: "2026-09-01T10:00:00.000Z",
      timezone: "Asia/Kolkata",
    });
    expect(parsed.timezone).toBe("Asia/Kolkata");
  });

  it("rejects placeholder timezone", () => {
    const result = interviewScheduleInputSchema.safeParse({
      company_name: "Acme",
      role_title: "Engineer",
      scheduled_at: "2026-09-01T10:00:00.000Z",
      timezone: "IST",
    });
    expect(result.success).toBe(false);
  });
});
