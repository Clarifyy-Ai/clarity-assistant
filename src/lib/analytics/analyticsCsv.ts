/**
 * Spreadsheet-safe Skills Analytics CSV export.
 * Dates are YYYY-MM-DD in the display timezone (no locale strings / Excel ####).
 */

import type { SessionAnalyticsSummary } from "@/types/analytics.types";
import { localDayKey } from "@/lib/analytics/dashboardDerivations";

export const ANALYTICS_CSV_HEADERS = [
  "Date",
  "Activity/Session Type",
  "Interview Type",
  "Company",
  "Overall Score",
  "Duration (min)",
  "Filler Rate",
  "WPM",
  "Questions",
] as const;

export function escapeAnalyticsCsvCell(value: unknown): string {
  const text = value === null || value === undefined ? "" : String(value);
  return /[",\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

function cellOrEmpty(value: unknown): string | number {
  if (value === null || value === undefined) return "";
  if (typeof value === "number" && !Number.isFinite(value)) return "";
  return value as string | number;
}

export function buildAnalyticsCsv(
  sessions: ReadonlyArray<SessionAnalyticsSummary>,
  options: { timeZone: string },
): string {
  const rows = buildAnalyticsSpreadsheetRows(sessions, options);

  const body = [ANALYTICS_CSV_HEADERS as unknown as string[], ...rows]
    .map((row) => row.map(escapeAnalyticsCsvCell).join(","))
    .join("\n");

  return `\uFEFF${body}`;
}

export function buildAnalyticsSpreadsheetRows(
  sessions: ReadonlyArray<SessionAnalyticsSummary>,
  options: { timeZone: string },
): Array<Array<string | number>> {
  return sessions.map((s) => {
    const anchor = s.started_at ?? s.date;
    const day =
      anchor && typeof anchor === "string"
        ? localDayKey(anchor, options.timeZone)
        : "";

    return [
      day || "",
      cellOrEmpty(s.mode),
      cellOrEmpty(s.interview_type),
      cellOrEmpty(s.company),
      cellOrEmpty(s.overall_score),
      cellOrEmpty(s.duration_minutes),
      typeof s.filler_rate === "number" && Number.isFinite(s.filler_rate)
        ? s.filler_rate.toFixed(2)
        : "",
      cellOrEmpty(s.wpm_avg),
      cellOrEmpty(s.question_count),
    ];
  });
}
