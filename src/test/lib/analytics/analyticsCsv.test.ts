import { describe, expect, it } from "vitest";
import {
  ANALYTICS_CSV_HEADERS,
  buildAnalyticsCsv,
  escapeAnalyticsCsvCell,
} from "@/lib/analytics/analyticsCsv";
import type { SessionAnalyticsSummary } from "@/types/analytics.types";

function session(
  overrides: Partial<SessionAnalyticsSummary> = {},
): SessionAnalyticsSummary {
  return {
    session_id: "s1",
    date: "2026-09-04T10:00:00.000Z",
    started_at: "2026-09-04T10:00:00.000Z",
    mode: "mock",
    interview_type: "behavioural",
    company: "Acme",
    overall_score: 82,
    score_status: "scored",
    filler_rate: 1.5,
    wpm_avg: 140,
    duration_minutes: 25,
    question_count: 6,
    ...overrides,
  };
}

describe("analyticsCsv", () => {
  it("starts with UTF-8 BOM and exact headers", () => {
    const csv = buildAnalyticsCsv([session()], { timeZone: "UTC" });
    expect(csv.charCodeAt(0)).toBe(0xfeff);
    const headerLine = csv.slice(1).split("\n")[0];
    expect(headerLine).toBe(ANALYTICS_CSV_HEADERS.join(","));
  });

  it("uses YYYY-MM-DD dates in the display timezone", () => {
    // 2026-09-04 23:30 UTC → 2026-09-05 in Asia/Kolkata
    const csv = buildAnalyticsCsv(
      [
        session({
          date: "2026-09-04T23:30:00.000Z",
          started_at: "2026-09-04T23:30:00.000Z",
        }),
      ],
      { timeZone: "Asia/Kolkata" },
    );
    const row = csv.slice(1).split("\n")[1];
    expect(row.startsWith("2026-09-05,")).toBe(true);
    expect(row).not.toMatch(/\d{1,2}\/\d{1,2}\/\d{2,4}/);
  });

  it("populates fields and leaves unavailable values empty (not fake)", () => {
    const csv = buildAnalyticsCsv(
      [
        session({
          interview_type: null,
          company: null,
          overall_score: null,
          filler_rate: null,
          wpm_avg: null,
          duration_minutes: null,
          question_count: null,
        }),
      ],
      { timeZone: "UTC" },
    );
    const row = csv.slice(1).split("\n")[1];
    expect(row).toBe("2026-09-04,mock,,,,,,,");
  });

  it("escapes commas quotes and newlines", () => {
    expect(escapeAnalyticsCsvCell('Acme, Inc')).toBe('"Acme, Inc"');
    expect(escapeAnalyticsCsvCell('Say "hi"')).toBe('"Say ""hi"""');
    expect(escapeAnalyticsCsvCell("a\nb")).toBe('"a\nb"');
    expect(escapeAnalyticsCsvCell("a\rb")).toBe('"a\rb"');

    const csv = buildAnalyticsCsv(
      [session({ company: 'Acme, "Corp"' })],
      { timeZone: "UTC" },
    );
    expect(csv).toContain('"Acme, ""Corp"""');
  });

  it("includes Activity/Session Type and Interview Type columns", () => {
    const csv = buildAnalyticsCsv(
      [session({ mode: "live", interview_type: "technical" })],
      { timeZone: "UTC" },
    );
    const row = csv.slice(1).split("\n")[1];
    expect(row).toContain(",live,technical,Acme,82,25,1.50,140,6");
  });
});
