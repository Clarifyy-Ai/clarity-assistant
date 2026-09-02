/**
 * Pure Quick Drill / mock-test question assembly.
 * No Deno or network imports — unit-tested from src/test.
 */

export type SelectTestBankQuestion = {
  id: string;
  question_text?: string | null;
  topic?: string | null;
  difficulty?: string | null;
  source?: string | null;
};

export type StemConflictFn = (stem: string, selectedStems: string[]) => boolean;
export type ShuffleFn = <T>(array: T[]) => T[];

export function shuffleInPlaceCopy<T>(array: T[]): T[] {
  const arr = [...array];
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

export function isQuickDrillConfig(config: {
  quick_drill?: unknown;
  test_name?: unknown;
}): boolean {
  if (config.quick_drill === true) return true;
  return String(config.test_name ?? "").trim().toLowerCase() === "quick drill";
}

export function shouldInvokeAiFill(input: {
  sourceTypes: string[];
  quickDrill: boolean;
  allowAiFill: boolean;
  hasAiFillCapability: boolean;
}): boolean {
  if (!input.hasAiFillCapability) return false;
  if (input.sourceTypes.includes("AI_GENERATED")) return true;
  if (input.allowAiFill) return true;
  if (input.quickDrill) return true;
  return false;
}

function bucketDifficulty(raw: string | null | undefined): "EASY" | "MEDIUM" | "HARD" {
  const diff = String(raw ?? "").toUpperCase();
  if (diff === "EASY" || diff === "HARD") return diff;
  return "MEDIUM";
}

function tryPickId(
  id: string,
  questionsById: Map<string, SelectTestBankQuestion>,
  usedIds: Set<string>,
  selectedStems: string[],
  conflictsWithSelected: StemConflictFn,
): boolean {
  if (usedIds.has(id)) return false;
  const row = questionsById.get(id);
  const stem = String(row?.question_text ?? "").trim();
  if (!stem) return false;
  if (conflictsWithSelected(stem, selectedStems)) return false;
  usedIds.add(id);
  selectedStems.push(stem);
  return true;
}

/**
 * Adaptive pick from the eligible bank.
 * Prefers unseen (not in recent tests) questions, then recycles recent ones
 * so a small bank is not reported as 0/N after the last few drills.
 */
export function selectAdaptiveQuestionIds(input: {
  questions: SelectTestBankQuestion[];
  questionCount: number;
  recentIds?: Iterable<string>;
  easyPct: number;
  hardPct: number;
  topicAcc?: Record<string, number>;
  conflictsWithSelected: StemConflictFn;
  shuffle?: ShuffleFn;
}): { ids: string[]; stems: string[] } {
  const shuffle = input.shuffle ?? shuffleInPlaceCopy;
  const questionCount = Math.max(0, Math.floor(input.questionCount));
  const recentQ = new Set(input.recentIds ?? []);
  const topicAcc = input.topicAcc ?? {};
  const questionsById = new Map(input.questions.map((q) => [q.id, q]));

  type Pool = { priority: string[]; normal: string[] };
  const fresh: Record<"EASY" | "MEDIUM" | "HARD", Pool> = {
    EASY: { priority: [], normal: [] },
    MEDIUM: { priority: [], normal: [] },
    HARD: { priority: [], normal: [] },
  };
  const recycled: Record<"EASY" | "MEDIUM" | "HARD", Pool> = {
    EASY: { priority: [], normal: [] },
    MEDIUM: { priority: [], normal: [] },
    HARD: { priority: [], normal: [] },
  };

  for (const q of input.questions) {
    const stem = String(q.question_text ?? "").trim();
    if (!stem) continue;
    const diff = bucketDifficulty(q.difficulty);
    const acc = topicAcc[q.topic ?? ""];
    const pool = recentQ.has(q.id) ? recycled : fresh;
    if (acc === undefined || acc < 60) {
      pool[diff].priority.push(q.id);
    } else {
      pool[diff].normal.push(q.id);
    }
  }

  const countEasy = Math.round((questionCount * input.easyPct) / 100);
  const countHard = Math.round((questionCount * input.hardPct) / 100);
  const countMed = questionCount - countEasy - countHard;

  const selectedStems: string[] = [];
  const usedIds = new Set<string>();

  function pickUnique(pool: Pool, target: number): string[] {
    if (target <= 0) return [];
    const combined = [...shuffle(pool.priority), ...shuffle(pool.normal)];
    const picked: string[] = [];
    for (const id of combined) {
      if (picked.length >= target) break;
      if (tryPickId(id, questionsById, usedIds, selectedStems, input.conflictsWithSelected)) {
        picked.push(id);
      }
    }
    return picked;
  }

  const selectedIds = [
    ...pickUnique(fresh.EASY, countEasy),
    ...pickUnique(fresh.MEDIUM, countMed),
    ...pickUnique(fresh.HARD, countHard),
  ];

  const leftoverFresh = shuffle(
    input.questions
      .map((q) => q.id)
      .filter((id) => !usedIds.has(id) && !recentQ.has(id)),
  );
  for (const id of leftoverFresh) {
    if (selectedIds.length >= questionCount) break;
    if (tryPickId(id, questionsById, usedIds, selectedStems, input.conflictsWithSelected)) {
      selectedIds.push(id);
    }
  }

  if (selectedIds.length < questionCount) {
    const leftoverRecent = [
      ...pickUnique(recycled.EASY, questionCount - selectedIds.length),
    ];
    selectedIds.push(...leftoverRecent);
  }
  if (selectedIds.length < questionCount) {
    selectedIds.push(...pickUnique(recycled.MEDIUM, questionCount - selectedIds.length));
  }
  if (selectedIds.length < questionCount) {
    selectedIds.push(...pickUnique(recycled.HARD, questionCount - selectedIds.length));
  }
  if (selectedIds.length < questionCount) {
    const leftoverRecentFlat = shuffle(
      input.questions
        .map((q) => q.id)
        .filter((id) => !usedIds.has(id) && recentQ.has(id)),
    );
    for (const id of leftoverRecentFlat) {
      if (selectedIds.length >= questionCount) break;
      if (tryPickId(id, questionsById, usedIds, selectedStems, input.conflictsWithSelected)) {
        selectedIds.push(id);
      }
    }
  }

  return { ids: selectedIds.slice(0, questionCount), stems: selectedStems };
}

export function mergeUniqueQuestionIds(
  bankIds: string[],
  aiIds: string[],
  questionCount: number,
  shuffle: ShuffleFn = shuffleInPlaceCopy,
): string[] {
  const seen = new Set<string>();
  const merged: string[] = [];
  for (const id of [...bankIds, ...aiIds]) {
    if (!id || seen.has(id)) continue;
    seen.add(id);
    merged.push(id);
  }
  return shuffle(merged).slice(0, questionCount);
}

export type SelectTestOutcome = {
  questionIds: string[];
  aiGeneratedCount: number;
  status: "ok" | "shortage" | "unprocessable";
  httpStatus: number;
  code?: "QUESTION_INVENTORY_INSUFFICIENT" | "INVALID_CONFIG";
  error?: string;
  warning?: string;
  available: number;
  requested: number;
};

/**
 * Final count validation. 422 is reserved for invalid requests;
 * inventory shortfalls are 409 QUESTION_INVENTORY_INSUFFICIENT.
 */
export function decideSelectTestOutcome(input: {
  selectedIds: string[];
  questionCount: number;
  allowShortfall: boolean;
  aiFillEnabled: boolean;
  aiFillAttempted: boolean;
  aiGeneratedCount: number;
  aiFillError?: string;
  pypOnly: boolean;
}): SelectTestOutcome {
  const requested = Math.floor(Number(input.questionCount));
  const unique = [...new Set(input.selectedIds.filter(Boolean))];
  const questionIds = unique.slice(0, Number.isFinite(requested) ? Math.max(0, requested) : 0);
  const available = questionIds.length;
  const aiGeneratedCount = Math.min(Math.max(0, input.aiGeneratedCount), available);

  if (!Number.isFinite(requested) || requested < 1) {
    return {
      questionIds: [],
      aiGeneratedCount: 0,
      status: "unprocessable",
      httpStatus: 422,
      code: "INVALID_CONFIG",
      error: "Question count must be a whole number of at least 1.",
      available: 0,
      requested: Number.isFinite(requested) ? requested : 0,
    };
  }

  if (available === requested) {
    return {
      questionIds,
      aiGeneratedCount,
      status: "ok",
      httpStatus: 200,
      available,
      requested,
    };
  }

  const pypOnlyHasSet =
    input.pypOnly &&
    !input.aiFillEnabled &&
    available >= Math.min(10, requested) &&
    available > 0;

  if (pypOnlyHasSet || (input.allowShortfall && available > 0)) {
    return {
      questionIds,
      aiGeneratedCount,
      status: "ok",
      httpStatus: 200,
      warning: `Only ${available} of ${requested} questions available.`,
      available,
      requested,
    };
  }

  const afterAi = input.aiFillEnabled && input.aiFillAttempted;
  const error =
    input.aiFillError ??
    (afterAi
      ? `Only ${available} of ${requested} questions are available after bank + AI fill.`
      : `Only ${available} approved questions are available for this configuration.`);

  return {
    questionIds,
    aiGeneratedCount,
    status: "shortage",
    httpStatus: 409,
    code: "QUESTION_INVENTORY_INSUFFICIENT",
    error,
    available,
    requested,
  };
}
