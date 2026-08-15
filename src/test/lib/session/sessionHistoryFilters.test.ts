import { describe, expect, it } from "vitest";
import {
  isCompletedSessionStatus,
  sessionMatchesTypeFilter,
  sessionTypeLabel,
} from "@/lib/session/sessionHistoryFilters";

describe("session history filters", () => {
  it("maps rehearsal to the Practice chip", () => {
    expect(sessionMatchesTypeFilter("rehearsal", "practice")).toBe(true);
    expect(sessionMatchesTypeFilter("practice", "practice")).toBe(true);
    expect(sessionMatchesTypeFilter("live", "practice")).toBe(false);
  });

  it("labels Answer Bank practice from source_type", () => {
    expect(sessionTypeLabel({ type: "rehearsal", source_type: "answer_bank" })).toBe(
      "Answer Bank practice",
    );
    expect(sessionTypeLabel({ type: "rehearsal" })).toBe("practice");
  });

  it("treats completed as a History-ready status without transcript", () => {
    expect(isCompletedSessionStatus("completed")).toBe(true);
    expect(isCompletedSessionStatus("active")).toBe(false);
  });
});
