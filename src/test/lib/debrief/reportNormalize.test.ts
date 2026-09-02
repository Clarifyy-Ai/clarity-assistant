import { describe, expect, it } from "vitest";
import { enrichDetailedReport } from "@/lib/debrief/enrichDetailedReport";
import { normalizeChangeTracking, normalizeKeywordList } from "@/lib/debrief/reportNormalize";

describe("debrief report change-tracking", () => {
  it("normalizes object keywords without TypeError", () => {
    expect(normalizeKeywordList([{ keyword: "React" }, "Go", { foo: 1 }])).toEqual(["React", "Go"]);
    const report = enrichDetailedReport(
      {
        missed_keywords: [{ term: "Kubernetes" } as unknown as string],
        change_tracking: [{ field: "role", from: "IC", to: "Staff" }] as never,
      },
      null,
      [],
    );
    expect(report.missed_keywords).toEqual(["Kubernetes"]);
    expect(report.change_tracking?.[0]).toMatchObject({ label: "role", from: "IC", to: "Staff" });
  });

  it("accepts string change rows", () => {
    expect(normalizeChangeTracking(["Updated summary"])).toEqual([
      { label: "Updated summary", from: null, to: null },
    ]);
  });
});
