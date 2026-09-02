import type { AnalyticsPeriod } from "@/types/analytics.types";

export type AnalyticsDashboardTab =
  | "scores"
  | "categories"
  | "speech"
  | "heatmap"
  | "compare";

export type SessionCountKpiScope = "period" | "compare";

export type SessionCountKpi = {
  value: number;
  label: string;
  scope: SessionCountKpiScope;
  description: string;
};

const PERIOD_SESSION_LABELS: Record<AnalyticsPeriod, string> = {
  "7d": "Sessions in last 7 days",
  "30d": "Sessions in last 30 days",
  "90d": "Sessions in last 90 days",
  all: "Sessions (all time)",
};

/** Unique selected ids that still exist in the comparable picker list. */
export function uniqueSelectedSessionCount(
  selectedIds: Array<string | null | undefined>,
  comparableIds: readonly string[],
): number {
  const eligible = new Set(comparableIds.filter((id) => id.length > 0));
  const unique = new Set<string>();
  for (const id of selectedIds) {
    if (id && eligible.has(id)) unique.add(id);
  }
  return unique.size;
}

export function periodSessionCountLabel(period: AnalyticsPeriod): string {
  return PERIOD_SESSION_LABELS[period];
}

/**
 * Session-count KPI for Reports. Trend tabs are period-scoped (same list as
 * the compare picker). The Compare tab is selection-scoped so a pair never
 * looks like "N sessions overall".
 */
export function resolveSessionCountKpi(input: {
  tab: string;
  period: AnalyticsPeriod;
  /** Length of the filtered dashboard session list (same source as Compare). */
  periodSessionCount: number;
  selectedIds: Array<string | null | undefined>;
  comparableIds: readonly string[];
}): SessionCountKpi {
  if (input.tab === "compare") {
    const selected = uniqueSelectedSessionCount(input.selectedIds, input.comparableIds);
    const comparable = input.comparableIds.length;
    if (selected === 0) {
      return {
        value: 0,
        label: "Sessions in this comparison",
        scope: "compare",
        description:
          comparable === 0
            ? "No comparable sessions in this date range."
            : "Select two sessions to compare.",
      };
    }
    return {
      value: selected,
      label: "Sessions in this comparison",
      scope: "compare",
      description:
        comparable === selected
          ? "Count matches the sessions selected below."
          : `${comparable} comparable in this date range.`,
    };
  }

  return {
    value: input.periodSessionCount,
    label: periodSessionCountLabel(input.period),
    scope: "period",
    description: "Filtered analytics range — not a comparison pair.",
  };
}
