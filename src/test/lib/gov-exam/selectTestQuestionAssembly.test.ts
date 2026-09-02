import { describe, expect, it } from "vitest";
import {
  decideSelectTestOutcome,
  isQuickDrillConfig,
  mergeUniqueQuestionIds,
  selectAdaptiveQuestionIds,
  shouldInvokeAiFill,
  type SelectTestBankQuestion,
} from "../../../../supabase/functions/_shared/selectTestQuestionAssembly";

const identityShuffle = <T>(array: T[]): T[] => [...array];
const exactStemConflict = (stem: string, selected: string[]) => selected.includes(stem);

function q(
  id: string,
  opts?: Partial<SelectTestBankQuestion>,
): SelectTestBankQuestion {
  return {
    id,
    question_text: opts?.question_text ?? `Question stem ${id}?`,
    topic: opts?.topic ?? "Algebra",
    difficulty: opts?.difficulty ?? "MEDIUM",
    source: opts?.source ?? "OFFICIAL_PYP",
  };
}

function bankOf(count: number, difficulty: "EASY" | "MEDIUM" | "HARD" = "MEDIUM"): SelectTestBankQuestion[] {
  return Array.from({ length: count }, (_, i) =>
    q(`${difficulty}-${i + 1}`, { difficulty, question_text: `${difficulty} stem ${i + 1}?` }),
  );
}

describe("shouldInvokeAiFill / Quick Drill flags", () => {
  it("treats test_name Quick Drill as a quick drill request", () => {
    expect(isQuickDrillConfig({ test_name: "Quick Drill" })).toBe(true);
    expect(isQuickDrillConfig({ quick_drill: true })).toBe(true);
    expect(isQuickDrillConfig({ test_name: "SSC CGL Practice Test" })).toBe(false);
  });

  it("invokes AI fill for Quick Drill when the plan allows it, even without AI_GENERATED in source_types", () => {
    expect(
      shouldInvokeAiFill({
        sourceTypes: ["OFFICIAL_PYP"],
        quickDrill: true,
        allowAiFill: false,
        hasAiFillCapability: true,
      }),
    ).toBe(true);
  });

  it("does not invoke AI fill without capability", () => {
    expect(
      shouldInvokeAiFill({
        sourceTypes: ["OFFICIAL_PYP", "AI_GENERATED"],
        quickDrill: true,
        allowAiFill: true,
        hasAiFillCapability: false,
      }),
    ).toBe(false);
  });
});

describe("selectAdaptiveQuestionIds — 10-question Quick Drill", () => {
  it("returns 10/10 unique bank questions when inventory covers the request", () => {
    const questions = [
      ...bankOf(3, "EASY"),
      ...bankOf(5, "MEDIUM"),
      ...bankOf(2, "HARD"),
    ];
    const picked = selectAdaptiveQuestionIds({
      questions,
      questionCount: 10,
      easyPct: 30,
      hardPct: 20,
      conflictsWithSelected: exactStemConflict,
      shuffle: identityShuffle,
    });
    expect(picked.ids).toHaveLength(10);
    expect(new Set(picked.ids).size).toBe(10);
  });

  it("recycles recent-test questions instead of reporting an empty pool", () => {
    const questions = bankOf(10, "MEDIUM");
    const picked = selectAdaptiveQuestionIds({
      questions,
      questionCount: 10,
      recentIds: questions.map((row) => row.id),
      easyPct: 30,
      hardPct: 20,
      conflictsWithSelected: exactStemConflict,
      shuffle: identityShuffle,
    });
    expect(picked.ids).toHaveLength(10);
    expect(new Set(picked.ids).size).toBe(10);
  });

  it("skips duplicate stems and empty text", () => {
    const questions = [
      q("a", { difficulty: "MEDIUM", question_text: "Same stem?" }),
      q("b", { difficulty: "MEDIUM", question_text: "Same stem?" }),
      q("c", { difficulty: "MEDIUM", question_text: "   " }),
      ...bankOf(10, "MEDIUM"),
    ];
    const picked = selectAdaptiveQuestionIds({
      questions,
      questionCount: 10,
      easyPct: 30,
      hardPct: 20,
      conflictsWithSelected: exactStemConflict,
      shuffle: identityShuffle,
    });
    expect(picked.ids).toHaveLength(10);
    expect(picked.ids).not.toContain("b");
    expect(picked.ids).not.toContain("c");
    expect(new Set(picked.stems).size).toBe(picked.stems.length);
  });
});

