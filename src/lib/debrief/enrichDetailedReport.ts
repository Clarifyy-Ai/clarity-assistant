import type { DetailedReport } from "@/components/debrief/DebriefAnalyticsPanels";

type Segment = {
  wpm?: number | null;
  filler_count?: number | null;
  offset_ms?: number | null;
};

function buildChartsAvailable(report: DetailedReport): DetailedReport["charts_available"] {
  return {
    wpm: (report.wpm_series?.length ?? 0) > 1,
    fillers: (report.filler_series?.length ?? 0) > 1,
    pauses: (report.pause_series?.length ?? 0) > 0,
    confidence: (report.confidence_series?.length ?? 0) > 1,
  };
}

export function enrichDetailedReport(
  report: DetailedReport | null | undefined,
  _session: Record<string, unknown> | null,
  segments: Segment[],
): DetailedReport {
  const base: DetailedReport = { ...(report ?? {}) };

  if (!base.wpm_series?.length) {
    const fromSegments = segments
      .filter((s) => s.wpm != null && s.offset_ms != null)
      .map((s) => ({
        t: (s.offset_ms as number) / 1000,
        wpm: s.wpm as number,
      }));
    if (fromSegments.length) {
      base.wpm_series = fromSegments;
    }
  }

  if (!base.filler_series?.length) {
    const fromSegments = segments
      .filter((s) => s.filler_count != null && s.offset_ms != null)
      .map((s) => ({
        t: (s.offset_ms as number) / 1000,
        count: s.filler_count as number,
      }));
    if (fromSegments.length) {
      base.filler_series = fromSegments;
    }
  }

  base.charts_available = buildChartsAvailable(base);

  return base;
}
