import {
  getLocalMockQuestions,
  type LocalQuestion,
  type LocalQuestionInput,
} from "@/lib/mock/localQuestionBank";
import {
  isDuplicateQuestionText,
  normalizeQuestionText,
} from "@/lib/mock/validateGeneratedQuestion";

export type FallbackSelectionInput = LocalQuestionInput & {
  excludeTexts?: ReadonlyArray<string>;
};

/**
 * Pick an approved local-bank question that has not been used in the session.
 * Never fabricates free-form AI text.
 */
export function selectFallbackQuestion(
  input: FallbackSelectionInput,
): LocalQuestion | null {
  const exclude = input.excludeTexts ?? [];
  const pool = getLocalMockQuestions({
    type: input.type,
    count: 15,
    company: input.company,
    role: input.role,
    difficulty: input.difficulty,
    skills: input.skills,
    focusAreas: input.focusAreas,
    rotateSeed: exclude.length,
  });

  for (const candidate of pool) {
    const text = normalizeQuestionText(candidate.question_text);
    if (!text) continue;
    if (isDuplicateQuestionText(text, exclude)) continue;
    return {
      ...candidate,
      question_text: text,
      question: text,
      // Explicit marker for UI / telemetry
      tags: Array.from(new Set([...(candidate.tags ?? []), "fallback_bank"])),
    };
  }

  return null;
}

export function selectFallbackQuestions(
  input: FallbackSelectionInput & { count: number },
): LocalQuestion[] {
  const exclude = [...(input.excludeTexts ?? [])];
  const selected: LocalQuestion[] = [];
  const want = Math.max(1, Math.min(input.count, 15));

  for (let i = 0; i < want; i += 1) {
    const next = selectFallbackQuestion({
      ...input,
      excludeTexts: exclude,
    });
    if (!next) break;
    selected.push(next);
    exclude.push(next.question_text);
  }

  return selected;
}