describe("decideSelectTestOutcome — bank + AI fill + shortage", () => {
  const ten = ["b1", "b2", "b3", "b4", "b5", "b6", "b7", "b8", "b9", "b10"];

  it("10/10 bank is a 200 happy path", () => {
    const outcome = decideSelectTestOutcome({
      selectedIds: ten,
      questionCount: 10,
      allowShortfall: false,
      aiFillEnabled: true,
      aiFillAttempted: false,
      aiGeneratedCount: 0,
      pypOnly: false,
    });
    expect(outcome.status).toBe("ok");
    expect(outcome.httpStatus).toBe(200);
    expect(outcome.questionIds).toHaveLength(10);
    expect(outcome.questionIds).toEqual(ten);
  });

  it("partial bank + AI fill returns exactly 10", () => {
    const merged = mergeUniqueQuestionIds(
      ["b1", "b2", "b3", "b4"],
      ["ai1", "ai2", "ai3", "ai4", "ai5", "ai6"],
      10,
      identityShuffle,
    );
    const outcome = decideSelectTestOutcome({
      selectedIds: merged,
      questionCount: 10,
      allowShortfall: false,
      aiFillEnabled: true,
      aiFillAttempted: true,
      aiGeneratedCount: 6,
      pypOnly: false,
    });
    expect(merged).toHaveLength(10);
    expect(outcome.status).toBe("ok");
    expect(outcome.httpStatus).toBe(200);
    expect(outcome.questionIds).toHaveLength(10);
    expect(outcome.aiGeneratedCount).toBe(6);
    expect(new Set(outcome.questionIds).size).toBe(10);
  });

  it("zero bank + AI fill returns exactly 10 labeled AI questions", () => {
    const aiIds = Array.from({ length: 10 }, (_, i) => `ai-${i + 1}`);
    const merged = mergeUniqueQuestionIds([], aiIds, 10, identityShuffle);
    const outcome = decideSelectTestOutcome({
      selectedIds: merged,
      questionCount: 10,
      allowShortfall: false,
      aiFillEnabled: true,
      aiFillAttempted: true,
      aiGeneratedCount: 10,
      pypOnly: false,
    });
    expect(outcome.status).toBe("ok");
    expect(outcome.httpStatus).toBe(200);
    expect(outcome.questionIds).toEqual(aiIds);
    expect(outcome.aiGeneratedCount).toBe(10);
  });

  it("true insufficient inventory is 409, not 422, and does not claim AI fill ran", () => {
    const outcome = decideSelectTestOutcome({
      selectedIds: [],
      questionCount: 10,
      allowShortfall: false,
      aiFillEnabled: false,
      aiFillAttempted: false,
      aiGeneratedCount: 0,
      pypOnly: true,
    });
    expect(outcome.status).toBe("shortage");
    expect(outcome.httpStatus).toBe(409);
    expect(outcome.code).toBe("QUESTION_INVENTORY_INSUFFICIENT");
    expect(outcome.available).toBe(0);
    expect(outcome.requested).toBe(10);
    expect(outcome.error).toMatch(/0 approved questions/i);
    expect(outcome.error).not.toMatch(/after bank \+ AI fill/i);
  });

  it("AI fill attempted but still short uses a typed 409 shortage", () => {
    const outcome = decideSelectTestOutcome({
      selectedIds: [],
      questionCount: 10,
      allowShortfall: false,
      aiFillEnabled: true,
      aiFillAttempted: true,
      aiGeneratedCount: 0,
      pypOnly: false,
    });
    expect(outcome.httpStatus).toBe(409);
    expect(outcome.code).toBe("QUESTION_INVENTORY_INSUFFICIENT");
    expect(outcome.error).toMatch(/after bank \+ AI fill/i);
  });

  it("reserves 422 for invalid question counts only", () => {
    const outcome = decideSelectTestOutcome({
      selectedIds: ten,
      questionCount: 0,
      allowShortfall: false,
      aiFillEnabled: false,
      aiFillAttempted: false,
      aiGeneratedCount: 0,
      pypOnly: false,
    });
    expect(outcome.status).toBe("unprocessable");
    expect(outcome.httpStatus).toBe(422);
    expect(outcome.code).toBe("INVALID_CONFIG");
  });

  it("does not emit duplicate ids when bank and AI overlap", () => {
    const merged = mergeUniqueQuestionIds(
      ["b1", "b2", "ai1"],
      ["ai1", "ai2", "ai3", "ai4", "ai5", "ai6", "ai7", "b2"],
      10,
      identityShuffle,
    );
    expect(merged).toEqual(["b1", "b2", "ai1", "ai2", "ai3", "ai4", "ai5", "ai6", "ai7"]);
    expect(new Set(merged).size).toBe(merged.length);
  });
});
