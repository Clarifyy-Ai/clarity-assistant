export type PatternSnapshot = {
  total_questions: number;
  total_marks: number;
  duration_minutes: number;
  negative_mark: number;
  section_codes: string[];
};

export type PatternShift = {
  material: boolean;
  changes: string[];
  /** Multiply historical weights when material shift detected (0–1). */
  historicalWeightFactor: number;
};

export function detectPatternShift(
  previous: PatternSnapshot,
  current: PatternSnapshot,
): PatternShift {
  const changes: string[] = [];
  if (previous.total_questions !== current.total_questions) {
    changes.push("question_count");
  }
  if (previous.total_marks !== current.total_marks) {
    changes.push("total_marks");
  }
  if (previous.duration_minutes !== current.duration_minutes) {
    changes.push("duration");
  }
  if (previous.negative_mark !== current.negative_mark) {
    changes.push("negative_marking");
  }
  const prevSecs = new Set(previous.section_codes);
  const currSecs = new Set(current.section_codes);
  for (const s of currSecs) {
    if (!prevSecs.has(s)) changes.push(`section_added:${s}`);
  }
  for (const s of prevSecs) {
    if (!currSecs.has(s)) changes.push(`section_removed:${s}`);
  }

  const material = changes.length > 0;
  return {
    material,
    changes,
    historicalWeightFactor: material ? 0.35 : 1,
  };
}
