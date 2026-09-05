import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  dailyChecklistScopeId,
  isDailyChecklistScope,
  localChecklistStorageKey,
  loadInterviewDayChecklist,
  mergeChecklistState,
  parseLocalChecklist,
  resetChecklistPersistToastForTests,
  resolveChecklistScopeId,
  rowsToChecklistState,
  upsertInterviewDayChecklistItem,
} from "@/lib/interview/interviewDayChecklist";

const mockFrom = vi.fn();

vi.mock("@/lib/supabase/client", () => ({
  supabase: {
    from: (...args: unknown[]) => mockFrom(...args),
  },
}));

vi.mock("sonner", () => ({
  toast: { warning: vi.fn() },
}));

describe("interview day checklist persistence helpers", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resetChecklistPersistToastForTests();
    localStorage.clear();
  });

  afterEach(() => {
    localStorage.clear();
  });

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

  it("resolves interview scope when available, otherwise daily scope", () => {
    expect(resolveChecklistScopeId("iv-1")).toBe("iv-1");
    expect(resolveChecklistScopeId(null)).toBe(dailyChecklistScopeId());
    expect(isDailyChecklistScope(dailyChecklistScopeId())).toBe(true);
    expect(isDailyChecklistScope("iv-1")).toBe(false);
  });

  it("merges local and remote checklist state with remote winning conflicts", () => {
    expect(
      mergeChecklistState(
        { audio: true, water: true },
        { audio: false, notes: true },
      ),
    ).toEqual({ audio: false, water: true, notes: true });
  });

  it("loads daily scope from localStorage without hitting Supabase", async () => {
    localStorage.setItem(
      localChecklistStorageKey(dailyChecklistScopeId()),
      JSON.stringify({ audio: true }),
    );

    const state = await loadInterviewDayChecklist("user-1", dailyChecklistScopeId());
    expect(state).toEqual({ audio: true });
    expect(mockFrom).not.toHaveBeenCalled();
  });

  it("merges remote interview checklist rows with local fallback", async () => {
    const scopeId = "iv-99";
    localStorage.setItem(
      localChecklistStorageKey(scopeId),
      JSON.stringify({ water: true }),
    );

    mockFrom.mockReturnValue({
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          eq: vi.fn().mockResolvedValue({
            data: [{ item_id: "audio", checked: true }],
            error: null,
          }),
        }),
      }),
    });

    const state = await loadInterviewDayChecklist("user-1", scopeId);
    expect(state).toEqual({ water: true, audio: true });
    expect(mockFrom).toHaveBeenCalledWith("interview_day_checklists");
  });

  it("persists interview checklist items remotely and locally", async () => {
    const upsert = vi.fn().mockResolvedValue({ error: null });
    mockFrom.mockReturnValue({ upsert });

    const scopeId = "iv-42";
    const result = await upsertInterviewDayChecklistItem({
      userId: "user-1",
      scopeId,
      itemId: "audio",
      checked: true,
      nextState: { audio: true },
    });

    expect(result.persistedRemote).toBe(true);
    expect(upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        user_id: "user-1",
        interview_id: scopeId,
        item_id: "audio",
        checked: true,
      }),
      { onConflict: "user_id,interview_id,item_id" },
    );
    expect(JSON.parse(localStorage.getItem(localChecklistStorageKey(scopeId))!)).toEqual({
      audio: true,
    });
  });

  it("stores daily scope locally without remote upsert", async () => {
    const scopeId = dailyChecklistScopeId();
    const result = await upsertInterviewDayChecklistItem({
      userId: "user-1",
      scopeId,
      itemId: "quiet",
      checked: true,
      nextState: { quiet: true },
    });

    expect(result.persistedRemote).toBe(false);
    expect(mockFrom).not.toHaveBeenCalled();
    expect(JSON.parse(localStorage.getItem(localChecklistStorageKey(scopeId))!)).toEqual({
      quiet: true,
    });
  });
});
