import { describe, expect, it } from "vitest";
import {
  localChecklistStorageKey,
  parseLocalChecklist,
  rowsToChecklistState,
} from "@/lib/interview/interviewDayChecklist";

describe("interview day checklist persistence helpers", () => {
  it("uses a stable per-interview localStorage key", () => {
    expect(localChecklistStorageKey("iv-1")).toBe("clarify:interview-day-checklist:iv-1");
  });

  it("parses local JSON and maps remote rows idempotently by item_id", () => {
    expect(parseLocalChecklist(null)).toEqual({});
    expect(parseLocalChecklist("{not json")).toEqual({});
    expect(parseLocalChecklist(JSON.stringify({ audio: true, water: false }))).toEqual({
      audio: true,
      water: false,
    });
    expect(
      rowsToChecklistState([
        { item_id: "audio", checked: true },
        { item_id: "audio", checked: false },
        { item_id: "notes", checked: true },
      ]),
    ).toEqual({ audio: false, notes: true });
  });
});
