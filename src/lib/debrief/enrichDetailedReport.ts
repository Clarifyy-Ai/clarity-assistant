import type { DetailedReport } from "@/components/debrief/DebriefAnalyticsPanels";
import { keywordToString, normalizeChangeTracking, normalizeKeywordList } from "@/lib/debrief/reportNormalize";

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

  base.missed_keywords = normalizeKeywordList(base.missed_keywords);
  base.jd_keywords = normalizeKeywordList(base.jd_keywords);
  base.change_tracking = normalizeChangeTracking(
    (report as { change_tracking?: unknown } | null | undefined)?.change_tracking,
  );

  if (Array.isArray(base.keyword_coverage)) {
    base.keyword_coverage = base.keyword_coverage
      .map((item) => {
        const keyword = keywordToString((item as { keyword?: unknown }).keyword) ?? keywordToString(item);
        if (!keyword) return null;
        return {
          keyword,
          covered: Boolean((item as { covered?: unknown }).covered),
          coverage_pct: Number((item as { coverage_pct?: unknown }).coverage_pct) || 0,
          suggestion: typeof (item as { suggestion?: unknown }).suggestion === "string"
            ? (item as { suggestion: string }).suggestion
            : undefined,
        };
      })
      .filter((item): item is NonNullable<typeof item> => Boolean(item));
  }

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
