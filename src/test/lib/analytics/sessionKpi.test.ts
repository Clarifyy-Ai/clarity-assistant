import { describe, expect, it } from "vitest";
import {
  periodSessionCountLabel,
  resolveSessionCountKpi,
  uniqueSelectedSessionCount,
} from "@/lib/analytics/sessionKpi";

const TEN_PERIOD = {
  periodSessionCount: 10,
  comparableIds: ["a", "b"],
};

describe("uniqueSelectedSessionCount", () => {
  it("counts unique ids that are still in the comparable list", () => {
    expect(uniqueSelectedSessionCount(["a", "b"], ["a", "b", "c"])).toBe(2);
    expect(uniqueSelectedSessionCount(["a", "a"], ["a", "b"])).toBe(1);
    expect(uniqueSelectedSessionCount(["gone"], ["a", "b"])).toBe(0);
    expect(uniqueSelectedSessionCount(["", null, undefined], ["a"])).toBe(0);
  });
});

describe("resolveSessionCountKpi", () => {
  it("uses the filtered period list on trend tabs, never an unlabeled overall count", () => {
    const kpi = resolveSessionCountKpi({
      tab: "scores",
      period: "30d",
      ...TEN_PERIOD,
      selectedIds: ["a", "b"],
    });
    expect(kpi.scope).toBe("period");
    expect(kpi.value).toBe(10);
    expect(kpi.label).toBe("Sessions in last 30 days");
    expect(kpi.label.toLowerCase()).not.toContain("overall");
  });

  it("changes the period label when the date range changes", () => {
    expect(
      resolveSessionCountKpi({
        tab: "scores",
        period: "7d",
        periodSessionCount: 3,
        selectedIds: [],
        comparableIds: [],
      }).label,
    ).toBe("Sessions in last 7 days");
    expect(
      resolveSessionCountKpi({
        tab: "heatmap",
        period: "all",
        periodSessionCount: 10,
        selectedIds: [],
        comparableIds: [],
      }).label,
    ).toBe("Sessions (all time)");
    expect(periodSessionCountLabel("90d")).toBe("Sessions in last 90 days");
  });

  it("scopes Compare to the two selected sessions, not the period total", () => {
    const kpi = resolveSessionCountKpi({
      tab: "compare",
      period: "30d",
      ...TEN_PERIOD,
      selectedIds: ["a", "b"],
    });
    expect(kpi.scope).toBe("compare");
    expect(kpi.value).toBe(2);
    expect(kpi.label).toBe("Sessions in this comparison");
    expect(kpi.value).not.toBe(10);
  });

  it("treats one-session and duplicate selection as a single compared session", () => {
    const one = resolveSessionCountKpi({
      tab: "compare",
      period: "30d",
      periodSessionCount: 10,
      comparableIds: ["a", "b"],
      selectedIds: ["a", ""],
    });
    const dup = resolveSessionCountKpi({
      tab: "compare",
      period: "30d",
      periodSessionCount: 10,
      comparableIds: ["a", "b"],
      selectedIds: ["a", "a"],
    });
    expect(one.value).toBe(1);
    expect(dup.value).toBe(1);
    expect(one.scope).toBe("compare");
  });

  it("shows an empty comparison count when nothing is selected", () => {
    const kpi = resolveSessionCountKpi({
      tab: "compare",
      period: "7d",
      periodSessionCount: 10,
      comparableIds: ["a", "b"],
      selectedIds: [],
    });
    expect(kpi.value).toBe(0);
    expect(kpi.label).toBe("Sessions in this comparison");
    expect(kpi.description).toMatch(/select two sessions/i);
  });

  it("describes an empty comparable list in this date range", () => {
    const kpi = resolveSessionCountKpi({
      tab: "compare",
      period: "7d",
      periodSessionCount: 10,
      comparableIds: [],
      selectedIds: ["stale"],
    });
    expect(kpi.value).toBe(0);
    expect(kpi.description).toMatch(/no comparable sessions/i);
  });
});
